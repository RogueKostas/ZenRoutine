import { describe, expect, it } from 'vitest';

import {
  RING_THICKNESS,
  blockRingData,
  countdownPieData,
  currentActivityLayout,
  formatGoalProgress,
  formatHoursMinutes,
  timerView,
  trackingBadge,
} from '../../src/components/tracking/currentActivityView';
import { pieSlices } from '../../src/components/breakdown/pieLayout';

const START = '2026-03-02T09:00:00.000Z';
const after = (minutes: number, seconds = 0) => Date.parse(START) + minutes * 60000 + seconds * 1000;
const running = { startTime: START };

describe('currentActivityLayout', () => {
  it('stacks at 500px with a pie that fits inside the gutters', () => {
    const layout = currentActivityLayout(500);
    expect(layout.wide).toBe(false);
    expect(layout.pieSize + 2 * RING_THICKNESS).toBeLessThanOrEqual(500 - 32);
    expect(layout.pieSize).toBe(240);
  });

  it('never overflows a 320px phone', () => {
    const layout = currentActivityLayout(320);
    expect(layout.pieSize + 2 * RING_THICKNESS).toBeLessThanOrEqual(320 - 32);
  });

  it('puts the three columns side by side at 1920px', () => {
    expect(currentActivityLayout(1920)).toEqual({ wide: true, pieSize: 260 });
  });

  it('survives a zero or missing width', () => {
    expect(currentActivityLayout(0).wide).toBe(false);
    expect(currentActivityLayout(Number.NaN).pieSize).toBeGreaterThan(0);
  });
});

describe('trackingBadge', () => {
  it('is LIVE, PAUSED or IDLE', () => {
    expect(trackingBadge(running)).toBe('LIVE');
    expect(trackingBadge({ ...running, pauses: [{ start: START }] })).toBe('PAUSED');
    expect(trackingBadge({ ...running, pauses: [{ start: START, end: START }] })).toBe('LIVE');
    expect(trackingBadge(null)).toBe('IDLE');
    expect(trackingBadge({ ...running, endTime: START })).toBe('IDLE');
  });
});

describe('timerView', () => {
  it('counts a pomodoro down from 25:00 with an empty tomato row', () => {
    const view = timerView(running, after(0), true);
    expect(view).toMatchObject({ kind: 'pomodoro', countdown: '25:00', fills: [0, 0, 0, 0], phaseElapsedSeconds: 0 });
    expect(timerView(running, after(0, 1), true)).toMatchObject({ countdown: '24:59' });
  });

  it('freezes the countdown while paused', () => {
    const paused = { ...running, pauses: [{ start: new Date(after(3)).toISOString() }] };
    expect(timerView(paused, after(3), true)).toMatchObject({ countdown: '22:00' });
    expect(timerView(paused, after(9), true)).toMatchObject({ countdown: '22:00' });
  });

  it('is a plain running timer when Pomodoro is off, and that freezes too', () => {
    expect(timerView(running, after(83, 5), false)).toEqual({ kind: 'plain', elapsed: '1:23:05' });
    const paused = { ...running, pauses: [{ start: new Date(after(2)).toISOString() }] };
    expect(timerView(paused, after(50), false)).toEqual({ kind: 'plain', elapsed: '2:00' });
  });
});

describe('the pie data', () => {
  it('draws the passed part of the phase first, from 12 o\'clock', () => {
    const view = timerView(running, after(5), true);
    if (view.kind !== 'pomodoro') throw new Error('expected a pomodoro');
    const slices = pieSlices(countdownPieData(view, { elapsed: 'white', remaining: 'red' }));
    expect(slices.map((slice) => [slice.color, slice.startAngle, slice.sweep])).toEqual([
      ['white', 0, 72],
      ['red', 72, 288],
    ]);
  });

  it('is a full disc of the remaining colour at the start of a phase', () => {
    const view = timerView(running, after(0), true);
    if (view.kind !== 'pomodoro') throw new Error('expected a pomodoro');
    const slices = pieSlices(countdownPieData(view, { elapsed: 'white', remaining: 'red' }));
    expect(slices.map((slice) => [slice.color, slice.sweep])).toEqual([['red', 360]]);
  });

  it('colours the block ring by kind, in order', () => {
    const data = blockRingData(
      [{ kind: 'untracked', ms: 1 }, { kind: 'tracked', ms: 2 }, { kind: 'ahead', ms: 1 }],
      { tracked: 'red', untracked: 'grey', ahead: 'pale' }
    );
    expect(data.map((datum) => [datum.id, datum.color, datum.minutes])).toEqual([
      ['untracked-0', 'grey', 1],
      ['tracked-1', 'red', 2],
      ['ahead-2', 'pale', 1],
    ]);
  });
});

describe('formatGoalProgress (p76: time tracked so far / total estimated time)', () => {
  it('reads like the design, counting the running entry', () => {
    const goal = { loggedMinutes: 240, estimatedMinutes: 480 };
    expect(formatGoalProgress(goal, running, after(22, 59))).toBe('4:22 / 8hrs');
    expect(formatGoalProgress(goal, null, after(22))).toBe('4:00 / 8hrs');
    expect(formatGoalProgress({ loggedMinutes: 0, estimatedMinutes: 150 }, null, 0)).toBe('0:00 / 2.5hrs');
  });

  it('leaves paused time out of the running entry', () => {
    const paused = { ...running, pauses: [{ start: new Date(after(10)).toISOString() }] };
    expect(formatGoalProgress({ loggedMinutes: 0, estimatedMinutes: 60 }, paused, after(50))).toBe('0:10 / 1hrs');
  });

  it('is hidden with no goal or no estimate', () => {
    expect(formatGoalProgress(null, running, after(1))).toBeNull();
    expect(formatGoalProgress({ loggedMinutes: 30 }, running, after(1))).toBeNull();
  });

  it('formats hours and minutes', () => {
    expect(formatHoursMinutes(319)).toBe('5:19');
    expect(formatHoursMinutes(-1)).toBe('0:00');
  });
});
