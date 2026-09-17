import type { Goal, TrackingEntry } from '../types';
import {
  addDaysToDateKey,
  getDayName,
  getRoutineBlockDurationMinutes,
  getTrackedMilliseconds,
  getTrackedSpans,
  getTrackingEntryDurationMinutes,
  minutesToTimeString,
  toLocalDateKey,
  type TimeSpan,
} from '../utils/time';
import {
  forecastGoals,
  type ForecastAllocation,
  type ForecastBlock,
  type ForecastGoal,
} from './forecast';

/**
 * Day Overview (#55, design p73–p74): today's scheduled goal sessions, one row per slice of a
 * routine block, in time order.
 *
 * The rows come from two runs of the fill-forward engine (#75), split at `now`:
 * - **Before now: the plan as it stood at midnight.** The engine runs from the start of today
 *   with each goal's remaining minutes as they were at midnight (`estimate - (logged -
 *   loggedToday)`), so a past slice names the goal that was planned for it, and time logged
 *   today is not counted twice. A goal completed today is still planned for its morning.
 * - **From now on: the forecast from now.** The engine runs from `now` with each goal's current
 *   remaining minutes (including the running timer), which is what the forecast calendar shows.
 *   If today's tracking ran ahead of or behind the plan, the rest of today moves with it.
 *
 * Where the two runs give the same goal on either side of `now` in one block, the slices join
 * into one row. Any part of a block that no goal fills (its type has no goal, or the goals ran
 * out) is a row with `goalId: null`.
 *
 * **Running total.** A row's `trackedMinutes` is the goal's cumulative progress at the row's end
 * (p74: "hrs tracked towards goal"):
 * - a row ending at or before now, from what happened: `loggedAtMidnight + minutes of today's
 *   entries linked to the goal, up to the row's end`;
 * - a row ending after now, if the plan is followed: `loggedNow + the goal's minutes in today's
 *   rows between now and the row's end`, where `loggedNow = goal.loggedMinutes + elapsed minutes
 *   of a running entry linked to it`.
 * So the total never goes down through the day, and the same goal twice in a day shows it
 * advancing (p74: 2.5/8hrs, then 5/8hrs).
 *
 * Minutes are on today's scale: `blockStart`/`blockEnd` of yesterday's overnight block are
 * negative (22:00 yesterday is -120), and today's overnight block runs past 1440.
 * Entries count as "today" by the local date of their start time.
 */

const MINUTES_PER_DAY = 1440;

export type DayOverviewGoal = ForecastGoal & Pick<Goal, 'name'> & { completedAt?: string };

export type DayOverviewEntry = Pick<TrackingEntry, 'startTime' | 'endTime' | 'goalId' | 'pauses'>;

export interface DayOverviewInput {
  routine: { blocks: readonly ForecastBlock[] } | null | undefined;
  /** Goals in list order. */
  goals: readonly DayOverviewGoal[];
  trackingEntries: readonly DayOverviewEntry[];
  now: Date;
}

export type DayOverviewRowState = 'past' | 'current' | 'upcoming';

export interface DayOverviewRow {
  /** The routine block this row is part of, if the block has an id. */
  blockId?: string;
  /** The whole block, on today's scale. */
  blockStart: number;
  blockEnd: number;
  /** This row's slice of the block, on today's scale. */
  startMinutes: number;
  endMinutes: number;
  activityTypeId: string;
  goalId: string | null;
  goalName: string | null;
  /** The goal's cumulative minutes at the end of this row (see the running-total rule above). */
  trackedMinutes: number;
  estimatedMinutes: number;
  state: DayOverviewRowState;
}

interface TodayBlock {
  id?: string;
  activityTypeId: string;
  /** On today's scale. */
  start: number;
  end: number;
  /** The date key the engine files this block under. */
  date: string;
  /** Minutes to add to the engine's figures to put them on today's scale. */
  shift: number;
}

interface Slice {
  goalId: string;
  start: number;
  end: number;
}

function minuteOf(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function startOfMinute(date: Date): Date {
  const copy = new Date(date.getTime());
  copy.setSeconds(0, 0);
  return copy;
}

/** Today's blocks, including the after-midnight tail of yesterday's overnight blocks. */
function getTodayBlocks(blocks: readonly ForecastBlock[], now: Date): TodayBlock[] {
  const today = toLocalDateKey(now);
  const yesterday = addDaysToDateKey(today, -1);
  const todayDay = now.getDay();
  const yesterdayDay = (todayDay + 6) % 7;
  const result: TodayBlock[] = [];
  for (const block of blocks) {
    const duration = getRoutineBlockDurationMinutes(block);
    if (!Number.isFinite(duration) || duration <= 0 || !block.activityTypeId) continue;
    const end = block.startMinutes + duration;
    if (block.dayOfWeek === todayDay) {
      result.push({
        id: block.id,
        activityTypeId: block.activityTypeId,
        start: block.startMinutes,
        end,
        date: today,
        shift: 0,
      });
    }
    if (block.dayOfWeek === yesterdayDay && end > MINUTES_PER_DAY) {
      result.push({
        id: block.id,
        activityTypeId: block.activityTypeId,
        start: block.startMinutes - MINUTES_PER_DAY,
        end: end - MINUTES_PER_DAY,
        date: yesterday,
        shift: -MINUTES_PER_DAY,
      });
    }
  }
  return result.sort((a, b) => a.start - b.start || a.end - b.end);
}

function isSameBlock(allocation: ForecastAllocation, block: TodayBlock): boolean {
  return (
    allocation.date === block.date &&
    allocation.blockStart + block.shift === block.start &&
    allocation.blockEnd + block.shift === block.end &&
    allocation.activityTypeId === block.activityTypeId &&
    allocation.blockId === block.id
  );
}

interface TodayEntry {
  goalId: string;
  /** Tracked spans, paused time left out (#54); a running entry's run to `now`. */
  spans: TimeSpan[];
}

/**
 * Minutes each goal gained from entries started today, plus a running entry's elapsed time,
 * and today's entries themselves (for "tracked by the end of a past row").
 */
function getTodayMinutes(entries: readonly DayOverviewEntry[], now: Date) {
  const today = toLocalDateKey(now);
  const loggedToday = new Map<string, number>();
  const running = new Map<string, number>();
  const todayEntries: TodayEntry[] = [];
  for (const entry of entries) {
    if (!entry.goalId) continue;
    const start = new Date(entry.startTime);
    if (!Number.isFinite(start.getTime())) continue;
    let minutes: number;
    if (entry.endTime) {
      minutes = getTrackingEntryDurationMinutes(entry);
    } else {
      // A running entry is not in `loggedMinutes` yet.
      minutes = Math.max(0, Math.floor(getTrackedMilliseconds(entry, now.getTime()) / 60000));
      running.set(entry.goalId, (running.get(entry.goalId) ?? 0) + minutes);
    }
    if (toLocalDateKey(start) === today) {
      loggedToday.set(entry.goalId, (loggedToday.get(entry.goalId) ?? 0) + minutes);
      if (minutes > 0) {
        todayEntries.push({ goalId: entry.goalId, spans: getTrackedSpans(entry, now.getTime()) });
      }
    }
  }
  return { loggedToday, running, todayEntries };
}

export function getDayOverview(input: DayOverviewInput): DayOverviewRow[] {
  const now = startOfMinute(input.now);
  const nowMinute = minuteOf(now);
  const today = toLocalDateKey(now);
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0);
  const blocks = getTodayBlocks(input.routine?.blocks ?? [], now);
  if (blocks.length === 0) return [];

  const { loggedToday, running, todayEntries } = getTodayMinutes(input.trackingEntries, now);
  const loggedNow = (goal: DayOverviewGoal) =>
    Math.max(0, goal.loggedMinutes) + (running.get(goal.id) ?? 0);
  const loggedAtMidnight = (goal: DayOverviewGoal) =>
    Math.max(0, loggedNow(goal) - (loggedToday.get(goal.id) ?? 0));
  const goalsById = new Map(input.goals.map((goal) => [goal.id, goal]));

  // A goal completed today still had its morning planned.
  const planGoals = input.goals.map((goal) =>
    goal.status === 'completed' &&
    goal.completedAt &&
    toLocalDateKey(new Date(goal.completedAt)) === today
      ? { ...goal, status: 'active' as const }
      : goal
  );
  const plan = forecastGoals({
    routine: input.routine,
    goals: planGoals,
    from: midnight,
    horizonDays: 1,
    remainingMinutes: (goal) => (goal.estimatedMinutes ?? 0) - loggedAtMidnight(goal),
  });
  const forecast = forecastGoals({
    routine: input.routine,
    goals: input.goals,
    from: now,
    horizonDays: 1,
    remainingMinutes: (goal) => (goal.estimatedMinutes ?? 0) - loggedNow(goal),
  });

  const rows: DayOverviewRow[] = [];
  for (const block of blocks) {
    const slices: Slice[] = [];
    for (const allocation of plan.allocations) {
      if (!isSameBlock(allocation, block)) continue;
      const start = allocation.startMinutes + block.shift;
      const end = Math.min(allocation.endMinutes + block.shift, nowMinute);
      if (start < end) slices.push({ goalId: allocation.goalId, start, end });
    }
    for (const allocation of forecast.allocations) {
      if (!isSameBlock(allocation, block)) continue;
      const start = allocation.startMinutes + block.shift;
      const end = allocation.endMinutes + block.shift;
      if (start < end) slices.push({ goalId: allocation.goalId, start, end });
    }
    slices.sort((a, b) => a.start - b.start);

    // Join a planned slice to the forecast slice that continues it at `now`.
    const joined: Slice[] = [];
    for (const slice of slices) {
      const last = joined[joined.length - 1];
      if (last && last.goalId === slice.goalId && last.end === slice.start) {
        joined[joined.length - 1] = { ...last, end: slice.end };
      } else {
        joined.push(slice);
      }
    }

    // Yesterday's overnight block is listed from midnight.
    let cursor = Math.max(block.start, 0);
    const pushGap = (end: number) => {
      if (cursor < end) rows.push(makeRow(block, cursor, end, null, nowMinute));
    };
    for (const slice of joined) {
      pushGap(slice.start);
      rows.push(makeRow(block, slice.start, slice.end, slice, nowMinute));
      cursor = slice.end;
    }
    pushGap(block.end);
  }

  rows.sort((a, b) => a.startMinutes - b.startMinutes || a.blockStart - b.blockStart);

  const trackedTodayBy = (goalId: string, minute: number) => {
    const until = new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate(), 0, minute).getTime();
    let total = 0;
    for (const entry of todayEntries) {
      if (entry.goalId !== goalId) continue;
      let milliseconds = 0;
      for (const span of entry.spans) {
        milliseconds += Math.max(0, Math.min(span.end, until) - span.start);
      }
      total += Math.round(milliseconds / 60000);
    }
    return total;
  };

  // Running totals: past rows from what was tracked, later rows from the forecast from now.
  const forecastSoFar = new Map<string, number>();
  for (const row of rows) {
    if (!row.goalId) continue;
    const goal = goalsById.get(row.goalId);
    if (!goal) continue;
    row.goalName = goal.name;
    row.estimatedMinutes = goal.estimatedMinutes ?? 0;
    if (row.endMinutes <= nowMinute) {
      row.trackedMinutes = loggedAtMidnight(goal) + trackedTodayBy(goal.id, row.endMinutes);
    } else {
      const afterNow = row.endMinutes - Math.max(row.startMinutes, nowMinute);
      const forecasted = (forecastSoFar.get(goal.id) ?? 0) + afterNow;
      forecastSoFar.set(goal.id, forecasted);
      row.trackedMinutes = loggedNow(goal) + forecasted;
    }
  }
  return rows;
}

function makeRow(
  block: TodayBlock,
  start: number,
  end: number,
  slice: Slice | null,
  nowMinute: number
): DayOverviewRow {
  return {
    blockId: block.id,
    blockStart: block.start,
    blockEnd: block.end,
    startMinutes: start,
    endMinutes: end,
    activityTypeId: block.activityTypeId,
    goalId: slice?.goalId ?? null,
    goalName: null,
    trackedMinutes: 0,
    estimatedMinutes: 0,
    state: end <= nowMinute ? 'past' : start <= nowMinute ? 'current' : 'upcoming',
  };
}

export type ScheduleFocus =
  | { kind: 'now'; row: DayOverviewRow }
  | { kind: 'next'; row: DayOverviewRow }
  | { kind: 'none' };

/** What Home's primary card offers (#56): the row scheduled now, else the next one today. */
export function getScheduleFocus(rows: readonly DayOverviewRow[]): ScheduleFocus {
  const current = rows.find((row) => row.state === 'current');
  if (current) return { kind: 'now', row: current };
  const next = rows.find((row) => row.state === 'upcoming');
  if (next) return { kind: 'next', row: next };
  return { kind: 'none' };
}

/** The `startTracking` payload for a Day Overview row: linked to its goal and its block. */
export function getScheduledStart(row: DayOverviewRow): {
  activityTypeId: string;
  goalId?: string;
  routineBlockId?: string;
  source: 'scheduled';
} {
  return {
    activityTypeId: row.activityTypeId,
    goalId: row.goalId ?? undefined,
    routineBlockId: row.blockId,
    source: 'scheduled',
  };
}

/** A minute on today's scale as a wall-clock time, e.g. -120 → "22:00", 1560 → "02:00". */
export function formatDayMinute(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return minutesToTimeString(wrapped);
}

/** "13:00–17:30" */
export function formatRowTimeRange(row: Pick<DayOverviewRow, 'startMinutes' | 'endMinutes'>): string {
  return `${formatDayMinute(row.startMinutes)}–${formatDayMinute(row.endMinutes)}`;
}

/** Hours with at most one decimal, e.g. 150 → "2.5", 480 → "8". */
export function formatHours(minutes: number): string {
  const hours = Math.round((Math.max(0, minutes) / 60) * 10) / 10;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/** The design's `(tracked/estimated hrs)`, as "2.5/8h". Empty for a row with no goal. */
export function formatRowProgress(
  row: Pick<DayOverviewRow, 'goalId' | 'trackedMinutes' | 'estimatedMinutes'>
): string {
  if (!row.goalId || !(row.estimatedMinutes > 0)) return '';
  return `${formatHours(row.trackedMinutes)}/${formatHours(row.estimatedMinutes)}h`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Home's one-line header (#56): "Thursday 17 September · 17:12". */
export function formatHomeClock(now: Date): string {
  return `${getDayName(now.getDay())} ${now.getDate()} ${MONTHS[now.getMonth()]} · ${minutesToTimeString(minuteOf(now))}`;
}
