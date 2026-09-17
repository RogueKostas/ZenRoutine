import type { Goal, Routine, TrackingEntry } from '../types';
import {
  addDaysToDateKey,
  getRoutineBlockDurationMinutes,
  getTrackingEntryDurationMinutes,
  toLocalDateKey,
} from '../utils/time';

export interface PredictionResult {
  goalId: string;
  predictedCompletionDate: string | null;
  weeklyMinutesAllocated: number;
  /** Every block of the goal's activity type: the pool that type's goals share. */
  activityWeeklyCapacity: number;
  allocationShare: number;
  competingGoalCount: number;
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

interface PendingGoal {
  goal: Goal;
  remainingMinutes: number;
  weight: number;
}

/** Calculate the recurring weekly capacity for one activity type. */
export function getWeeklyMinutesForActivityType(
  routine: Routine,
  activityTypeId: string
): number {
  return routine.blocks
    .filter((block) => block.activityTypeId === activityTypeId)
    .reduce((sum, block) => sum + getRoutineBlockDurationMinutes(block), 0);
}

function priorityWeight(goal: Goal): number {
  return 6 - goal.priority;
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
 * the model divides among these goals by priority, so time tracked against the
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

function dateAfterWeeks(weeks: number): string {
  return addDaysToDateKey(toLocalDateKey(), Math.ceil(weeks * 7));
}

/** Predict one goal in isolation. Product surfaces should use predictAllGoals. */
export function predictGoalCompletion(
  goal: Goal,
  routine: Routine,
  trackingHistory?: TrackingEntry[]
): PredictionResult {
  const weeklyCapacity = getWeeklyMinutesForActivityType(routine, goal.activityTypeId);
  const remainingMinutes = Math.max(0, goal.estimatedMinutes - goal.loggedMinutes);

  if (remainingMinutes === 0) {
    return {
      goalId: goal.id,
      predictedCompletionDate: toLocalDateKey(),
      weeklyMinutesAllocated: weeklyCapacity,
      activityWeeklyCapacity: weeklyCapacity,
      allocationShare: weeklyCapacity > 0 ? 1 : 0,
      competingGoalCount: 0,
      remainingMinutes: 0,
      weeksRemaining: 0,
      confidenceLevel: 'low',
      evidenceDays: 0,
      confidenceReason: 'Already complete; no forecast is needed.',
    };
  }

  const evidence = getForecastEvidence(
    trackingHistory,
    goal.id,
    goal.activityTypeId,
    weeklyCapacity,
    getCapacityChangedAt(routine, goal.activityTypeId)
  );
  const weeksRemaining = weeklyCapacity > 0
    ? remainingMinutes / weeklyCapacity
    : null;
  return {
    goalId: goal.id,
    predictedCompletionDate: weeksRemaining === null ? null : dateAfterWeeks(weeksRemaining),
    weeklyMinutesAllocated: weeklyCapacity,
    activityWeeklyCapacity: weeklyCapacity,
    allocationShare: weeklyCapacity > 0 ? 1 : 0,
    competingGoalCount: 0,
    remainingMinutes,
    weeksRemaining,
    ...evidence,
  };
}

/**
 * Forecast every active goal of one activity type from that type's pool.
 *
 * The pool is every block of the type. The routine is made of activity types only (#60), so no
 * block is reserved for one goal: the whole pool is shared by priority weight and reallocated as
 * goals finish.
 */
function predictActivityGoals(
  goals: Goal[],
  routine: Routine,
  trackingHistory?: TrackingEntry[]
): PredictionResult[] {
  const activityTypeId = goals[0].activityTypeId;
  const weeklyCapacity = getWeeklyMinutesForActivityType(routine, activityTypeId);
  const totalWeight = goals.reduce((sum, goal) => sum + priorityWeight(goal), 0);
  const initialAllocations = new Map(
    goals.map((goal) => [goal.id, weeklyCapacity * priorityWeight(goal) / totalWeight])
  );

  if (weeklyCapacity <= 0) {
    return goals.map((goal) => ({
      goalId: goal.id,
      predictedCompletionDate: null,
      weeklyMinutesAllocated: 0,
      activityWeeklyCapacity: weeklyCapacity,
      allocationShare: 0,
      competingGoalCount: goals.length - 1,
      remainingMinutes: Math.max(0, goal.estimatedMinutes - goal.loggedMinutes),
      weeksRemaining: null,
      ...getForecastEvidence(
        trackingHistory,
        goal.id,
        activityTypeId,
        0,
        getCapacityChangedAt(routine, activityTypeId)
      ),
    }));
  }

  let elapsedWeeks = 0;
  let pending: PendingGoal[] = goals.map((goal) => ({
    goal,
    remainingMinutes: Math.max(0, goal.estimatedMinutes - goal.loggedMinutes),
    weight: priorityWeight(goal),
  }));
  const completionWeeks = new Map<string, number>();

  while (pending.length > 0) {
    const pendingWeight = pending.reduce((sum, item) => sum + item.weight, 0);
    const rates = new Map(pending.map((item) => [
      item.goal.id,
      weeklyCapacity * item.weight / pendingWeight,
    ]));
    const completable = pending.filter((item) => (rates.get(item.goal.id) ?? 0) > 0);
    if (completable.length === 0) break;
    const phaseWeeks = Math.min(...completable.map((item) =>
      item.remainingMinutes / rates.get(item.goal.id)!
    ));
    elapsedWeeks += phaseWeeks;

    const nextPending: PendingGoal[] = [];
    for (const item of pending) {
      const rate = rates.get(item.goal.id) ?? 0;
      const remainingMinutes = Math.max(0, item.remainingMinutes - rate * phaseWeeks);
      if (remainingMinutes <= 1e-7) {
        completionWeeks.set(item.goal.id, elapsedWeeks);
      } else {
        nextPending.push({ ...item, remainingMinutes });
      }
    }
    pending = nextPending;
  }

  return goals.map((goal) => {
    const weeksRemaining = completionWeeks.get(goal.id) ?? null;
    const weeklyMinutesAllocated = initialAllocations.get(goal.id) ?? 0;
    return {
      goalId: goal.id,
      predictedCompletionDate: weeksRemaining === null ? null : dateAfterWeeks(weeksRemaining),
      weeklyMinutesAllocated,
      activityWeeklyCapacity: weeklyCapacity,
      allocationShare: weeklyMinutesAllocated / weeklyCapacity,
      competingGoalCount: goals.length - 1,
      remainingMinutes: Math.max(0, goal.estimatedMinutes - goal.loggedMinutes),
      weeksRemaining,
      ...getForecastEvidence(
        trackingHistory,
        goal.id,
        activityTypeId,
        weeklyMinutesAllocated,
        getCapacityChangedAt(routine, activityTypeId)
      ),
    };
  });
}

/**
 * Forecast active goals with each activity's capacity shared by priority weight
 * (Very High 5 … Very Low 1) and reallocated as goals finish.
 */
export function predictAllGoals(
  goals: Goal[],
  routine: Routine,
  trackingHistory?: TrackingEntry[]
): PredictionResult[] {
  const activeGoals = goals.filter((goal) => goal.status === 'active');
  const byActivity = new Map<string, Goal[]>();
  for (const goal of activeGoals) {
    const group = byActivity.get(goal.activityTypeId) ?? [];
    group.push(goal);
    byActivity.set(goal.activityTypeId, group);
  }

  const predictionsByGoal = new Map<string, PredictionResult>();
  for (const activityGoals of byActivity.values()) {
    for (const prediction of predictActivityGoals(activityGoals, routine, trackingHistory)) {
      predictionsByGoal.set(prediction.goalId, prediction);
    }
  }
  return activeGoals.map((goal) => predictionsByGoal.get(goal.id)!);
}
