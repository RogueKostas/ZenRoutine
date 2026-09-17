import {
  formatDuration,
  getDayName,
  getRoutineBlockDurationMinutes,
  orderedWeekDays,
} from '../../core/utils/time';
import type { DayOfWeek, RoutineBlock, WeekStartsOn } from '../../core/types';
import { blockSpansOnDay, normalizeRibbonWindow, type RibbonWindow } from '../ribbon/ribbonLayout';

// Pure logic for the Routine tab (DESIGN-2019 §4.2): the week strip and adding an activity by
// tapping empty time on the day ribbon.

// ============================================
// Week strip (p10, p25, p42)
// ============================================

export interface WeekStripCell {
  day: DayOfWeek;
  /** `M`, `T`, `W` … — the design's single letters. */
  letter: string;
  name: string;
  isToday: boolean;
  isSelected: boolean;
  /** Blocks that start on this day. */
  activityCount: number;
  plannedMinutes: number;
  accessibilityLabel: string;
}

/** Seven cells in the order the week is displayed (`weekStartsOn`, #44). */
export function weekStripCells(
  blocks: readonly RoutineBlock[],
  weekStartsOn: WeekStartsOn,
  today: DayOfWeek,
  selected: DayOfWeek
): WeekStripCell[] {
  return orderedWeekDays(weekStartsOn).map((day) => {
    const dayBlocks = blocks.filter((block) => block.dayOfWeek === day);
    const plannedMinutes = dayBlocks.reduce(
      (sum, block) => sum + getRoutineBlockDurationMinutes(block),
      0
    );
    const name = getDayName(day);
    const parts = [
      name,
      dayBlocks.length === 0
        ? 'nothing planned'
        : `${dayBlocks.length} ${dayBlocks.length === 1 ? 'activity' : 'activities'}, ${formatDuration(plannedMinutes)} planned`,
    ];
    if (day === today) parts.push('today');
    return {
      day,
      letter: name.charAt(0),
      name,
      isToday: day === today,
      isSelected: day === selected,
      activityCount: dayBlocks.length,
      plannedMinutes,
      accessibilityLabel: parts.join(', '),
    };
  });
}

// ============================================
// New activity from a tap on empty time (p13–p17)
// ============================================

/** The design samples the guide caret at quarter hours (p14 `11.15am`, p19 `7.15am`). */
export const NEW_BLOCK_SNAP_MINUTES = 15;
/** "A new activity defaults to 1 hour" (p17 `7am - 8am`). */
export const NEW_BLOCK_MINUTES = 60;

const MINUTES_PER_DAY = 1440;

const snapNearest = (minutes: number) =>
  Math.round(minutes / NEW_BLOCK_SNAP_MINUTES) * NEW_BLOCK_SNAP_MINUTES;
const snapDown = (minutes: number) =>
  Math.floor(minutes / NEW_BLOCK_SNAP_MINUTES) * NEW_BLOCK_SNAP_MINUTES;

/**
 * Start and end for a new block after a tap at `tapMinutes` on `day`'s ribbon.
 *
 * - The start is the tap rounded to the nearest quarter hour, kept inside the window.
 * - If rounding lands inside a block that starts after the tap, the start rounds down instead;
 *   while the start is inside a block, it moves to that block's end.
 * - The end is one hour later, cut short by the window's end or by the next block's start, so the
 *   new block never overlaps a neighbour.
 * - With no room before the window's end, the plain rounded hour is returned and the editor's own
 *   overlap check reports the conflict on Save.
 * - An end at midnight is stored as 0 (a block that runs to midnight), since stored minutes are 0–1439.
 */
export function newBlockTimesAt(
  tapMinutes: number,
  blocks: readonly RoutineBlock[],
  day: DayOfWeek,
  window?: RibbonWindow
): { start: number; end: number } {
  const visible = normalizeRibbonWindow(window);
  const lastStart = visible.endMinutes - NEW_BLOCK_SNAP_MINUTES;
  const clampStart = (minutes: number) => Math.min(lastStart, Math.max(visible.startMinutes, minutes));
  const raw = Math.min(visible.endMinutes, Math.max(visible.startMinutes, tapMinutes));
  const spans = blocks.flatMap((block) => blockSpansOnDay(block, day));
  const spanAt = (minutes: number) =>
    spans.find((span) => minutes >= span.startMinutes && minutes < span.endMinutes);
  const toStored = (minutes: number) => minutes % MINUTES_PER_DAY;

  const plainStart = clampStart(snapNearest(raw));
  const plain = {
    start: plainStart,
    end: toStored(Math.min(plainStart + NEW_BLOCK_MINUTES, visible.endMinutes)),
  };

  let start = plainStart;
  const hit = spanAt(start);
  if (hit && hit.startMinutes > raw) start = Math.max(visible.startMinutes, snapDown(raw));
  // Step past every block the start still falls in (back-to-back blocks included). Each step
  // moves strictly forward, so this ends.
  for (let span = spanAt(start); span; span = spanAt(start)) start = span.endMinutes;
  if (start >= visible.endMinutes) return plain;

  const nextStart = spans
    .map((span) => span.startMinutes)
    .filter((minutes) => minutes > start)
    .reduce((earliest, minutes) => Math.min(earliest, minutes), Infinity);
  const end = Math.min(start + NEW_BLOCK_MINUTES, visible.endMinutes, nextStart);
  return { start, end: toStored(end) };
}

/**
 * Times for the "+ Add activity" button: the first whole free hour on the quarter-hour grid inside
 * the window, so the new block lands where the ribbon can show it. With no free hour, the first
 * free time (as for a tap at the window's start).
 */
export function firstFreeHour(
  blocks: readonly RoutineBlock[],
  day: DayOfWeek,
  window?: RibbonWindow
): { start: number; end: number } {
  const visible = normalizeRibbonWindow(window);
  const spans = blocks.flatMap((block) => blockSpansOnDay(block, day));
  const firstStart = Math.ceil(visible.startMinutes / NEW_BLOCK_SNAP_MINUTES) * NEW_BLOCK_SNAP_MINUTES;
  for (
    let start = firstStart;
    start + NEW_BLOCK_MINUTES <= visible.endMinutes;
    start += NEW_BLOCK_SNAP_MINUTES
  ) {
    const end = start + NEW_BLOCK_MINUTES;
    const free = spans.every((span) => span.endMinutes <= start || span.startMinutes >= end);
    if (free) return { start, end: end % MINUTES_PER_DAY };
  }
  return newBlockTimesAt(visible.startMinutes, blocks, day, visible);
}
