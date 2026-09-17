import type { BreakdownDatum } from '../breakdown/pieLayout';
import type { Goal, TrackingEntry } from '../../core/types';
import { spacing } from '../../theme/spacing';
import {
  DEFAULT_POMODORO_SETTINGS,
  formatCountdown,
  pomodoroAt,
  tomatoFills,
  type PomodoroSettings,
  type PomodoroState,
} from '../../core/engine/pomodoro';
import type { BlockRingSegment } from '../../core/engine/trackingState';
import { formatHours } from '../../core/engine/dayOverview';
import {
  formatElapsed,
  getTrackedMilliseconds,
  getTrackedSeconds,
  isTrackingEntryPaused,
} from '../../core/utils/time';

// Pure pieces of the Current Activity view (#53, design p75–p77), kept out of the component so
// they can be tested without a renderer.

export const RING_THICKNESS = 14;
/** Horizontal padding of the view's content; the screen uses this same constant. */
export const CONTENT_PADDING = spacing.lg;
/** Gap between the pie and each side column in the three-column row; likewise shared. */
export const COLUMN_GAP = spacing.xl;
const WIDE_PIE_SIZE = 260;
const MIN_PIE_SIZE = 140;
const MAX_PIE_SIZE = 240;
/**
 * A side column narrower than this cannot hold "Not tracking…" or "6:00 / 30hrs" on one line, so
 * three columns are only worth it once both sides can have this much.
 */
export const MIN_COLUMN_WIDTH = 180;
/** Past this the columns would drift away from the pie rather than read as one panel. */
const MAX_COLUMN_WIDTH = 320;

/** Three columns need the pie, both minimum columns, both gaps and both gutters to fit. */
export const WIDE_LAYOUT_MIN_WIDTH =
  2 * CONTENT_PADDING +
  WIDE_PIE_SIZE +
  2 * RING_THICKNESS +
  2 * COLUMN_GAP +
  2 * MIN_COLUMN_WIDTH;

export interface CurrentActivityLayout {
  wide: boolean;
  /** Diameter of the countdown pie; the block ring goes around it. */
  pieSize: number;
  /**
   * Width to give each side column in the three-column row, or null when the view stacks and the
   * two columns share the row below the pie instead. Never a flex basis: on web `flex: 0` expands
   * to `flex: 0 1 0%`, which overrides an explicit width and shrinks the column to nothing.
   */
  columnWidth: number | null;
}

export function currentActivityLayout(windowWidth: number): CurrentActivityLayout {
  const width = Number.isFinite(windowWidth) && windowWidth > 0 ? windowWidth : 360;
  const content = width - 2 * CONTENT_PADDING;
  if (width >= WIDE_LAYOUT_MIN_WIDTH) {
    const forColumns = content - (WIDE_PIE_SIZE + 2 * RING_THICKNESS) - 2 * COLUMN_GAP;
    return {
      wide: true,
      pieSize: WIDE_PIE_SIZE,
      columnWidth: Math.min(MAX_COLUMN_WIDTH, Math.floor(forColumns / 2)),
    };
  }
  const room = content - 2 * RING_THICKNESS;
  return {
    wide: false,
    pieSize: Math.max(MIN_PIE_SIZE, Math.min(MAX_PIE_SIZE, Math.floor(room))),
    columnWidth: null,
  };
}

export type TrackingBadge = 'LIVE' | 'PAUSED' | 'IDLE';

/** LIVE while tracking, PAUSED while paused (p77's "Not Tracking…"), IDLE with nothing running. */
export function trackingBadge(
  entry: Pick<TrackingEntry, 'startTime' | 'endTime' | 'pauses'> | null | undefined
): TrackingBadge {
  if (!entry || entry.endTime !== undefined) return 'IDLE';
  return isTrackingEntryPaused(entry) ? 'PAUSED' : 'LIVE';
}

export type TimerView =
  | {
      kind: 'pomodoro';
      state: PomodoroState;
      countdown: string;
      fills: number[];
      /** Seconds of the phase that have passed; the pie's white wedge. */
      phaseElapsedSeconds: number;
    }
  | { kind: 'plain'; elapsed: string };

/**
 * What the big timer shows: the Pomodoro countdown when the preference is on, else a plain
 * running timer (today's behaviour). Both stand still while the entry is paused.
 */
export function timerView(
  entry: Pick<TrackingEntry, 'startTime' | 'endTime' | 'pauses'>,
  nowMs: number,
  pomodoroEnabled: boolean,
  settings: PomodoroSettings = DEFAULT_POMODORO_SETTINGS
): TimerView {
  if (!pomodoroEnabled) {
    return { kind: 'plain', elapsed: formatElapsed(getTrackedSeconds(entry, nowMs)) };
  }
  const state = pomodoroAt(entry.startTime, entry.pauses, nowMs, settings);
  return {
    kind: 'pomodoro',
    state,
    countdown: formatCountdown(state.remainingSeconds),
    fills: tomatoFills(state, settings),
    phaseElapsedSeconds: state.phaseSeconds - state.remainingSeconds,
  };
}

/** The countdown pie: the passed part of the phase from 12 o'clock (white on p75), then the rest. */
export function countdownPieData(
  view: Extract<TimerView, { kind: 'pomodoro' }>,
  colors: { elapsed: string; remaining: string }
): BreakdownDatum[] {
  return [
    { id: 'elapsed', name: 'Passed', color: colors.elapsed, minutes: view.phaseElapsedSeconds },
    { id: 'remaining', name: 'Remaining', color: colors.remaining, minutes: view.state.remainingSeconds },
  ];
}

/** The block ring: tracked in the type's colour, "time spent not tracking" grey (p77), the rest pale. */
export function blockRingData(
  segments: readonly BlockRingSegment[],
  colors: Record<BlockRingSegment['kind'], string>
): BreakdownDatum[] {
  return segments.map((segment, index) => ({
    id: `${segment.kind}-${index}`,
    name: segment.kind,
    color: colors[segment.kind],
    minutes: segment.ms,
  }));
}

/** `4:22` — hours and minutes. */
export function formatHoursMinutes(minutes: number): string {
  const total = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * p76's `4:22 / 8hrs`: the goal's lifetime tracked time ("time tracked so far"), including the
 * running entry's tracked minutes, over its estimate ("total estimated time"). Null when there is
 * no goal or the goal has no estimate: then there is nothing to show against.
 */
export function formatGoalProgress(
  goal: Pick<Goal, 'loggedMinutes' | 'estimatedMinutes'> | null | undefined,
  runningEntry: Pick<TrackingEntry, 'startTime' | 'endTime' | 'pauses'> | null | undefined,
  nowMs: number
): string | null {
  if (!goal || goal.estimatedMinutes === undefined || !(goal.estimatedMinutes > 0)) return null;
  const running = runningEntry && runningEntry.endTime === undefined
    ? Math.floor(getTrackedMilliseconds(runningEntry, nowMs) / 60000)
    : 0;
  return `${formatHoursMinutes(Math.max(0, goal.loggedMinutes) + running)} / ${formatHours(goal.estimatedMinutes)}hrs`;
}
