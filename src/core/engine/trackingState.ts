import type { RoutineBlock, TrackingEntry } from '../types';
import {
  formatDuration,
  getRoutineBlockDurationMinutes,
  getTrackedSpans,
  isTrackingEntryPaused,
  type TimeSpan,
} from '../utils/time';

/**
 * Scheduled ≠ started ≠ tracked (#54, design p77, in ink): "By default activities 'start' when
 * scheduled but do not 'track'. The user has to actively indicate that the app can start
 * tracking. The user can also pause tracking."
 *
 * A scheduled block moves through:
 * - `upcoming`: its time has not begun;
 * - `started`: its time has begun, and nothing is tracking it (never confirmed, or stopped early);
 * - `tracking`: a running entry is tracking it;
 * - `paused`: that running entry is paused;
 * - `ended`: its time is over, whatever was tracked.
 *
 * **Which entries count for a block.** Any entry of the block's activity type. An entry started
 * from the block is of its type by construction, and an entry of the same type started by hand,
 * or carried on from the block before, is the user doing what was scheduled. An entry of another
 * type is not.
 *
 * **Untracked time** (p77: "Time spent not tracking") is the part of the block's scheduled time,
 * up to now, that no counted entry tracked: before tracking began, during pauses, and after
 * tracking stopped early. Time after now is not untracked yet — it has not happened.
 *
 * Times are epoch milliseconds. Pure: `now` is always passed in.
 */

export type BlockTrackingState = 'upcoming' | 'started' | 'tracking' | 'paused' | 'ended';

/** One dated occurrence of a routine block (or of a slice of one). `start < end`. */
export interface ScheduledSpan {
  blockId?: string;
  activityTypeId: string;
  start: number;
  end: number;
}

export type TrackingStateEntry = Pick<
  TrackingEntry,
  'startTime' | 'endTime' | 'pauses' | 'activityTypeId'
>;

export interface BlockTracking {
  state: BlockTrackingState;
  /** Scheduled time up to `now` that nothing tracked, in time order. */
  untrackedSpans: TimeSpan[];
  /** Milliseconds of the block, up to `now`, that were tracked. */
  trackedMs: number;
}

function entryCountsFor(block: ScheduledSpan, entry: TrackingStateEntry): boolean {
  return entry.activityTypeId === block.activityTypeId;
}

/** `spans` merged and clipped to `window`, in time order. */
function coverWithin(spans: readonly TimeSpan[], window: TimeSpan): TimeSpan[] {
  const clipped = spans
    .map((span) => ({ start: Math.max(span.start, window.start), end: Math.min(span.end, window.end) }))
    .filter((span) => span.end > span.start)
    .sort((left, right) => left.start - right.start);
  const merged: TimeSpan[] = [];
  for (const span of clipped) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

/** `window` minus `covered` (which must be merged, sorted and inside `window`). */
function gapsIn(window: TimeSpan, covered: readonly TimeSpan[]): TimeSpan[] {
  const gaps: TimeSpan[] = [];
  let cursor = window.start;
  for (const span of covered) {
    if (span.start > cursor) gaps.push({ start: cursor, end: span.start });
    cursor = Math.max(cursor, span.end);
  }
  if (window.end > cursor) gaps.push({ start: cursor, end: window.end });
  return gaps;
}

function trackedCover(
  block: ScheduledSpan,
  entries: readonly TrackingStateEntry[],
  window: TimeSpan,
  nowMs: number
): TimeSpan[] {
  const spans = entries
    .filter((entry) => entryCountsFor(block, entry))
    .flatMap((entry) => getTrackedSpans(entry, nowMs));
  return coverWithin(spans, window);
}

export function getBlockTrackingState(
  block: ScheduledSpan,
  entries: readonly TrackingStateEntry[],
  now: Date | number
): BlockTracking {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const elapsed: TimeSpan = { start: block.start, end: Math.min(block.end, nowMs) };
  const covered = elapsed.end > elapsed.start ? trackedCover(block, entries, elapsed, nowMs) : [];
  const untrackedSpans = elapsed.end > elapsed.start ? gapsIn(elapsed, covered) : [];
  const trackedMs = covered.reduce((total, span) => total + span.end - span.start, 0);

  let state: BlockTrackingState;
  if (nowMs < block.start) {
    state = 'upcoming';
  } else if (nowMs >= block.end) {
    state = 'ended';
  } else {
    const running = entries.find(
      (entry) =>
        entry.endTime === undefined &&
        entryCountsFor(block, entry) &&
        Date.parse(entry.startTime) <= nowMs
    );
    state = !running ? 'started' : isTrackingEntryPaused(running) ? 'paused' : 'tracking';
  }
  return { state, untrackedSpans, trackedMs };
}

// ============================================
// Today's dated blocks
// ============================================

const MINUTES_PER_DAY = 1440;

function atLocalMinute(day: Date, minutes: number): number {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes).getTime();
}

/**
 * The blocks that fall on `now`'s local day, dated: today's blocks (an overnight one runs past
 * midnight) and the after-midnight tail of yesterday's overnight blocks. In start order.
 */
export function getTodayOccurrences(
  blocks: readonly Pick<RoutineBlock, 'id' | 'dayOfWeek' | 'startMinutes' | 'endMinutes' | 'activityTypeId'>[],
  now: Date
): ScheduledSpan[] {
  const today = now.getDay();
  const yesterday = (today + 6) % 7;
  const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
  const result: ScheduledSpan[] = [];
  for (const block of blocks) {
    const duration = getRoutineBlockDurationMinutes(block);
    if (!(duration > 0)) continue;
    if (block.dayOfWeek === today) {
      result.push({
        blockId: block.id,
        activityTypeId: block.activityTypeId,
        start: atLocalMinute(now, block.startMinutes),
        end: atLocalMinute(now, block.startMinutes + duration),
      });
    }
    if (block.dayOfWeek === yesterday && block.startMinutes + duration > MINUTES_PER_DAY) {
      result.push({
        blockId: block.id,
        activityTypeId: block.activityTypeId,
        start: atLocalMinute(yesterdayDate, block.startMinutes),
        end: atLocalMinute(yesterdayDate, block.startMinutes + duration),
      });
    }
  }
  return result.sort((left, right) => left.start - right.start || left.end - right.end);
}

/**
 * The block occurrence the Current Activity view is about at `now`: the running entry's own block
 * if it is happening now, else a block of the entry's type happening now, else (with no entry)
 * whatever is scheduled now. Undefined when nothing fits.
 */
export function findCurrentOccurrence(
  occurrences: readonly ScheduledSpan[],
  now: Date | number,
  entry?: Pick<TrackingEntry, 'routineBlockId' | 'activityTypeId'> | null
): ScheduledSpan | undefined {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const happening = occurrences.filter((span) => span.start <= nowMs && nowMs < span.end);
  if (!entry) return happening[0];
  return (
    happening.find((span) => entry.routineBlockId !== undefined && span.blockId === entry.routineBlockId) ??
    happening.find((span) => span.activityTypeId === entry.activityTypeId)
  );
}

// ============================================
// Grey spans for the day ribbon (Wave C exit criterion 5)
// ============================================

export interface UntrackedOverlay {
  key: string;
  /** Minutes from today's local midnight, 0–1440. */
  startMinutes: number;
  endMinutes: number;
  style: 'untracked';
}

/** Minutes from `day`'s local midnight to `ms`, by the wall clock (so DST days read right). */
function wallClockMinutes(ms: number, dayStart: number, dayEnd: number): number {
  if (ms >= dayEnd) return MINUTES_PER_DAY;
  if (ms <= dayStart) return 0;
  const date = new Date(ms);
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

/**
 * The untracked parts of today's past and current blocks, as ribbon overlays (#54): "A scheduled
 * block that was never confirmed shows its untracked time as a grey wedge rather than vanishing."
 */
export function getUntrackedOverlays(
  blocks: Parameters<typeof getTodayOccurrences>[0],
  entries: readonly TrackingStateEntry[],
  now: Date
): UntrackedOverlay[] {
  const dayStart = atLocalMinute(now, 0);
  const dayEnd = atLocalMinute(now, MINUTES_PER_DAY);
  const overlays: UntrackedOverlay[] = [];
  for (const occurrence of getTodayOccurrences(blocks, now)) {
    const { untrackedSpans } = getBlockTrackingState(occurrence, entries, now);
    untrackedSpans.forEach((span, index) => {
      const startMinutes = wallClockMinutes(span.start, dayStart, dayEnd);
      const endMinutes = wallClockMinutes(span.end, dayStart, dayEnd);
      if (endMinutes <= startMinutes) return;
      overlays.push({
        key: `untracked:${occurrence.blockId ?? occurrence.start}:${occurrence.start}:${index}`,
        startMinutes,
        endMinutes,
        style: 'untracked',
      });
    });
  }
  return overlays;
}

// ============================================
// The timer pie's outer ring: the current block, tracked vs not (p77)
// ============================================

export type BlockRingKind = 'tracked' | 'untracked' | 'ahead';

export interface BlockRingSegment {
  kind: BlockRingKind;
  /** Milliseconds; the segments run in time order from the block's start and add up to its length. */
  ms: number;
}

/**
 * The current block as a ring, clockwise from 12 o'clock at the block's start: tracked time,
 * "time spent not tracking" (grey on p77), and the part still ahead.
 */
export function getBlockRing(
  block: ScheduledSpan,
  entries: readonly TrackingStateEntry[],
  now: Date | number
): BlockRingSegment[] {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const pastEnd = Math.min(block.end, Math.max(block.start, nowMs));
  const elapsed: TimeSpan = { start: block.start, end: pastEnd };
  const covered = pastEnd > block.start ? trackedCover(block, entries, elapsed, nowMs) : [];
  const pieces: { kind: BlockRingKind; start: number; end: number }[] = [
    ...covered.map((span) => ({ kind: 'tracked' as const, ...span })),
    ...(pastEnd > block.start ? gapsIn(elapsed, covered) : []).map((span) => ({
      kind: 'untracked' as const,
      ...span,
    })),
  ].sort((left, right) => left.start - right.start);
  if (block.end > pastEnd) pieces.push({ kind: 'ahead', start: pastEnd, end: block.end });
  return pieces.map((piece) => ({ kind: piece.kind, ms: piece.end - piece.start }));
}

// ============================================
// Day Overview: "not tracked" on past rows
// ============================================

/**
 * A short note for a past Day Overview row: "Not tracked" when nothing of it was tracked, "25m not
 * tracked" when part was, and empty when all of it was (or the row is not past). Minutes are
 * rounded down, so a few stray seconds are not reported.
 */
export function describeUntrackedRow(
  row: { activityTypeId: string; blockId?: string; startMinutes: number; endMinutes: number; state: string },
  entries: readonly TrackingStateEntry[],
  now: Date
): string {
  if (row.state !== 'past') return '';
  const span: ScheduledSpan = {
    blockId: row.blockId,
    activityTypeId: row.activityTypeId,
    start: atLocalMinute(now, row.startMinutes),
    end: atLocalMinute(now, row.endMinutes),
  };
  if (!(span.end > span.start)) return '';
  const { untrackedSpans, trackedMs } = getBlockTrackingState(span, entries, now);
  const untrackedMinutes = Math.floor(
    untrackedSpans.reduce((total, gap) => total + gap.end - gap.start, 0) / 60000
  );
  if (trackedMs === 0) return 'Not tracked';
  if (untrackedMinutes < 1) return '';
  return `${formatDuration(untrackedMinutes)} not tracked`;
}
