import type { TrackingPause } from '../types';
import { getTrackedMilliseconds } from '../utils/time';

/**
 * The Current Activity view's Pomodoro timer (#53, design p75: "basically a powerful Pomodoro
 * timer"). Cadence from the director (review 09:30): 25 minutes of focus, 5 minutes of break, and
 * a 15-minute break after every fourth pomodoro.
 *
 * **One session, N pomodoros.** The timer is derived from a tracking entry's start and pauses and
 * nothing else. A break creates no entry and no pause, and a pomodoro boundary never splits the
 * entry: "Pomodoro boundaries must not fragment the tracking entry" (#53). The phase is only what
 * the timer shows.
 *
 * **Break time counts as tracked.** The tracked unit is the session (p76: "pomodoros in this
 * 'session'"), and a break the timer itself schedules is part of working in this technique, not
 * time away from the activity. Counting it keeps a followed block fully tracked (no grey wedge for
 * a break the app told the user to take) and keeps an entry's duration independent of whether the
 * timer was on. A user who leaves during a break can pause. *Flagged for the director.*
 *
 * **Pauses freeze the timer.** The clock the cycle runs on is tracked time, so a paused session's
 * countdown stands still and resumes where it stopped.
 */

export interface PomodoroSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  /** Pomodoros before the long break. */
  pomodorosPerSet: number;
}

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  pomodorosPerSet: 4,
};

export type PomodoroPhase = 'focus' | 'short-break' | 'long-break';

export interface PomodoroState {
  phase: PomodoroPhase;
  /** Seconds left in the current phase; the countdown. */
  remainingSeconds: number;
  /** The current phase's full length in seconds. */
  phaseSeconds: number;
  /** Focus periods finished in this session. */
  completedPomodoros: number;
  /**
   * Position in the current set, 0 to `pomodorosPerSet - 1`: the pomodoro being worked on, or,
   * during a break, the one just finished.
   */
  cycleIndex: number;
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function sanitize(settings: PomodoroSettings): PomodoroSettings {
  return {
    focusMinutes: positiveInteger(settings.focusMinutes, DEFAULT_POMODORO_SETTINGS.focusMinutes),
    shortBreakMinutes: positiveInteger(settings.shortBreakMinutes, DEFAULT_POMODORO_SETTINGS.shortBreakMinutes),
    longBreakMinutes: positiveInteger(settings.longBreakMinutes, DEFAULT_POMODORO_SETTINGS.longBreakMinutes),
    pomodorosPerSet: positiveInteger(settings.pomodorosPerSet, DEFAULT_POMODORO_SETTINGS.pomodorosPerSet),
  };
}

/**
 * Where the timer is at `now` for a session that started at `sessionStart` with these pauses.
 * The sequence repeats F S F S F S F L (with the default four per set).
 */
export function pomodoroAt(
  sessionStart: string,
  pauses: readonly TrackingPause[] | undefined,
  now: Date | number,
  settings: PomodoroSettings = DEFAULT_POMODORO_SETTINGS
): PomodoroState {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const { focusMinutes, shortBreakMinutes, longBreakMinutes, pomodorosPerSet } = sanitize(settings);
  const focus = focusMinutes * 60;
  const shortBreak = shortBreakMinutes * 60;
  const longBreak = longBreakMinutes * 60;
  const setSeconds = pomodorosPerSet * focus + (pomodorosPerSet - 1) * shortBreak + longBreak;

  const active = Math.max(
    0,
    Math.floor(getTrackedMilliseconds({ startTime: sessionStart, pauses: [...(pauses ?? [])] }, nowMs) / 1000)
  );
  const setsDone = Math.floor(active / setSeconds);
  let t = active - setsDone * setSeconds;

  for (let index = 0; index < pomodorosPerSet; index++) {
    const before = setsDone * pomodorosPerSet + index;
    if (t < focus) {
      return {
        phase: 'focus',
        remainingSeconds: focus - t,
        phaseSeconds: focus,
        completedPomodoros: before,
        cycleIndex: index,
      };
    }
    t -= focus;
    const isLong = index === pomodorosPerSet - 1;
    const breakSeconds = isLong ? longBreak : shortBreak;
    if (t < breakSeconds) {
      return {
        phase: isLong ? 'long-break' : 'short-break',
        remainingSeconds: breakSeconds - t,
        phaseSeconds: breakSeconds,
        completedPomodoros: before + 1,
        cycleIndex: index,
      };
    }
    t -= breakSeconds;
  }
  // Unreachable: t < setSeconds after the modulo above.
  return {
    phase: 'focus',
    remainingSeconds: focus,
    phaseSeconds: focus,
    completedPomodoros: (setsDone + 1) * pomodorosPerSet,
    cycleIndex: 0,
  };
}

/**
 * The tomato row (p76: "Completed and 'available' pomodoros in this 'session'"): one fill per
 * pomodoro of the current set, 0 (available) to 1 (done). The pomodoro in progress is part-filled
 * by how much of it has passed.
 */
export function tomatoFills(
  state: PomodoroState,
  settings: PomodoroSettings = DEFAULT_POMODORO_SETTINGS
): number[] {
  const { pomodorosPerSet } = sanitize(settings);
  return Array.from({ length: pomodorosPerSet }, (_, index) => {
    if (index < state.cycleIndex) return 1;
    if (index > state.cycleIndex) return 0;
    if (state.phase !== 'focus') return 1;
    return (state.phaseSeconds - state.remainingSeconds) / state.phaseSeconds;
  });
}

/** `25:00`, `02:36`: minutes and seconds, both two digits (p75). */
export function formatCountdown(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export const PHASE_LABELS: Record<PomodoroPhase, string> = {
  focus: 'Focus',
  'short-break': 'Short break',
  'long-break': 'Long break',
};

/**
 * The on-screen banner for a phase change, or null when the phase did not change. No
 * notifications: the view shows this gently (#53).
 */
export function phaseChangeNotice(
  previous: Pick<PomodoroState, 'phase'> | null | undefined,
  next: Pick<PomodoroState, 'phase' | 'phaseSeconds' | 'completedPomodoros'>
): string | null {
  if (!previous || previous.phase === next.phase) return null;
  const minutes = Math.round(next.phaseSeconds / 60);
  switch (next.phase) {
    case 'short-break':
      return `Pomodoro ${next.completedPomodoros} done. Take a ${minutes}-minute break.`;
    case 'long-break':
      return `${next.completedPomodoros} pomodoros done. Take a longer ${minutes}-minute break.`;
    case 'focus':
      return `Break over. Back to focus for ${minutes} minutes.`;
  }
}
