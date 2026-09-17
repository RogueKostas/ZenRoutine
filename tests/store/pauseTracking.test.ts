import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isPomodoroEnabled, useAppStore } from '../../src/store/useAppStore';
import { createInitialState, migratePersistedState } from '../../src/store/persistence';
import {
  getTrackingEntryDurationMinutes,
  isTrackingEntryPaused,
} from '../../src/core/utils/time';
import { makeAppState, makeGoal } from '../helpers/builders';

const store = () => useAppStore.getState();
const at = (iso: string) => vi.setSystemTime(new Date(iso));
const current = () => store().trackingEntries.find((entry) => entry.id === store().currentTrackingEntryId);

function startFocus(): string {
  at('2026-03-02T09:00:00.000Z');
  const id = store().startTracking({ activityTypeId: 'activity-focus', goalId: 'goal-focus', source: 'manual' });
  expect(id).not.toBeNull();
  return id!;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  useAppStore.setState({ ...createInitialState(), ...makeAppState({ goals: [makeGoal()] }) });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('pause and resume (#54)', () => {
  it('starts an entry with no pauses at all', () => {
    startFocus();
    expect(current()).not.toHaveProperty('pauses');
    expect(isTrackingEntryPaused(current()!)).toBe(false);
  });

  it('pauses and resumes the running entry', () => {
    const id = startFocus();
    at('2026-03-02T09:10:00.000Z');
    store().pauseTracking();
    expect(isTrackingEntryPaused(current()!)).toBe(true);
    expect(current()!.pauses).toEqual([{ start: '2026-03-02T09:10:00.000Z' }]);
    expect(current()!.updatedAt).toBe('2026-03-02T09:10:00.000Z');

    at('2026-03-02T09:15:00.000Z');
    store().resumeTracking(id);
    expect(isTrackingEntryPaused(current()!)).toBe(false);
    expect(current()!.pauses).toEqual([
      { start: '2026-03-02T09:10:00.000Z', end: '2026-03-02T09:15:00.000Z' },
    ]);
    // Still the running entry: a pause never ends the session.
    expect(store().currentTrackingEntryId).toBe(id);
    expect(current()!.endTime).toBeUndefined();
  });

  it('keeps at most one pause open', () => {
    startFocus();
    at('2026-03-02T09:10:00.000Z');
    store().pauseTracking();
    const before = store().trackingEntries;
    at('2026-03-02T09:12:00.000Z');
    store().pauseTracking();
    expect(store().trackingEntries).toBe(before);
    expect(current()!.pauses).toHaveLength(1);
  });

  it('does nothing to resume an entry that is not paused', () => {
    startFocus();
    const before = store().trackingEntries;
    store().resumeTracking();
    expect(store().trackingEntries).toBe(before);

    // Nor to resume twice: the closed pause keeps its end.
    at('2026-03-02T09:10:00.000Z');
    store().pauseTracking();
    at('2026-03-02T09:15:00.000Z');
    store().resumeTracking();
    const resumed = store().trackingEntries;
    at('2026-03-02T09:30:00.000Z');
    store().resumeTracking();
    expect(store().trackingEntries).toBe(resumed);
  });

  it('does nothing to pause a finished entry, or with nothing running', () => {
    const id = startFocus();
    at('2026-03-02T09:30:00.000Z');
    store().stopTracking();
    const before = store().trackingEntries;
    store().pauseTracking(id);
    store().pauseTracking();
    expect(store().trackingEntries).toBe(before);
  });

  it('closes an open pause when stopped, and the paused time is not tracked', () => {
    const id = startFocus();
    at('2026-03-02T09:20:00.000Z');
    store().pauseTracking();
    at('2026-03-02T09:50:00.000Z');
    store().stopTracking();

    const entry = store().trackingEntries.find((candidate) => candidate.id === id)!;
    expect(entry.endTime).toBe('2026-03-02T09:50:00.000Z');
    expect(entry.pauses).toEqual([
      { start: '2026-03-02T09:20:00.000Z', end: '2026-03-02T09:50:00.000Z' },
    ]);
    expect(getTrackingEntryDurationMinutes(entry)).toBe(20);
    expect(store().goals[0].loggedMinutes).toBe(20);
    // What the store wrote is what the next launch reads.
    expect(() => migratePersistedState(store(), 9)).not.toThrow();
  });

  it('counts time across several pauses', () => {
    startFocus();
    at('2026-03-02T09:10:00.000Z');
    store().pauseTracking();
    at('2026-03-02T09:20:00.000Z');
    store().resumeTracking();
    at('2026-03-02T09:40:00.000Z');
    store().pauseTracking();
    at('2026-03-02T09:45:00.000Z');
    store().resumeTracking();
    at('2026-03-02T10:00:00.000Z');
    store().stopTracking();
    // 60 on the clock, 15 paused.
    expect(store().goals[0].loggedMinutes).toBe(45);
  });

  it('never writes a pause before the entry or the last pause when the clock moves back', () => {
    startFocus();
    at('2026-03-02T09:10:00.000Z');
    store().pauseTracking();
    at('2026-03-02T09:05:00.000Z');
    store().resumeTracking();
    expect(current()!.pauses).toEqual([
      { start: '2026-03-02T09:10:00.000Z', end: '2026-03-02T09:10:00.000Z' },
    ]);
    at('2026-03-02T09:00:00.000Z');
    store().pauseTracking();
    expect(current()!.pauses![1]).toEqual({ start: '2026-03-02T09:10:00.000Z' });
    at('2026-03-02T08:00:00.000Z');
    store().stopTracking();
    const entry = store().trackingEntries[0];
    expect(entry.endTime).toBe('2026-03-02T09:10:00.000Z');
    expect(entry.pauses![1]).toEqual({ start: '2026-03-02T09:10:00.000Z', end: '2026-03-02T09:10:00.000Z' });
    expect(getTrackingEntryDurationMinutes(entry)).toBe(10);
    expect(() => migratePersistedState(store(), 9)).not.toThrow();
  });

  it('refuses an edit that would leave the pauses invalid', () => {
    const id = startFocus();
    at('2026-03-02T09:10:00.000Z');
    store().pauseTracking();
    at('2026-03-02T09:20:00.000Z');
    store().stopTracking();
    const before = store().trackingEntries;

    // Moving the end before the pause, or reopening a pause on a finished entry.
    store().updateTrackingEntry(id, { endTime: '2026-03-02T09:05:00.000Z' });
    store().updateTrackingEntry(id, { pauses: [{ start: '2026-03-02T09:10:00.000Z' }] });
    expect(store().trackingEntries).toBe(before);

    store().updateTrackingEntry(id, { endTime: '2026-03-02T09:30:00.000Z' });
    expect(getTrackingEntryDurationMinutes(store().trackingEntries[0])).toBe(20);
  });
});

describe('the Pomodoro preference (#53)', () => {
  it('is on until the user turns it off, and can be turned back on', () => {
    expect(isPomodoroEnabled(store().preferences)).toBe(true);
    store().setPomodoroEnabled(false);
    expect(store().preferences).toEqual({ weekStartsOn: 1, pomodoro: { enabled: false } });
    expect(isPomodoroEnabled(store().preferences)).toBe(false);
    store().setPomodoroEnabled(true);
    expect(isPomodoroEnabled(store().preferences)).toBe(true);
  });

  it('ignores a value that is not a boolean', () => {
    const before = store().preferences;
    store().setPomodoroEnabled('off' as unknown as boolean);
    expect(store().preferences).toBe(before);
  });

  it('survives a reset, like the week start', async () => {
    store().setPomodoroEnabled(false);
    await store().resetState();
    expect(isPomodoroEnabled(store().preferences)).toBe(false);
  });
});
