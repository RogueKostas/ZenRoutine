import type { BreakdownDatum } from '../breakdown/pieLayout';
import type { Goal, TrackingEntry } from '../../core/types';
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

/** Columns side by side from this width; below it the view stacks (phone first). */
export const WIDE_LAYOUT_MIN_WIDTH = 720;
export const RING_THICKNESS = 14;
const GUTTER = 16;

export interface CurrentActivityLayout {
  wide: boolean;
  /** Diameter of the countdown pie; the block ring goes around it. */
  pieSize: number;
}

export function currentActivityLayout(windowWidth: number): CurrentActivityLayout {
  const width = Number.isFinite(windowWidth) && windowWidth > 0 ? windowWidth : 360;
  const wide = width >= WIDE_LAYOUT_MIN_WIDTH;
  if (wide) return { wide, pieSize: 260 };
  const room = width - 2 * GUTTER - 2 * RING_THICKNESS;
  return { wide, pieSize: Math.max(140, Math.min(240, Math.floor(room))) };
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
