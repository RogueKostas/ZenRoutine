import type { DayOfWeek, RoutineBlock, TrackingEntry, WeekStartsOn } from '../types';

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function readDateKeyParts(dateKey: string): [number, number, number] {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) throw new Error(`Invalid local date key: ${dateKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    throw new Error(`Invalid local date key: ${dateKey}`);
  }
  return [year, month, day];
}

/**
 * Convert minutes from midnight to "HH:MM" format
 */
export function minutesToTimeString(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Convert "HH:MM" format to minutes from midnight
 */
export function timeStringToMinutes(timeString: string): number {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Format minutes duration as human readable string
 */
export function formatDuration(minutes: number): string {
  // Round to avoid floating point display issues
  const totalMinutes = Math.round(minutes);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Format a live elapsed-seconds count as "M:SS" under an hour, "H:MM:SS" from an hour up.
 * Negative or non-finite input clamps to 0.
 */
export function formatElapsed(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = (total % 60).toString().padStart(2, '0');
  if (hours === 0) return `${minutes}:${secs}`;
  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs}`;
}

/**
 * Whole seconds between an ISO start time and `nowMs`. Derived from the clock on every call,
 * so a timer that was throttled in a background tab is correct as soon as it ticks again.
 */
export function getElapsedSeconds(startTime: string, nowMs: number): number {
  const start = new Date(startTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.floor((nowMs - start) / 1000));
}

/**
 * Goal progress figures, e.g. "4h / 20h". These are lifetime goal totals, so no period is
 * claimed. Without a positive estimate only the logged time is shown.
 */
export function formatGoalTimeLabel(loggedMinutes: number, estimatedMinutes?: number): string {
  const logged = formatDuration(Math.max(0, loggedMinutes));
  if (estimatedMinutes === undefined || !(estimatedMinutes > 0)) return `${logged} logged`;
  return `${logged} / ${formatDuration(estimatedMinutes)}`;
}

export type ParsedDuration = { minutes: number } | { error: string };

export const MAX_DURATION_HOURS = 10000;

const DURATION_NUMBER = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
const HOUR_UNIT = '(?:hours|hour|hrs|hr|h)';
const MINUTE_UNIT = '(?:minutes|minute|mins|min|m)';
const MINUTES_ONLY = new RegExp(`^${DURATION_NUMBER}\\s*${MINUTE_UNIT}$`);
const HOURS_AND_MINUTES = new RegExp(
  `^${DURATION_NUMBER}\\s*${HOUR_UNIT}(?:\\s*(\\d+)\\s*${MINUTE_UNIT}?)?$`
);
const BARE_HOURS = new RegExp(`^${DURATION_NUMBER}$`);
const CLOCK = /^(\d+):(\d{2})$/;

/**
 * Parse a typed duration such as "12h", "90 min", "1h 30m" or "1:30" into minutes.
 * A bare number means hours, as in the 2019 design ("10" reads back as "10hrs").
 */
export function parseDuration(input: string): ParsedDuration {
  const text = input.trim().toLowerCase();
  if (!text) return { error: 'Enter a duration, e.g. 12h or 90m.' };
  if (text.startsWith('-')) return { error: 'Duration must be greater than zero.' };

  let hours = 0;
  let minutes = 0;
  let match: RegExpExecArray | null;
  if ((match = CLOCK.exec(text))) {
    hours = Number(match[1]);
    minutes = Number(match[2]);
  } else if ((match = MINUTES_ONLY.exec(text))) {
    minutes = Number(match[1]);
  } else if ((match = HOURS_AND_MINUTES.exec(text))) {
    hours = Number(match[1]);
    if (match[2] !== undefined) {
      if (!Number.isInteger(hours)) {
        return { error: 'Use whole hours when adding minutes, e.g. 1h30m.' };
      }
      minutes = Number(match[2]);
    }
  } else if ((match = BARE_HOURS.exec(text))) {
    hours = Number(match[1]);
  } else {
    return { error: `Couldn't read "${input.trim()}". Try 12h, 90m or 1h30.` };
  }

  // Group 2 is the minutes that follow hours, in both "1h30" and "1:30".
  if (match[2] !== undefined && minutes >= 60) {
    return { error: 'Minutes after the hours must be under 60.' };
  }
  // Fractional input ("1.01h", "90.5m") rounds to the nearest whole minute, because goals
  // store whole minutes. Anything that rounds to zero is rejected below.
  const total = Math.round(hours * 60 + minutes);
  if (total <= 0) return { error: 'Duration must be greater than zero.' };
  if (total > MAX_DURATION_HOURS * 60) {
    return { error: `Duration can't be more than ${MAX_DURATION_HOURS.toLocaleString('en-US')} hours.` };
  }
  return { minutes: total };
}

/**
 * Get day name from day of week number
 */
export function getDayName(dayOfWeek: number, short: boolean = false): string {
  const days = short 
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek];
}

/** Format a calendar date without converting it through UTC. */
export function toLocalDateKey(date: Date = new Date(), timeZone?: string): string {
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value;
    const year = part('year');
    const month = part('month');
    const day = part('day');
    if (!year || !month || !day) throw new Error('Unable to format the local date.');
    return `${year}-${month}-${day}`;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parse a YYYY-MM-DD key as a local calendar date at noon to avoid DST edges. */
export function parseLocalDateKey(dateKey: string): Date {
  const [year, month, day] = readDateKeyParts(dateKey);
  const date = new Date(year, month - 1, day, 12);
  if (toLocalDateKey(date) !== dateKey) throw new Error(`Invalid local date key: ${dateKey}`);
  return date;
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const date = parseLocalDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

export function differenceInCalendarDays(fromDateKey: string, toDateKey: string): number {
  const readUtcDay = (dateKey: string) => {
    const [year, month, day] = readDateKeyParts(dateKey);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((readUtcDay(toDateKey) - readUtcDay(fromDateKey)) / 86400000);
}

/** The first day of the local week containing `date`, as a YYYY-MM-DD key. */
export function getLocalWeekStartDateKey(
  date: Date = new Date(),
  weekStartsOn: WeekStartsOn = DEFAULT_WEEK_STARTS_ON
): string {
  return toLocalDateKey(getWeekStart(date, weekStartsOn));
}

export function getRoutineBlockDurationMinutes(
  block: Pick<RoutineBlock, 'startMinutes' | 'endMinutes'>
): number {
  const duration = block.endMinutes - block.startMinutes;
  return duration < 0 ? duration + 1440 : duration;
}

export type TrackedTimeEntry = Pick<TrackingEntry, 'startTime' | 'endTime' | 'pauses'>;

/** A span of time in epoch milliseconds, start < end. */
export interface TimeSpan {
  start: number;
  end: number;
}

/**
 * The spans of an entry that were actually tracked (#54): from its start to its end, minus its
 * pauses. A running entry runs to `nowMs`; without `nowMs` it has no tracked time yet. An open
 * pause runs to the entry's end (or `nowMs`). Pauses are clamped to the entry, so a pause that
 * strays outside it (a moved clock) can never add time, only fail to remove it.
 */
export function getTrackedSpans(entry: TrackedTimeEntry, nowMs?: number): TimeSpan[] {
  const start = Date.parse(entry.startTime);
  const end = entry.endTime !== undefined ? Date.parse(entry.endTime) : nowMs;
  if (end === undefined || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return [];
  }
  const pauses = (entry.pauses ?? [])
    .map((pause) => ({
      start: Math.max(start, Date.parse(pause.start)),
      end: Math.min(end, pause.end !== undefined ? Date.parse(pause.end) : end),
    }))
    .filter((pause) => Number.isFinite(pause.start) && Number.isFinite(pause.end) && pause.end > pause.start)
    .sort((left, right) => left.start - right.start);
  const spans: TimeSpan[] = [];
  let cursor = start;
  for (const pause of pauses) {
    if (pause.start > cursor) spans.push({ start: cursor, end: pause.start });
    cursor = Math.max(cursor, pause.end);
  }
  if (end > cursor) spans.push({ start: cursor, end });
  return spans;
}

/** Tracked milliseconds of an entry: (end − start) − paused time. See `getTrackedSpans`. */
export function getTrackedMilliseconds(entry: TrackedTimeEntry, nowMs?: number): number {
  return getTrackedSpans(entry, nowMs).reduce((total, span) => total + span.end - span.start, 0);
}

/**
 * Whole tracked seconds of a running or finished entry at `nowMs`, excluding pauses. The live
 * timer's count: it stands still while the entry is paused.
 */
export function getTrackedSeconds(entry: TrackedTimeEntry, nowMs: number): number {
  return Math.max(0, Math.floor(getTrackedMilliseconds(entry, nowMs) / 1000));
}

/** Whether the entry is running with an open pause. */
export function isTrackingEntryPaused(entry: Pick<TrackingEntry, 'endTime' | 'pauses'>): boolean {
  if (entry.endTime !== undefined) return false;
  const last = entry.pauses?.[entry.pauses.length - 1];
  return last !== undefined && last.end === undefined;
}

/**
 * A finished entry's tracked minutes: (end − start) − paused time (#54), rounded once, so an
 * entry that was never paused keeps exactly the duration it always had. A running entry is 0.
 */
export function getTrackingEntryDurationMinutes(entry: TrackedTimeEntry): number {
  if (!entry.endTime) return 0;
  return Math.max(0, Math.round(getTrackedMilliseconds(entry) / 60000));
}

// ============================================
// Week start (#44)
//
// Stored `DayOfWeek` keeps 0 = Sunday. These helpers are the only place the display order and
// the week boundary are derived from the user's `weekStartsOn` preference.
// ============================================

/** Monday, per the 2019 design's `M T W T F S S` week strip (decision 5). */
export const DEFAULT_WEEK_STARTS_ON: WeekStartsOn = 1;

/** The seven stored day numbers in the order the week is displayed. */
export function orderedWeekDays(weekStartsOn: WeekStartsOn): DayOfWeek[] {
  return Array.from({ length: 7 }, (_, index) => ((weekStartsOn + index) % 7) as DayOfWeek);
}

/** Zero-based display column of a stored day number (0 = first day of the displayed week). */
export function getWeekdayColumn(dayOfWeek: number, weekStartsOn: WeekStartsOn): number {
  return (dayOfWeek - weekStartsOn + 7) % 7;
}

/** Local noon on the first day of the week containing `date`. Noon avoids DST edges. */
export function getWeekStart(date: Date, weekStartsOn: WeekStartsOn): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  start.setDate(start.getDate() - getWeekdayColumn(start.getDay(), weekStartsOn));
  return start;
}

/**
 * The 42 dates (six rows of seven) of a month grid whose columns follow `weekStartsOn`.
 * Dates are local noon, so a date's column is always `getWeekdayColumn(date.getDay(), ...)`.
 */
export function getMonthGridDates(year: number, month: number, weekStartsOn: WeekStartsOn): Date[] {
  const first = getWeekStart(new Date(year, month, 1, 12), weekStartsOn);
  return Array.from({ length: 42 }, (_, index) =>
    new Date(first.getFullYear(), first.getMonth(), first.getDate() + index, 12)
  );
}

// --- Typed time-of-day input (#45) ---

export type ParsedTimeOfDay = { minutes: number } | { error: string };

const TIME_OF_DAY_PATTERN = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a|p)?$/;
const TIME_OF_DAY_HINT = 'Enter a time like 7:15am or 19:30';

/**
 * Parse a typed time of day into minutes from midnight (0–1439).
 * Accepts `7`, `7am`, `7.15am`, `7:15`, `07:15`, `19:30`, `7:30pm`, `12am` (midnight),
 * `12pm` / `noon` (noon) and `midnight`. Any minute is allowed, not only 15-minute steps.
 */
export function parseTimeOfDay(input: string): ParsedTimeOfDay {
  const text = input.trim().toLowerCase();
  if (text === 'noon') return { minutes: 720 };
  if (text === 'midnight') return { minutes: 0 };
  const match = TIME_OF_DAY_PATTERN.exec(text);
  if (!match) return { error: TIME_OF_DAY_HINT };

  let hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = match[3];
  if (minutes > 59) return { error: 'Minutes must be 00–59' };

  if (meridiem) {
    if (hours < 1 || hours > 12) return { error: 'With am/pm, the hour must be 1–12' };
    const isPm = meridiem.startsWith('p');
    if (hours === 12) hours = isPm ? 12 : 0;
    else if (isPm) hours += 12;
  } else if (hours > 23) {
    return { error: 'Hours must be 0–23' };
  }
  return { minutes: hours * 60 + minutes };
}
