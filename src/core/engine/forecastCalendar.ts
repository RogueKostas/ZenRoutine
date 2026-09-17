import type { WeekStartsOn } from '../types';
import {
  addDaysToDateKey,
  getMonthGridDates,
  getRoutineBlockDurationMinutes,
  getWeekStart,
  minutesToTimeString,
  parseLocalDateKey,
  toLocalDateKey,
} from '../utils/time';
import {
  DEFAULT_FORECAST_HORIZON_DAYS,
  forecastGoals,
  type ForecastBlock,
  type ForecastGoal,
  type ForecastResult,
  type UnscheduledGoal,
} from './forecast';

/**
 * The forecast calendar's data (#52, DESIGN-2019 §4.5 p69): which goals complete on which day,
 * and which goal fills which block. Everything here is pure; the screen only draws it.
 *
 * Goals are tolerated without a type or an estimate (#50): they never appear on the calendar and
 * are counted in the unscheduled summary instead.
 */

const MINUTES_PER_DAY = 1440;

/** The % milestones the granularity toggle adds (p69: "just goal completion or % milestones"). */
export const FORECAST_CALENDAR_MILESTONES: readonly number[] = [0.25, 0.5, 0.75];

export type ForecastGranularity = 'completions' | 'milestones';

export const FORECAST_GRANULARITIES: readonly { key: ForecastGranularity; label: string }[] = [
  { key: 'completions', label: 'Completions' },
  { key: 'milestones', label: 'Completions + milestones' },
];

export type CalendarZoom = 'month' | 'week' | 'day';

/** Month is the default (p69); week and day zoom come from review 27:00. */
export const CALENDAR_ZOOMS: readonly { key: CalendarZoom; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'week', label: 'Week' },
  { key: 'day', label: 'Day' },
];

export type CalendarGoal = ForecastGoal & { name: string; order?: number };

export interface CalendarTypeRef {
  id: string;
  name: string;
}

export interface CalendarFilter {
  /** One activity type, or `null` for all (p69). */
  typeId: string | null;
  granularity: ForecastGranularity;
}

export const DEFAULT_CALENDAR_FILTER: CalendarFilter = { typeId: null, granularity: 'completions' };

// ============================================
// The forecast the calendar draws
// ============================================

/** Goals in list order (#49); a goal without `order` keeps its array position. Stable. */
export function sortCalendarGoals<G extends CalendarGoal>(goals: readonly G[]): G[] {
  return goals
    .map((goal, index) => ({ goal, index }))
    .sort(
      (left, right) =>
        (left.goal.order ?? left.index) - (right.goal.order ?? right.index) || left.index - right.index
    )
    .map(({ goal }) => goal);
}

/** The whole-year forecast with milestones, in list order. Granularity only filters what is shown. */
export function computeCalendarForecast(
  routine: { blocks: readonly ForecastBlock[] } | null | undefined,
  goals: readonly CalendarGoal[],
  from: Date
): ForecastResult {
  return forecastGoals({
    routine,
    goals: sortCalendarGoals(goals),
    from,
    horizonDays: DEFAULT_FORECAST_HORIZON_DAYS,
    milestones: FORECAST_CALENDAR_MILESTONES,
  });
}

/** Recompute when a key's identity changes, or when the clock moves to another hour. */
export function forecastClockKey(from: Date): string {
  return `${toLocalDateKey(from)}T${String(from.getHours()).padStart(2, '0')}`;
}

export interface CalendarForecast {
  result: ForecastResult;
  /** The instant the cached forecast was walked from; free time is measured from it too. */
  from: Date;
}

/**
 * A one-entry cache for the forecast (up to 365 days of walking). The store replaces the routine,
 * goals or tracking array whenever any of them changes (logging time updates `loggedMinutes`, so
 * it replaces `goals`), so identity is the version.
 */
export function createForecastMemo(compute: typeof computeCalendarForecast = computeCalendarForecast) {
  let last:
    | {
        routine: unknown;
        goals: unknown;
        trackingVersion: unknown;
        clock: string;
        forecast: CalendarForecast;
      }
    | undefined;
  return (
    routine: { blocks: readonly ForecastBlock[] } | null | undefined,
    goals: readonly CalendarGoal[],
    trackingVersion: unknown,
    from: Date
  ): CalendarForecast => {
    const clock = forecastClockKey(from);
    if (
      last &&
      last.routine === routine &&
      last.goals === goals &&
      last.trackingVersion === trackingVersion &&
      last.clock === clock
    ) {
      return last.forecast;
    }
    const forecast = { result: compute(routine, goals, from), from };
    last = { routine, goals, trackingVersion, clock, forecast };
    return forecast;
  };
}

// ============================================
// Entries: completions and milestones per date
// ============================================

export interface CalendarEntry {
  key: string;
  goalId: string;
  goalName: string;
  activityTypeId?: string;
  kind: 'completion' | 'milestone';
  /** 1 for a completion. */
  fraction: number;
  /** Minutes from the entry date's midnight; orders entries within a day. */
  minutes: number;
  /** '' for a completion (drawn with a tick); `50%` for a milestone, drawn in place of the tick. */
  badge: string;
}

export function milestoneBadge(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function matchesType(typeId: string | null, activityTypeId: string | undefined): boolean {
  return typeId === null || activityTypeId === typeId;
}

/**
 * Forecast entries grouped by local date. Each day's entries are in time order, then list order.
 * Milestones appear only with the `milestones` granularity, and never one the goal's logged time
 * has already passed.
 */
export function buildForecastEntriesByDate(
  forecast: ForecastResult,
  goals: readonly CalendarGoal[],
  filter: CalendarFilter
): Map<string, CalendarEntry[]> {
  const byDate = new Map<string, (CalendarEntry & { rank: number })[]>();
  const push = (date: string, entry: CalendarEntry & { rank: number }) => {
    const list = byDate.get(date);
    if (list) list.push(entry);
    else byDate.set(date, [entry]);
  };

  sortCalendarGoals(goals).forEach((goal, rank) => {
    if (!matchesType(filter.typeId, goal.activityTypeId)) return;
    const base = { goalId: goal.id, goalName: goal.name, activityTypeId: goal.activityTypeId, rank };

    if (filter.granularity === 'milestones') {
      const estimate = goal.estimatedMinutes ?? 0;
      for (const milestone of forecast.milestones[goal.id] ?? []) {
        if (Math.ceil(milestone.fraction * estimate) <= goal.loggedMinutes) continue;
        push(milestone.date, {
          ...base,
          key: `${goal.id}:${milestone.fraction}`,
          kind: 'milestone',
          fraction: milestone.fraction,
          minutes: milestone.minutes,
          badge: milestoneBadge(milestone.fraction),
        });
      }
    }

    const completion = forecast.completions[goal.id];
    if (completion) {
      push(completion.date, {
        ...base,
        key: `${goal.id}:done`,
        kind: 'completion',
        fraction: 1,
        minutes: completion.minutes,
        badge: '',
      });
    }
  });

  const result = new Map<string, CalendarEntry[]>();
  for (const [date, entries] of byDate) {
    entries.sort((left, right) => left.minutes - right.minutes || left.rank - right.rank);
    result.set(date, entries.map(({ rank: _rank, ...entry }) => entry));
  }
  return result;
}

// ============================================
// Month view
// ============================================

export interface MonthCell {
  date: string;
  dayOfMonth: number;
  /** Days outside the month are faded but still carry entries (p69 shows one on 30 Aug). */
  inMonth: boolean;
  isToday: boolean;
  entries: CalendarEntry[];
}

/**
 * The month grid in the user's week order, with only as many rows as the month needs
 * (p69 has five).
 */
export function buildMonthCells(
  year: number,
  month: number,
  weekStartsOn: WeekStartsOn,
  entriesByDate: ReadonlyMap<string, CalendarEntry[]>,
  today: string
): MonthCell[] {
  const dates = getMonthGridDates(year, month, weekStartsOn);
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const leading = dates.findIndex((date) => date.getMonth() === month);
  const rows = Math.ceil((leading + daysInMonth) / 7);
  return dates.slice(0, rows * 7).map((date) => {
    const key = toLocalDateKey(date);
    return {
      date: key,
      dayOfMonth: date.getDate(),
      inMonth: date.getMonth() === month,
      isToday: key === today,
      entries: entriesByDate.get(key) ?? [],
    };
  });
}

/** Below this cell width, names collapse to dots with a count (p69 at phone width). */
export const MONTH_CELL_NAME_MIN_WIDTH = 96;
export const MONTH_CELL_MAX_NAMES = 3;
export const MONTH_CELL_MAX_DOTS = 4;

export type MonthCellDisplay =
  | { mode: 'names'; shown: CalendarEntry[]; more: number }
  | { mode: 'dots'; shown: CalendarEntry[]; count: number };

export function monthCellDisplay(entries: readonly CalendarEntry[], cellWidthPx: number): MonthCellDisplay {
  if (cellWidthPx >= MONTH_CELL_NAME_MIN_WIDTH) {
    const shown = entries.slice(0, MONTH_CELL_MAX_NAMES);
    return { mode: 'names', shown, more: entries.length - shown.length };
  }
  return { mode: 'dots', shown: entries.slice(0, MONTH_CELL_MAX_DOTS), count: entries.length };
}

// ============================================
// Week and day slices
// ============================================

export interface CalendarSlice {
  key: string;
  date: string;
  /** `null` for block time no goal is forecast to use. */
  goalId: string | null;
  /** The goal's name, or the activity type's name for free time. */
  label: string;
  activityTypeId: string;
  /** On `date`'s scale. An overnight slice runs past 1440; a carry-over starts at 0. */
  startMinutes: number;
  endMinutes: number;
  timeRange: string;
  /** The goal's estimate runs out at the end of this slice. */
  completes: boolean;
  /** Milestones reached inside this slice (only with the `milestones` granularity). */
  milestones: number[];
  /** The after-midnight part of the previous day's overnight slice. */
  carryover: boolean;
}

export function formatSliceTime(minutes: number): string {
  return minutesToTimeString(((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY);
}

export function formatSliceRange(startMinutes: number, endMinutes: number): string {
  return `${formatSliceTime(startMinutes)}–${formatSliceTime(endMinutes)}`;
}

/** A day-view list row: `09:00–11:00 · Design FTUE (done)`. */
export function formatSliceLine(slice: CalendarSlice): string {
  const notes = slice.milestones.map(milestoneBadge);
  if (slice.completes) notes.push('done');
  if (slice.goalId === null) notes.push('no goal');
  const suffix = notes.length > 0 ? ` (${notes.join(', ')})` : '';
  return `${slice.timeRange} · ${slice.label}${suffix}`;
}

export interface DaySliceOptions {
  /** Activity types, for naming free time. */
  activityTypes?: readonly CalendarTypeRef[];
  /** With the routine and `from`, block time after `from` that no goal uses is listed too. */
  routine?: { blocks: readonly ForecastBlock[] } | null;
  from?: Date;
}

function goalSlicesFor(
  forecast: ForecastResult,
  goalsById: ReadonlyMap<string, CalendarGoal>,
  date: string,
  filter: CalendarFilter,
  shift: number
): CalendarSlice[] {
  const slices: CalendarSlice[] = [];
  for (const allocation of forecast.allocations) {
    if (allocation.date !== date || !matchesType(filter.typeId, allocation.activityTypeId)) continue;
    const start = allocation.startMinutes - shift;
    const end = allocation.endMinutes - shift;
    if (end <= 0) continue;
    const completion = forecast.completions[allocation.goalId];
    const milestones =
      filter.granularity === 'milestones'
        ? (forecast.milestones[allocation.goalId] ?? [])
            .filter(
              (m) =>
                m.date === date &&
                m.minutes > allocation.startMinutes &&
                m.minutes <= allocation.endMinutes
            )
            .map((m) => m.fraction)
        : [];
    const carryover = shift > 0;
    slices.push({
      key: `${date}:${allocation.goalId}:${allocation.startMinutes}`,
      date,
      goalId: allocation.goalId,
      label: goalsById.get(allocation.goalId)?.name ?? 'Unknown goal',
      activityTypeId: allocation.activityTypeId,
      startMinutes: Math.max(0, start),
      endMinutes: end,
      timeRange: formatSliceRange(Math.max(0, start), end),
      completes:
        completion !== undefined &&
        completion.date === date &&
        completion.minutes === allocation.endMinutes,
      milestones,
      carryover,
    });
  }
  return slices;
}

function freeSlicesFor(
  forecast: ForecastResult,
  date: string,
  filter: CalendarFilter,
  options: DaySliceOptions
): CalendarSlice[] {
  const { routine, from } = options;
  if (!routine || !from) return [];
  const dayOfWeek = parseLocalDateKey(date).getDay();
  const fromDate = toLocalDateKey(from);
  if (date < fromDate) return [];
  const cutoff =
    date === fromDate
      ? from.getHours() * 60 + from.getMinutes() + (from.getSeconds() > 0 || from.getMilliseconds() > 0 ? 1 : 0)
      : 0;
  const typeName = (id: string) => options.activityTypes?.find((type) => type.id === id)?.name ?? 'Unknown activity';

  const slices: CalendarSlice[] = [];
  for (const block of routine.blocks) {
    if (block.dayOfWeek !== dayOfWeek || !block.activityTypeId) continue;
    if (!matchesType(filter.typeId, block.activityTypeId)) continue;
    const duration = getRoutineBlockDurationMinutes(block);
    if (!Number.isFinite(duration) || duration <= 0) continue;
    const blockStart = block.startMinutes;
    const blockEnd = blockStart + duration;
    const used = forecast.allocations
      .filter(
        (a) =>
          a.date === date &&
          a.activityTypeId === block.activityTypeId &&
          a.blockStart === blockStart &&
          a.blockEnd === blockEnd &&
          (a.blockId === undefined || block.id === undefined || a.blockId === block.id)
      )
      .map((a) => [a.startMinutes, a.endMinutes] as const)
      .sort((left, right) => left[0] - right[0]);

    let cursor = Math.max(blockStart, cutoff);
    const gaps: [number, number][] = [];
    for (const [usedStart, usedEnd] of used) {
      if (usedStart > cursor) gaps.push([cursor, usedStart]);
      cursor = Math.max(cursor, usedEnd);
    }
    if (cursor < blockEnd) gaps.push([cursor, blockEnd]);

    for (const [start, end] of gaps) {
      slices.push({
        key: `${date}:free:${block.id ?? blockStart}:${start}`,
        date,
        goalId: null,
        label: typeName(block.activityTypeId),
        activityTypeId: block.activityTypeId,
        startMinutes: start,
        endMinutes: end,
        timeRange: formatSliceRange(start, end),
        completes: false,
        milestones: [],
        carryover: false,
      });
    }
  }
  return slices;
}

/**
 * One day's slices in time order: which goal occupies which block (plan exit criterion 2).
 * Includes the after-midnight part of the previous day's overnight slices, and, when the
 * routine and `from` are given, the block time no goal is forecast to use.
 */
export function buildDaySlices(
  forecast: ForecastResult,
  goals: readonly CalendarGoal[],
  date: string,
  filter: CalendarFilter,
  options: DaySliceOptions = {}
): CalendarSlice[] {
  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  const previous = addDaysToDateKey(date, -1);
  const slices = [
    ...goalSlicesFor(forecast, goalsById, previous, filter, MINUTES_PER_DAY).map((slice) => ({
      ...slice,
      date,
    })),
    ...goalSlicesFor(forecast, goalsById, date, filter, 0),
    ...freeSlicesFor(forecast, date, filter, options),
  ];
  return slices.sort(
    (left, right) =>
      left.startMinutes - right.startMinutes ||
      Number(right.carryover) - Number(left.carryover) ||
      left.endMinutes - right.endMinutes
  );
}

/**
 * Slices as ribbon blocks for `DayRibbon` (no `day` prop): each is clipped to the displayed day,
 * and its `id` is the slice key so `labelFor` can name the goal.
 */
export function slicesToRibbonBlocks(slices: readonly CalendarSlice[]): {
  id: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startMinutes: number;
  endMinutes: number;
  activityTypeId: string;
}[] {
  return slices
    .filter((slice) => slice.startMinutes < MINUTES_PER_DAY)
    .map((slice) => ({
      id: slice.key,
      dayOfWeek: parseLocalDateKey(slice.date).getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      startMinutes: slice.startMinutes,
      endMinutes: Math.min(slice.endMinutes, MINUTES_PER_DAY),
      activityTypeId: slice.activityTypeId,
    }));
}

/** The ribbon's window: 7am–11pm (p13), widened to whole hours to show every slice. */
export function dayRibbonWindow(slices: readonly CalendarSlice[]): {
  startMinutes: number;
  endMinutes: number;
} {
  let start = 7 * 60;
  let end = 23 * 60;
  for (const slice of slices) {
    start = Math.min(start, Math.floor(slice.startMinutes / 60) * 60);
    end = Math.max(end, Math.ceil(Math.min(slice.endMinutes, MINUTES_PER_DAY) / 60) * 60);
  }
  return { startMinutes: Math.max(0, start), endMinutes: Math.min(MINUTES_PER_DAY, end) };
}

export interface WeekDay {
  date: string;
  isToday: boolean;
  entries: CalendarEntry[];
  slices: CalendarSlice[];
}

/** The seven days of `anchor`'s week in the user's order, each with its goal slices. */
export function buildWeekDays(
  anchor: string,
  weekStartsOn: WeekStartsOn,
  forecast: ForecastResult,
  goals: readonly CalendarGoal[],
  filter: CalendarFilter,
  entriesByDate: ReadonlyMap<string, CalendarEntry[]>,
  today: string
): WeekDay[] {
  return weekDates(anchor, weekStartsOn).map((date) => ({
    date,
    isToday: date === today,
    entries: entriesByDate.get(date) ?? [],
    slices: buildDaySlices(forecast, goals, date, filter),
  }));
}

// ============================================
// Zoom and navigation
// ============================================

export interface CalendarCursor {
  zoom: CalendarZoom;
  /** The anchor day: the viewed day, a day of the viewed week, or a day of the viewed month. */
  date: string;
}

export function weekDates(anchor: string, weekStartsOn: WeekStartsOn): string[] {
  const first = toLocalDateKey(getWeekStart(parseLocalDateKey(anchor), weekStartsOn));
  return Array.from({ length: 7 }, (_, index) => addDaysToDateKey(first, index));
}

/** Previous (−1) or next (+1) month, week or day. A month step lands on the 1st. */
export function stepCalendar(cursor: CalendarCursor, delta: number): CalendarCursor {
  switch (cursor.zoom) {
    case 'month': {
      const date = parseLocalDateKey(cursor.date);
      return { zoom: 'month', date: toLocalDateKey(new Date(date.getFullYear(), date.getMonth() + delta, 1, 12)) };
    }
    case 'week':
      return { zoom: 'week', date: addDaysToDateKey(cursor.date, 7 * delta) };
    case 'day':
      return { zoom: 'day', date: addDaysToDateKey(cursor.date, delta) };
  }
}

/**
 * Change zoom, keeping the anchor. Zooming in from a month that does not contain `today` keeps
 * the anchor (the 1st after a month step); from the current month it goes to today.
 */
export function zoomCalendar(cursor: CalendarCursor, zoom: CalendarZoom, today: string): CalendarCursor {
  if (cursor.zoom === 'month' && zoom !== 'month' && cursor.date.slice(0, 7) === today.slice(0, 7)) {
    return { zoom, date: today };
  }
  return { zoom, date: cursor.date };
}

/** Tapping a day in month or week view opens it. */
export function openCalendarDay(date: string): CalendarCursor {
  return { zoom: 'day', date };
}

export function calendarToday(cursor: CalendarCursor, today: string): CalendarCursor {
  return { zoom: cursor.zoom, date: today };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function calendarTitle(cursor: CalendarCursor, weekStartsOn: WeekStartsOn): string {
  const date = parseLocalDateKey(cursor.date);
  switch (cursor.zoom) {
    case 'month':
      return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    case 'day':
      return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    case 'week': {
      const dates = weekDates(cursor.date, weekStartsOn);
      const first = parseLocalDateKey(dates[0]);
      const last = parseLocalDateKey(dates[6]);
      const short = (d: Date) => MONTHS[d.getMonth()].slice(0, 3);
      if (first.getFullYear() !== last.getFullYear()) {
        return `${first.getDate()} ${short(first)} ${first.getFullYear()} – ${last.getDate()} ${short(last)} ${last.getFullYear()}`;
      }
      if (first.getMonth() !== last.getMonth()) {
        return `${first.getDate()} ${short(first)} – ${last.getDate()} ${short(last)} ${last.getFullYear()}`;
      }
      return `${first.getDate()}–${last.getDate()} ${short(last)} ${last.getFullYear()}`;
    }
  }
}

/** The month a cursor shows, for the month grid. */
export function cursorMonth(cursor: CalendarCursor): { year: number; month: number } {
  const date = parseLocalDateKey(cursor.date);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** A filter naming a type that no longer exists falls back to all. */
export function resolveTypeFilter(
  typeId: string | null,
  activityTypes: readonly CalendarTypeRef[]
): string | null {
  return typeId !== null && activityTypes.some((type) => type.id === typeId) ? typeId : null;
}

// ============================================
// Goals with no forecast
// ============================================

export type NoForecastReason = 'no-type' | 'no-estimate' | 'no-routine-time' | 'beyond-horizon';

export interface NoForecastItem {
  goalId: string;
  goalName: string;
  reason: NoForecastReason;
  text: string;
}

export interface UnscheduledSummary {
  total: number;
  /** `3 goals have no forecast: 1 has no type, 2 have no routine time`; empty when total is 0. */
  headline: string;
  items: NoForecastItem[];
}

const REASON_ORDER: readonly NoForecastReason[] = [
  'no-type',
  'no-estimate',
  'no-routine-time',
  'beyond-horizon',
];

function horizonText(days: number): string {
  return days === DEFAULT_FORECAST_HORIZON_DAYS ? 'a year' : `${days} days`;
}

function reasonPart(reason: NoForecastReason, count: number, horizonDays: number): string {
  const has = count === 1 ? 'has' : 'have';
  switch (reason) {
    case 'no-type':
      return `${count} ${has} no type`;
    case 'no-estimate':
      return `${count} ${has} no estimate`;
    case 'no-routine-time':
      return `${count} ${has} no routine time`;
    case 'beyond-horizon':
      return `${count} ${count === 1 ? "doesn't" : "don't"} finish within ${horizonText(horizonDays)}`;
  }
}

/**
 * Active goals the calendar cannot place (#52 deliverable 7). Completed, paused and archived goals
 * are not "missing" a forecast and are left out. With a type filter, only that type's goals count.
 */
export function summarizeUnscheduled(
  unscheduled: readonly UnscheduledGoal[],
  goals: readonly CalendarGoal[],
  routine: { blocks: readonly ForecastBlock[] } | null | undefined,
  options: {
    typeId?: string | null;
    activityTypes?: readonly CalendarTypeRef[];
    horizonDays?: number;
  } = {}
): UnscheduledSummary {
  const typeId = options.typeId ?? null;
  const horizonDays = options.horizonDays ?? DEFAULT_FORECAST_HORIZON_DAYS;
  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  const typesWithTime = new Set(
    (routine?.blocks ?? [])
      .filter((block) => block.activityTypeId && getRoutineBlockDurationMinutes(block) > 0)
      .map((block) => block.activityTypeId)
  );
  const typeName = (id: string | undefined) =>
    options.activityTypes?.find((type) => type.id === id)?.name ?? 'this type';

  const items: NoForecastItem[] = [];
  for (const { goalId, reason } of unscheduled) {
    const goal = goalsById.get(goalId);
    if (!goal || !matchesType(typeId, goal.activityTypeId)) continue;
    let mapped: NoForecastReason;
    let text: string;
    if (reason === 'no-type') {
      mapped = 'no-type';
      text = 'No activity type';
    } else if (reason === 'no-estimate') {
      mapped = 'no-estimate';
      text = 'No estimate';
    } else if (reason === 'no-capacity') {
      if (goal.activityTypeId && typesWithTime.has(goal.activityTypeId)) {
        mapped = 'beyond-horizon';
        text = `Doesn't finish within ${horizonText(horizonDays)}`;
      } else {
        mapped = 'no-routine-time';
        text = `No ${typeName(goal.activityTypeId)} time in the routine`;
      }
    } else {
      continue;
    }
    items.push({ goalId, goalName: goal.name, reason: mapped, text });
  }

  const total = items.length;
  if (total === 0) return { total, headline: '', items };
  const parts = REASON_ORDER.map((reason) => [reason, items.filter((i) => i.reason === reason).length] as const)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => reasonPart(reason, count, horizonDays));
  const headline = `${total} ${total === 1 ? 'goal has' : 'goals have'} no forecast: ${parts.join(', ')}`;
  return { total, headline, items };
}
