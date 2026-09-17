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

export function getTrackingEntryDurationMinutes(
  entry: Pick<TrackingEntry, 'startTime' | 'endTime'>
): number {
  if (!entry.endTime) return 0;
  const start = new Date(entry.startTime).getTime();
  const end = new Date(entry.endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
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
