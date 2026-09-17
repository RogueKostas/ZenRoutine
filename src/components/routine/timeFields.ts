import { formatDuration, getRoutineBlockDurationMinutes } from '../../core/utils/time';
import type { DayOfWeek, RoutineBlock } from '../../core/types';

/** Step between the times offered in a time field's dropdown. Typed times may be any minute. */
export const TIME_OPTION_STEP = 15;

/** Every time of day on a `step`-minute grid, in minutes from midnight: 0, 15, … 1425. */
export function timeOptions(step: number = TIME_OPTION_STEP): number[] {
  return Array.from({ length: Math.ceil(1440 / step) }, (_, i) => i * step);
}

/** Index of the option closest to `minutes`, so an open dropdown can scroll to it. */
export function nearestTimeOptionIndex(options: readonly number[], minutes: number): number {
  let best = 0;
  for (let i = 1; i < options.length; i++) {
    if (Math.abs(options[i] - minutes) < Math.abs(options[best] - minutes)) best = i;
  }
  return best;
}

/**
 * Duration shown beside the time fields. An end before the start is an overnight block
 * (validation and Home both support these), so it is labelled rather than rejected.
 */
export function blockDurationLabel(startMinutes: number, endMinutes: number): string {
  const duration = formatDuration(getRoutineBlockDurationMinutes({ startMinutes, endMinutes }));
  return endMinutes < startMinutes ? `${duration} (overnight)` : duration;
}

/** What a time field's typed text currently means. `revealed` once the user has left the field. */
export interface TimeDraftState {
  error?: string;
  revealed: boolean;
}

export interface TimeDrafts {
  start?: TimeDraftState;
  end?: TimeDraftState;
}

/**
 * Inline message for typed times that do not parse. Only revealed errors are shown while the user
 * is still typing; `includeHidden` is for Save, which must refuse any unparsed time.
 */
export function timeDraftMessage(drafts: TimeDrafts, includeHidden = false): string | undefined {
  const lines: string[] = [];
  const fields: [string, TimeDraftState | undefined][] = [
    ['Start', drafts.start],
    ['End', drafts.end],
  ];
  for (const [label, draft] of fields) {
    if (draft?.error && (draft.revealed || includeHidden)) lines.push(`${label}: ${draft.error}`);
  }
  return lines.length ? lines.join('\n') : undefined;
}

/** Default times for a new block: the first free hour of the day, one hour long. */
export function findNextAvailableSlot(
  blocks: readonly RoutineBlock[],
  dayOfWeek: DayOfWeek
): { start: number; end: number } {
  const dayBlocks = blocks
    .filter((b) => b.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (dayBlocks.length === 0) {
    return { start: 540, end: 600 }; // Default 9:00 - 10:00
  }

  // Try to find a gap
  let lastEnd = 0;
  for (const block of dayBlocks) {
    if (block.startMinutes - lastEnd >= 60) {
      // Found a gap of at least 1 hour
      return { start: lastEnd, end: lastEnd + 60 };
    }
    lastEnd = block.endMinutes;
  }

  // No gap found, add after the last block
  if (lastEnd < 1380) {
    return { start: lastEnd, end: lastEnd + 60 };
  }

  // Day is full, default to morning
  return { start: 540, end: 600 };
}
