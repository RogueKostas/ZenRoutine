import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatElapsed,
  formatGoalTimeLabel,
  getElapsedSeconds,
} from '../../src/core/utils/time';

describe('formatElapsed', () => {
  it('shows M:SS under an hour and H:MM:SS from an hour up', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(59)).toBe('0:59');
    expect(formatElapsed(60)).toBe('1:00');
    expect(formatElapsed(3599)).toBe('59:59');
    expect(formatElapsed(3600)).toBe('1:00:00');
    expect(formatElapsed(36000)).toBe('10:00:00');
  });

  it('clamps negative and non-finite input to zero and drops fractions', () => {
    expect(formatElapsed(-5)).toBe('0:00');
    expect(formatElapsed(Number.NaN)).toBe('0:00');
    expect(formatElapsed(61.9)).toBe('1:01');
  });
});

describe('getElapsedSeconds', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts seconds on a running entry as the clock advances', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T09:00:00.000Z'));
    const startTime = new Date().toISOString();

    expect(formatElapsed(getElapsedSeconds(startTime, Date.now()))).toBe('0:00');
    vi.advanceTimersByTime(3000);
    expect(formatElapsed(getElapsedSeconds(startTime, Date.now()))).toBe('0:03');
  });

  it('is derived from the start time, so a long gap between ticks is exact', () => {
    const start = '2026-09-17T09:00:00.000Z';
    const now = Date.parse('2026-09-17T10:02:05.900Z');
    expect(getElapsedSeconds(start, now)).toBe(3725);
    expect(formatElapsed(getElapsedSeconds(start, now))).toBe('1:02:05');
  });

  it('never goes negative for a start in the future or an unreadable start', () => {
    expect(getElapsedSeconds('2026-09-17T09:00:10.000Z', Date.parse('2026-09-17T09:00:00.000Z'))).toBe(0);
    expect(getElapsedSeconds('not a date', Date.now())).toBe(0);
  });
});

describe('formatGoalTimeLabel', () => {
  it('shows lifetime goal figures in hours with no period claim', () => {
    const label = formatGoalTimeLabel(240, 1200);
    expect(label).toBe('4h / 20h');
    expect(label).not.toContain('week');
    expect(label).not.toContain('min');
  });

  it('keeps sub-hour and mixed values readable', () => {
    expect(formatGoalTimeLabel(45, 90)).toBe('45m / 1h 30m');
  });

  it('shows logged time only when the goal has no estimate', () => {
    expect(formatGoalTimeLabel(240)).toBe('4h logged');
    expect(formatGoalTimeLabel(240, 0)).toBe('4h logged');
  });
});
