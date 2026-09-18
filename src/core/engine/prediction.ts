import type { Goal, Routine, TrackingEntry } from '../types';
import {
  addDaysToDateKey,
  differenceInCalendarDays,
  getRoutineBlockDurationMinutes,
  getTrackingEntryDurationMinutes,
  toLocalDateKey,
} from '../utils/time';
import { forecastGoals, type ForecastPoint } from './forecast';
import { sortGoalsByOrder } from './goalOrder';
import { isSchedulableGoal, type SchedulableGoal } from './goalList';

export interface PredictionResult {
  goalId: string;
  /** The local day the goal's estimate runs out (an overnight block's start day). */
  predictedCompletionDate: string | null;
  /** Minutes the forecast gives this goal in the seven days from now. */
  weeklyMinutesAllocated: number;
  /** Every block of the goal's activity type: the pool that type's goals are worked from. */
  activityWeeklyCapacity: number;
  /** `weeklyMinutesAllocated` as a fraction of `activityWeeklyCapacity`. */
  allocationShare: number;
  /** The other active goals of this activity type, above or below this one. */
  competingGoalCount: number;
  /** Active goals of this activity type above this one in the list: they are worked first. */
  goalsAhead: number;
  remainingMinutes: number;
  weeksRemaining: number | null;
  confidenceLevel: 'low' | 'medium' | 'high';
  evidenceDays: number;
  confidenceReason: string;
}

interface ForecastEvidence {
  confidenceLevel: PredictionResult['confidenceLevel'];
  evidenceDays: number;
  confidenceReason: string;
}

const MINUTES_PER_WEEK = 7 * 24 * 60;
/** The furthest the forecast walks, so an enormous estimate cannot stall a render. */
const MAX_PREDICTION_HORIZON_DAYS = 100 * 366;

/** Calculate the recurring weekly capacity for one activity type. */
export function getWeeklyMinutesForActivityType(
  routine: Routine,
  activityTypeId: string
): number {
  return routine.blocks
    .filter((block) => block.activityTypeId === activityTypeId)
    .reduce((sum, block) => sum + getRoutineBlockDurationMinutes(block), 0);
}

/**
 * The point from which tracking evidence counts for one activity type.
 *
 * Goals sharing an activity type are coupled — they draw on the pool of that
 * type's blocks and inherit each other's reallocations — so an activity type is
 * the boundary at which a schedule change can genuinely move a forecast. Routines
 * with no recorded per-activity change fall back to the whole-routine
 * timestamp.
 */
export function getCapacityChangedAt(routine: Routine, activityTypeId: string): string {
  return routine.capacityChangedAt?.[activityTypeId] ?? routine.updatedAt;
}

/**
 * Whose tracking counts as evidence for one goal's forecast.
 *
 * An entry linked to a *different* goal never counts. The user attributed that
 * session elsewhere, so it is evidence that the activity's time went to another
 * goal — the opposite of support for this one. Counting it let a goal the user
 * had never worked on inherit a sibling's history and display a high-confidence
 * date.
 *
 * An entry with no `goalId` counts for every goal of the activity type. That is
 * a deliberate choice, not an oversight: every block of the type feeds the pool
 * the model spends on these goals in list order, so time tracked against the
 * type without a goal is observing the pool the forecast spends. Unlinked
 * tracking is also the ordinary path, not an edge case — starting a scheduled
 * block starts an entry with no goal, since blocks never name one (#60), and the
 * quick-start goal picker offers "no goal" outright — so discarding it would
 * hold a diligent user at low confidence forever.
 *
 * Two consequences are accepted. Co-allocated goals with no linked history of
 * their own share one evidence count, which is honest: the shared pool is the
 * only thing that has been observed, and nothing distinguishes them. And because
 * deleting a goal clears `goalId` from its entries, a deleted goal's history
 * joins the unlinked pool rather than disappearing.
 */
function entryIsEvidenceForGoal(entry: TrackingEntry, goalId: string): boolean {
  return !entry.goalId || entry.goalId === goalId;
}

function getForecastEvidence(
  trackingHistory: TrackingEntry[] | undefined,
  goalId: string,
  activityTypeId: string,
  weeklyCapacity: number,
  capacityChangedAt: string
): ForecastEvidence {
  if (weeklyCapacity <= 0) {
    return {
      confidenceLevel: 'low',
      evidenceDays: 0,
      confidenceReason: 'No routine time is available to this goal.',
    };
  }

  const evidenceDays = new Set(
    (trackingHistory ?? [])
      .filter((entry) =>
        entry.activityTypeId === activityTypeId &&
        entryIsEvidenceForGoal(entry, goalId) &&
        Boolean(entry.endTime) &&
        Date.parse(entry.endTime!) >= Date.parse(capacityChangedAt) &&
        getTrackingEntryDurationMinutes(entry) > 0
      )
      .map((entry) => entry.date)
  ).size;

  if (evidenceDays >= 14) {
    return {
      confidenceLevel: 'high',
      evidenceDays,
      confidenceReason: `Based on tracking across ${evidenceDays} distinct days.`,
    };
  }
  if (evidenceDays >= 7) {
    return {
      confidenceLevel: 'medium',
      evidenceDays,
      confidenceReason: `Based on tracking across ${evidenceDays} distinct days.`,
    };
  }
  return {
    confidenceLevel: 'low',
    evidenceDays,
    confidenceReason: evidenceDays === 0
      ? 'No completed tracking days since this routine changed.'
      : `Only ${evidenceDays} distinct tracking day${evidenceDays === 1 ? '' : 's'} since this routine changed.`,
  };
}

function remainingMinutesOf(goal: SchedulableGoal): number {
  return Math.max(0, goal.estimatedMinutes - goal.loggedMinutes);
}

/**
 * Wall-clock minutes from `now` to a forecast point. `minutes` may pass 1440 in an overnight
 * block. Counted on the local clock, not in elapsed milliseconds, so a DST change in between
 * does not add or remove an hour from a forecast the routine lays out in wall-clock time.
 */
function wallClockMinutesUntil(point: ForecastPoint, now: Date): number {
  const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  return differenceInCalendarDays(toLocalDateKey(now), point.date) * 1440 + point.minutes - nowMinutes;
}

/**
 * Days the forecast has to walk for every goal to finish. Each whole week of the routine gives a
 * type exactly its weekly capacity, so the whole queue of a type is done within
 * `ceil(remaining / capacity)` weeks after the first, partly elapsed, one.
 */
function horizonDaysFor(goals: readonly SchedulableGoal[], routine: Routine): number {
  const remainingByType = new Map<string, number>();
  for (const goal of goals) {
    remainingByType.set(
      goal.activityTypeId,
      (remainingByType.get(goal.activityTypeId) ?? 0) + Math.ceil(remainingMinutesOf(goal))
    );
  }
  let days = 0;
  for (const [activityTypeId, remaining] of remainingByType) {
    const capacity = getWeeklyMinutesForActivityType(routine, activityTypeId);
    if (capacity <= 0) continue;
    days = Math.max(days, (Math.ceil(remaining / capacity) + 1) * 7 + 1);
  }
  return Math.min(days, MAX_PREDICTION_HORIZON_DAYS);
}

/**
 * Forecast active goals by walking the routine forward (`forecastGoals`, #52): each block's
 * minutes go to the goals of its activity type in list order (#49), so the top goal of a type
 * gets all of that type's time until it is done, then the next one does. The dates come from
 * that walk; confidence and its evidence are this module's own and do not depend on the order.
 *
 * `goals` are put in list order by `Goal.order` before the walk. Results come back in the order
 * the caller gave, for active goals that have both an activity type and an estimate. A goal
 * missing either (#50) is a to-do item, not scheduled work: it gets no result, and no error.
 */
export function predictAllGoals(
  goals: readonly Goal[],
  routine: Routine,
  trackingHistory?: TrackingEntry[],
  now: Date = new Date()
): PredictionResult[] {
  const activeGoals = goals.filter(
    (goal): goal is SchedulableGoal => goal.status === 'active' && isSchedulableGoal(goal)
  );
  const listOrder = sortGoalsByOrder(activeGoals);
  const forecast = forecastGoals({
    routine,
    goals: listOrder,
    from: now,
    horizonDays: horizonDaysFor(listOrder, routine),
  });

  const weekEnd = addDaysToDateKey(toLocalDateKey(now), 7);
  const minutesThisWeek = new Map<string, number>();
  for (const allocation of forecast.allocations) {
    if (allocation.date >= weekEnd) continue;
    minutesThisWeek.set(
      allocation.goalId,
      (minutesThisWeek.get(allocation.goalId) ?? 0) +
        allocation.endMinutes - allocation.startMinutes
    );
  }

  const aheadCount = new Map<string, number>();
  const typeCount = new Map<string, number>();
  for (const goal of listOrder) {
    const seen = typeCount.get(goal.activityTypeId) ?? 0;
    aheadCount.set(goal.id, seen);
    typeCount.set(goal.activityTypeId, seen + 1);
  }

  return activeGoals.map((goal) => {
    const weeklyCapacity = getWeeklyMinutesForActivityType(routine, goal.activityTypeId);
    const completion = forecast.completions[goal.id];
    const weeklyMinutesAllocated = minutesThisWeek.get(goal.id) ?? 0;
    return {
      goalId: goal.id,
      predictedCompletionDate: completion?.date ?? null,
      weeklyMinutesAllocated,
      activityWeeklyCapacity: weeklyCapacity,
      allocationShare: weeklyCapacity > 0 ? weeklyMinutesAllocated / weeklyCapacity : 0,
      competingGoalCount: (typeCount.get(goal.activityTypeId) ?? 1) - 1,
      goalsAhead: aheadCount.get(goal.id) ?? 0,
      remainingMinutes: remainingMinutesOf(goal),
      weeksRemaining: completion
        ? Math.max(0, wallClockMinutesUntil(completion, now)) / MINUTES_PER_WEEK
        : null,
      ...getForecastEvidence(
        trackingHistory,
        goal.id,
        goal.activityTypeId,
        weeklyCapacity,
        getCapacityChangedAt(routine, goal.activityTypeId)
      ),
    };
  });
}

/** The Goals screen's "How forecasts work" text. */
export const GOAL_FORECAST_EXPLAINER =
  "All of an activity type's routine blocks form one pool of time. That type's active goals " +
  'are worked in list order: the top one gets all of the time first, and the next one starts ' +
  'when it is done. Dates assume this routine and this order continue.';

/** Where a goal stands in its type's queue, for the line under its forecast. */
export function describeGoalQueue(
  prediction: Pick<PredictionResult, 'goalsAhead' | 'competingGoalCount'>
): string {
  const { goalsAhead, competingGoalCount } = prediction;
  if (goalsAhead > 0) {
    return `Next in line after ${goalsAhead} goal${goalsAhead === 1 ? '' : 's'} of this type.`;
  }
  if (competingGoalCount > 0) {
    return 'First in line: this type\'s time goes here first.';
  }
  return 'The only active goal of this type.';
}

/**
 * Predict one goal as if it were the only goal of its type, whatever its status. Product surfaces
 * should use predictAllGoals, which knows what is ahead of it in the list.
 */
export function predictGoalCompletion(
  goal: Goal,
  routine: Routine,
  trackingHistory?: TrackingEntry[],
  now: Date = new Date()
): PredictionResult {
  if (!isSchedulableGoal(goal)) {
    const activityTypeId = goal.activityTypeId;
    return {
      goalId: goal.id,
      predictedCompletionDate: null,
      weeklyMinutesAllocated: 0,
      activityWeeklyCapacity: activityTypeId
        ? getWeeklyMinutesForActivityType(routine, activityTypeId)
        : 0,
      allocationShare: 0,
      competingGoalCount: 0,
      goalsAhead: 0,
      remainingMinutes: 0,
      weeksRemaining: null,
      confidenceLevel: 'low',
      evidenceDays: 0,
      confidenceReason: activityTypeId
        ? 'No estimate, so no forecast.'
        : 'No activity type, so no routine time and no forecast.',
    };
  }
  if (remainingMinutesOf(goal) === 0) {
    const weeklyCapacity = getWeeklyMinutesForActivityType(routine, goal.activityTypeId);
    return {
      goalId: goal.id,
      predictedCompletionDate: toLocalDateKey(now),
      weeklyMinutesAllocated: 0,
      activityWeeklyCapacity: weeklyCapacity,
      allocationShare: 0,
      competingGoalCount: 0,
      goalsAhead: 0,
      remainingMinutes: 0,
      weeksRemaining: 0,
      confidenceLevel: 'low',
      evidenceDays: 0,
      confidenceReason: 'Already complete; no forecast is needed.',
    };
  }
  return predictAllGoals([{ ...goal, status: 'active' }], routine, trackingHistory, now)[0];
}
