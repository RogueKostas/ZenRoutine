import { describe, expect, it } from 'vitest';

import {
  DEFAULT_POMODORO_SETTINGS,
  formatCountdown,
  phaseChangeNotice,
  pomodoroAt,
  tomatoFills,
} from '../../src/core/engine/pomodoro';

const START = '2026-03-02T09:00:00.000Z';
const base = Date.parse(START);
const after = (minutes: number, seconds = 0) => base + minutes * 60000 + seconds * 1000;
const iso = (minutes: number) => new Date(after(minutes)).toISOString();

describe('pomodoroAt (#53): 25 / 5, and 15 after four', () => {
  it('starts a session on a full 25:00 focus', () => {
    expect(pomodoroAt(START, undefined, base)).toEqual({
      phase: 'focus',
      remainingSeconds: 1500,
      phaseSeconds: 1500,
      completedPomodoros: 0,
      cycleIndex: 0,
    });
    expect(DEFAULT_POMODORO_SETTINGS).toEqual({
      focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, pomodorosPerSet: 4,
    });
  });

  it('counts down in seconds', () => {
    const state = pomodoroAt(START, undefined, after(22, 24));
    expect(state.phase).toBe('focus');
    expect(formatCountdown(state.remainingSeconds)).toBe('02:36');
  });

  it('goes to a 5-minute break after 25 minutes, then back to focus', () => {
    expect(pomodoroAt(START, undefined, after(25))).toMatchObject({
      phase: 'short-break', remainingSeconds: 300, completedPomodoros: 1, cycleIndex: 0,
    });
    expect(pomodoroAt(START, undefined, after(30))).toMatchObject({
      phase: 'focus', remainingSeconds: 1500, completedPomodoros: 1, cycleIndex: 1,
    });
  });

  it('gives a 15-minute break after the fourth pomodoro, not a 5', () => {
    // F S F S F S F = 4×25 + 3×5 = 115 minutes.
    expect(pomodoroAt(START, undefined, after(110))).toMatchObject({ phase: 'focus', cycleIndex: 3 });
    expect(pomodoroAt(START, undefined, after(115))).toEqual({
      phase: 'long-break',
      remainingSeconds: 900,
      phaseSeconds: 900,
      completedPomodoros: 4,
      cycleIndex: 3,
    });
    expect(pomodoroAt(START, undefined, after(129, 59))).toMatchObject({ phase: 'long-break', remainingSeconds: 1 });
  });

  it('starts a new set after the long break, counting on', () => {
    expect(pomodoroAt(START, undefined, after(130))).toMatchObject({
      phase: 'focus', remainingSeconds: 1500, completedPomodoros: 4, cycleIndex: 0,
    });
    // Second set's long break: 130 + 115.
    expect(pomodoroAt(START, undefined, after(245))).toMatchObject({
      phase: 'long-break', completedPomodoros: 8, cycleIndex: 3,
    });
  });

  it('freezes while paused and resumes where it stopped', () => {
    const open = [{ start: iso(10) }];
    const atPause = pomodoroAt(START, open, after(10));
    const later = pomodoroAt(START, open, after(40));
    expect(atPause).toMatchObject({ phase: 'focus', remainingSeconds: 900 });
    expect(later).toEqual(atPause);

    const closed = [{ start: iso(10), end: iso(40) }];
    expect(pomodoroAt(START, closed, after(45))).toMatchObject({ phase: 'focus', remainingSeconds: 600 });
    // The break comes 25 tracked minutes in, 30 minutes late.
    expect(pomodoroAt(START, closed, after(55))).toMatchObject({ phase: 'short-break', completedPomodoros: 1 });
  });

  it('takes other cadences, and falls back to the default for nonsense', () => {
    const quick = { focusMinutes: 1, shortBreakMinutes: 1, longBreakMinutes: 2, pomodorosPerSet: 2 };
    expect(pomodoroAt(START, undefined, after(3), quick)).toMatchObject({ phase: 'long-break', completedPomodoros: 2 });
    const broken = { focusMinutes: 0, shortBreakMinutes: -1, longBreakMinutes: 1.5, pomodorosPerSet: Number.NaN };
    expect(pomodoroAt(START, undefined, after(25), broken)).toMatchObject({ phase: 'short-break', remainingSeconds: 300 });
  });

  it('never runs backwards before the session start', () => {
    expect(pomodoroAt(START, undefined, after(-5))).toMatchObject({ phase: 'focus', remainingSeconds: 1500 });
  });
});

describe('tomatoFills (p76)', () => {
  const at = (minutes: number) => tomatoFills(pomodoroAt(START, undefined, after(minutes)));

  it('is an empty row of four at the start', () => {
    expect(at(0)).toEqual([0, 0, 0, 0]);
  });

  it('part-fills the pomodoro in progress', () => {
    expect(at(10)).toEqual([0.4, 0, 0, 0]);
    expect(at(40)).toEqual([1, 0.4, 0, 0]);
  });

  it('fills the one just finished during its break, and all four in the long break', () => {
    expect(at(26)).toEqual([1, 0, 0, 0]);
    expect(at(120)).toEqual([1, 1, 1, 1]);
    expect(at(130)).toEqual([0, 0, 0, 0]);
  });
});

describe('formatCountdown and phaseChangeNotice', () => {
  it('pads minutes and seconds', () => {
    expect(formatCountdown(1500)).toBe('25:00');
    expect(formatCountdown(59)).toBe('00:59');
    expect(formatCountdown(-3)).toBe('00:00');
    expect(formatCountdown(Number.NaN)).toBe('00:00');
  });

  it('announces a change of phase, and only a change', () => {
    const focusEnd = pomodoroAt(START, undefined, after(24, 59));
    const shortBreak = pomodoroAt(START, undefined, after(25));
    const longBreak = pomodoroAt(START, undefined, after(115));
    const nextFocus = pomodoroAt(START, undefined, after(30));
    expect(phaseChangeNotice(null, focusEnd)).toBeNull();
    expect(phaseChangeNotice(focusEnd, focusEnd)).toBeNull();
    expect(phaseChangeNotice(focusEnd, shortBreak)).toBe('Pomodoro 1 done. Take a 5-minute break.');
    expect(phaseChangeNotice(focusEnd, longBreak)).toBe('4 pomodoros done. Take a longer 15-minute break.');
    expect(phaseChangeNotice(shortBreak, nextFocus)).toBe('Break over. Back to focus for 25 minutes.');
  });
});
