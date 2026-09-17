import type { Goal, RoutineBlock } from '../types';
import {
  addDaysToDateKey,
  getRoutineBlockDurationMinutes,
  minutesToTimeString,
  toLocalDateKey,
} from '../utils/time';

/**
 * Fill-forward forecast (#52). Walks the routine forward one calendar day at a time. Each
 * block's minutes go to the goals of the block's activity type, in the order the goals were
 * given. A goal's forecast completion is the minute its remaining estimate runs out.
 *
 * - A block never names a goal (#60): `RoutineBlock.goalId` is ignored.
 * - Priority is list order (#49): `goal.priority` is never read.
 * - Pure: the only clock is `input.from`.
 * - Overnight blocks (end < start) belong to the day they start. Their minutes run past 1440
 *   on that day's scale, e.g. 22:00–02:00 on Monday is Monday 1320–1560.
 * - Minutes are wall-clock minutes. On a DST day a 4h block is still 240 minutes.
 */

const MINUTES_PER_DAY = 1440;
export const DEFAULT_FORECAST_HORIZON_DAYS = 365;

export type ForecastBlock = Pick<
  RoutineBlock,
  'dayOfWeek' | 'startMinutes' | 'endMinutes' | 'activityTypeId'
> & { id?: string };

/** Type and estimate are optional (#50); a goal without either is reported as unscheduled. */
export type ForecastGoal = Pick<Goal, 'id' | 'status' | 'loggedMinutes'> & {
  activityTypeId?: string;
  estimatedMinutes?: number;
};

export interface ForecastInput<G extends ForecastGoal = ForecastGoal> {
  /** The active routine. `null` means no capacity for anything. */
  routine: { blocks: readonly ForecastBlock[] } | null | undefined;
  /** Goals in priority order: earlier goals get a type's minutes first. */
  goals: readonly G[];
  /** Local datetime to start from. Block time before it is not available. */
  from: Date;
  /** Days to walk, counting `from`'s day as the first. Default 365. */
  horizonDays?: number;
  /** Fractions of the whole estimate, e.g. [0.25, 0.5, 0.75]. Values outside (0, 1] are ignored. */
  milestones?: readonly number[];
  /** Minutes still to do. Default `estimatedMinutes - loggedMinutes`, floored at 0. */
  remainingMinutes?: (goal: G) => number;
}

export interface ForecastPoint {
  /** Local date key of the day the minute belongs to (the block's start day). */
  date: string;
  /** Minutes from `date`'s midnight. Can pass 1440 inside an overnight block. */
  minutes: number;
  /** Local wall-clock datetime, `YYYY-MM-DDTHH:MM`, with no time zone. */
  dateTime: string;
}

export interface ForecastMilestone extends ForecastPoint {
  fraction: number;
}

export interface ForecastAllocation {
  /** Local date key of the day the block starts. */
  date: string;
  blockId?: string;
  /** The whole block on `date`'s scale (`blockEnd` > 1440 for an overnight block). */
  blockStart: number;
  blockEnd: number;
  activityTypeId: string;
  goalId: string;
  /** The slice of the block given to `goalId`, on the same scale. */
  startMinutes: number;
  endMinutes: number;
}

export type UnscheduledReason =
  | 'no-type'
  | 'no-estimate'
  | 'completed'
  | 'inactive'
  | 'no-capacity';

export interface UnscheduledGoal {
  goalId: string;
  reason: UnscheduledReason;
}

export interface ForecastResult {
  completions: Record<string, ForecastPoint>;
  milestones: Record<string, ForecastMilestone[]>;
  /** In time order; slices of one block are in goal order. */
  allocations: ForecastAllocation[];
  /** In input order. A `no-capacity` goal may still have allocations and milestones. */
  unscheduled: UnscheduledGoal[];
}

interface PendingMilestone {
  fraction: number;
  /** Done-minutes at which the milestone is reached. */
  target: number;
}

interface QueuedGoal {
  id: string;
  remaining: number;
  done: number;
  milestones: PendingMilestone[];
}

interface TypeQueue {
  goals: QueuedGoal[];
  head: number;
}

interface DayBlock {
  id?: string;
  activityTypeId: string;
  start: number;
  end: number;
}

function toPoint(date: string, minutes: number): ForecastPoint {
  const dayShift = Math.floor(minutes / MINUTES_PER_DAY);
  const wallDate = dayShift === 0 ? date : addDaysToDateKey(date, dayShift);
  const wallMinutes = minutes - dayShift * MINUTES_PER_DAY;
  return { date, minutes, dateTime: `${wallDate}T${minutesToTimeString(wallMinutes)}` };
}

function defaultRemainingMinutes(goal: ForecastGoal): number {
  return (goal.estimatedMinutes ?? 0) - goal.loggedMinutes;
}

function normaliseFractions(fractions: readonly number[] | undefined): number[] {
  if (!fractions) return [];
  const valid = fractions.filter((f) => Number.isFinite(f) && f > 0 && f <= 1);
  return [...new Set(valid)].sort((a, b) => a - b);
}

function groupBlocksByDay(blocks: readonly ForecastBlock[]): DayBlock[][] {
  const byDay: DayBlock[][] = [[], [], [], [], [], [], []];
  for (const block of blocks) {
    const duration = getRoutineBlockDurationMinutes(block);
    if (!Number.isFinite(duration) || duration <= 0 || !byDay[block.dayOfWeek]) continue;
    if (!block.activityTypeId) continue;
    byDay[block.dayOfWeek].push({
      id: block.id,
      activityTypeId: block.activityTypeId,
      start: block.startMinutes,
      end: block.startMinutes + duration,
    });
  }
  // Stable sort keeps input order for identical times.
  for (const day of byDay) day.sort((a, b) => a.start - b.start || a.end - b.end);
  return byDay;
}

export function forecastGoals<G extends ForecastGoal>(input: ForecastInput<G>): ForecastResult {
  const from = input.from;
  if (!(from instanceof Date) || !Number.isFinite(from.getTime())) {
    throw new Error('forecastGoals needs a valid `from` date.');
  }
  const horizonDays =
    input.horizonDays !== undefined && Number.isFinite(input.horizonDays)
      ? Math.max(0, Math.floor(input.horizonDays))
      : DEFAULT_FORECAST_HORIZON_DAYS;
  const fractions = normaliseFractions(input.milestones);
  const remainingOf = input.remainingMinutes ?? defaultRemainingMinutes;

  // A part-elapsed minute is not available, so start at the next whole minute.
  const partMinute = from.getSeconds() > 0 || from.getMilliseconds() > 0 ? 1 : 0;
  const fromMinute = from.getHours() * 60 + from.getMinutes() + partMinute;
  const fromDate = toLocalDateKey(from);
  const fromPoint = toPoint(fromDate, fromMinute);

  const blocksByDay = groupBlocksByDay(input.routine?.blocks ?? []);
  const typesWithCapacity = new Set(blocksByDay.flat().map((block) => block.activityTypeId));

  const result: ForecastResult = { completions: {}, milestones: {}, allocations: [], unscheduled: [] };
  const reasons = new Map<string, UnscheduledReason>();
  const queues = new Map<string, TypeQueue>();
  let openGoals = 0;

  const reachMilestones = (goal: QueuedGoal, done: number, at: (target: number) => ForecastPoint) => {
    while (goal.milestones.length > 0 && goal.milestones[0].target <= done) {
      const milestone = goal.milestones.shift()!;
      result.milestones[goal.id].push({ fraction: milestone.fraction, ...at(milestone.target) });
    }
  };

  for (const goal of input.goals) {
    if (goal.status === 'completed') {
      reasons.set(goal.id, 'completed');
      continue;
    }
    if (goal.status !== 'active') {
      reasons.set(goal.id, 'inactive');
      continue;
    }
    if (!goal.activityTypeId) {
      reasons.set(goal.id, 'no-type');
      continue;
    }
    const estimate = goal.estimatedMinutes;
    if (estimate === undefined || !Number.isFinite(estimate) || estimate <= 0) {
      reasons.set(goal.id, 'no-estimate');
      continue;
    }

    const rawRemaining = remainingOf(goal);
    const remaining = Number.isFinite(rawRemaining) ? Math.max(0, Math.ceil(rawRemaining)) : 0;
    const queued: QueuedGoal = {
      id: goal.id,
      remaining,
      done: Math.max(0, estimate - remaining),
      milestones: fractions.map((fraction) => ({ fraction, target: Math.ceil(fraction * estimate) })),
    };
    if (fractions.length > 0) result.milestones[goal.id] = [];
    reachMilestones(queued, queued.done, () => ({ ...fromPoint }));

    if (remaining === 0) {
      result.completions[goal.id] = { ...fromPoint };
      continue;
    }
    if (!typesWithCapacity.has(goal.activityTypeId)) {
      reasons.set(goal.id, 'no-capacity');
      continue;
    }
    let queue = queues.get(goal.activityTypeId);
    if (!queue) {
      queue = { goals: [], head: 0 };
      queues.set(goal.activityTypeId, queue);
    }
    queue.goals.push(queued);
    openGoals += 1;
  }

  // Start one day early so the after-midnight tail of yesterday's overnight block counts.
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1, 12);
  for (let offset = -1; offset < horizonDays && openGoals > 0; offset += 1) {
    const date = toLocalDateKey(day);
    // `from` on this day's scale: 1440 + fromMinute yesterday, fromMinute today, negative later.
    const cutoff = fromMinute - offset * MINUTES_PER_DAY;

    for (const block of blocksByDay[day.getDay()]) {
      const queue = queues.get(block.activityTypeId);
      if (!queue) continue;
      let cursor = Math.max(block.start, cutoff);

      while (cursor < block.end && queue.head < queue.goals.length) {
        const goal = queue.goals[queue.head];
        const sliceStart = cursor;
        const take = Math.min(goal.remaining, block.end - cursor);
        cursor += take;
        result.allocations.push({
          date,
          blockId: block.id,
          blockStart: block.start,
          blockEnd: block.end,
          activityTypeId: block.activityTypeId,
          goalId: goal.id,
          startMinutes: sliceStart,
          endMinutes: cursor,
        });

        const doneBefore = goal.done;
        goal.done += take;
        goal.remaining -= take;
        reachMilestones(goal, goal.done, (target) => toPoint(date, sliceStart + target - doneBefore));

        if (goal.remaining === 0) {
          result.completions[goal.id] = toPoint(date, cursor);
          queue.head += 1;
          openGoals -= 1;
        }
      }
    }
    day.setDate(day.getDate() + 1);
  }

  for (const queue of queues.values()) {
    for (let i = queue.head; i < queue.goals.length; i += 1) {
      reasons.set(queue.goals[i].id, 'no-capacity');
    }
  }
  for (const goal of input.goals) {
    const reason = reasons.get(goal.id);
    if (reason) result.unscheduled.push({ goalId: goal.id, reason });
  }
  return result;
}

/** Slices attributed to one local day, in time order (a day view's ribbon). */
export function getAllocationsForDate(
  allocations: readonly ForecastAllocation[],
  date: string
): ForecastAllocation[] {
  return allocations.filter((allocation) => allocation.date === date);
}

/**
 * The slice scheduled at `at`, if any: "which goal is scheduled now" for Home (#55).
 * Includes the after-midnight part of yesterday's overnight block.
 */
export function getScheduledAllocationAt(
  allocations: readonly ForecastAllocation[],
  at: Date
): ForecastAllocation | undefined {
  const today = toLocalDateKey(at);
  const yesterday = addDaysToDateKey(today, -1);
  const minute = at.getHours() * 60 + at.getMinutes();
  return allocations.find(
    (a) =>
      (a.date === today && a.startMinutes <= minute && minute < a.endMinutes) ||
      (a.date === yesterday &&
        a.startMinutes <= minute + MINUTES_PER_DAY &&
        minute + MINUTES_PER_DAY < a.endMinutes)
  );
}
