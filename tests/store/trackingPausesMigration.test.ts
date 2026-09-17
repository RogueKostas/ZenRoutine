import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getHydrationSnapshot,
  getQuarantinedTrackingEntries,
  getRepairedTrackingEntries,
  initializeAppStore,
  isPomodoroEnabled,
  useAppStore,
} from '../../src/store/useAppStore';
import {
  APP_STORAGE_KEY,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  CURRENT_SCHEMA_VERSION,
  OPTIONAL_GOAL_FIELDS_SCHEMA_VERSION,
  QUARANTINE_STORAGE_KEY,
  STRICT_SCHEMA_VERSION,
  TRACKING_PAUSES_SCHEMA_VERSION,
  createInitialState,
  decodeBackup,
  encodeBackup,
  migratePersistedState,
  selectPersistedAppState,
} from '../../src/store/persistence';
import type { AppState, TrackingEntry } from '../../src/core/types';
import { getTrackingEntryDurationMinutes } from '../../src/core/utils/time';
import { makeAppState, makeTrackingEntry } from '../helpers/builders';

/**
 * A schema-8 store written by the pre-#54 store itself (`main` @ ab9af37): its own
 * `initializeAppStore`, `completeOnboarding`, `setWeekStartsOn`, block, goal, `moveGoal` and
 * tracking actions, with the clock (UTC) and ids pinned, then the blob read back out of
 * AsyncStorage and pretty-printed. It holds:
 *
 * | entry           | what                                                  | minutes |
 * |-----------------|-------------------------------------------------------|---------|
 * | entry-scheduled | started from block-work-am, 09:05:00–10:35:30, a note | 91      |
 * | entry-manual    | added by hand, 18:00–18:45, linked to goal-run        | 45      |
 * | entry-running   | the running timer, linked to goal-report              | —       |
 *
 * Also: a name-only goal and a goal with no estimate (v8), an overnight block, per-type capacity
 * stamps, and a Sunday-first week.
 */
const V8_STORE_BLOB = readFileSync(
  join(__dirname, '..', 'fixtures', 'v8-tracking-store.json'),
  'utf8'
);

type StoredEntry = Record<string, unknown> & { id: string };
type StoredState = Record<string, unknown> & { trackingEntries: StoredEntry[] };

function v8State(): StoredState {
  return (JSON.parse(V8_STORE_BLOB) as { state: StoredState }).state;
}

/** The fixture as the v9 store holds it: only the stamp changes. No entry gains `pauses`. */
function expectedV9(stored: StoredState) {
  return { ...stored, schemaVersion: CURRENT_SCHEMA_VERSION };
}

/** JSON drops `undefined`, which is exactly what a store write does. */
function asWritten(state: AppState): unknown {
  return JSON.parse(JSON.stringify(selectPersistedAppState(state)));
}

/** The pre-#54 duration formula, verbatim, so the check does not lean on the changed function. */
function v8Duration(entry: { startTime: string; endTime?: string }): number {
  if (!entry.endTime) return 0;
  const start = new Date(entry.startTime).getTime();
  const end = new Date(entry.endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

async function readWritten(): Promise<{ version: number; state: StoredState }> {
  return JSON.parse((await AsyncStorage.getItem(APP_STORAGE_KEY))!) as {
    version: number;
    state: StoredState;
  };
}

beforeEach(async () => {
  useAppStore.setState(createInitialState());
  await AsyncStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the fixture really is a pre-change v8 store', () => {
  it('is stamped 8, has no pauses and no Pomodoro preference', () => {
    const blob = JSON.parse(V8_STORE_BLOB) as { version: number; state: StoredState };
    expect(blob.version).toBe(8);
    expect(blob.state.schemaVersion).toBe(8);
    expect(blob.state.trackingEntries.map((entry) => entry.id)).toEqual([
      'entry-scheduled', 'entry-manual', 'entry-running',
    ]);
    for (const entry of blob.state.trackingEntries) expect(entry).not.toHaveProperty('pauses');
    expect(blob.state.preferences).toEqual({ weekStartsOn: 0 });
    expect(blob.state.currentTrackingEntryId).toBe('entry-running');
  });
});

describe('schema 9: a tracking entry can be paused (#54)', () => {
  it('bumps the schema without moving the repair gate', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(9);
    expect(TRACKING_PAUSES_SCHEMA_VERSION).toBe(9);
    expect(OPTIONAL_GOAL_FIELDS_SCHEMA_VERSION).toBe(8);
    expect(STRICT_SCHEMA_VERSION).toBe(4);
  });

  it('reads a real v8 store unchanged apart from the stamp, filling nothing', () => {
    const stored = v8State();
    const original = structuredClone(stored);

    const migrated = migratePersistedState(stored, 8);

    expect(asWritten(migrated)).toEqual(expectedV9(original));
    expect(stored).toEqual(original);
    for (const entry of migrated.trackingEntries) expect(entry).not.toHaveProperty('pauses');
    expect(migratePersistedState(migrated, CURRENT_SCHEMA_VERSION)).toEqual(migrated);
  });

  it('keeps every old entry\'s duration exactly', () => {
    const stored = v8State();
    const migrated = migratePersistedState(stored, 8);
    const before = stored.trackingEntries.map((entry) =>
      v8Duration(entry as unknown as { startTime: string; endTime?: string })
    );
    expect(before).toEqual([91, 45, 0]);
    expect(migrated.trackingEntries.map(getTrackingEntryDurationMinutes)).toEqual(before);
    expect(migrated.goals.map((goal) => [goal.id, goal.loggedMinutes])).toEqual([
      ['goal-run', 45], ['goal-report', 91], ['goal-todo', 0], ['goal-read', 0],
    ]);
  });

  it('reads the missing Pomodoro preference as on, without writing one', () => {
    const migrated = migratePersistedState(v8State(), 8);
    expect(migrated.preferences).toEqual({ weekStartsOn: 0 });
    expect(isPomodoroEnabled(migrated.preferences)).toBe(true);
  });

  it('opens a real v8 store, rewrites it at v9, and sets nothing aside', async () => {
    const stored = v8State();
    await AsyncStorage.setItem(APP_STORAGE_KEY, V8_STORE_BLOB);

    await initializeAppStore({ force: true });

    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    const state = useAppStore.getState();
    expect(asWritten(state)).toEqual(expectedV9(stored));
    expect(state.currentTrackingEntryId).toBe('entry-running');
    expect(getQuarantinedTrackingEntries()).toEqual([]);
    expect(getRepairedTrackingEntries()).toEqual([]);
    expect(await AsyncStorage.getItem(QUARANTINE_STORAGE_KEY)).toBeNull();

    const rewritten = await readWritten();
    expect(rewritten.version).toBe(9);
    expect(rewritten.state).toEqual(expectedV9(stored));
  });

  it('then pauses, resumes and stops that store\'s running timer, and reads it back exactly', async () => {
    await AsyncStorage.setItem(APP_STORAGE_KEY, V8_STORE_BLOB);
    await initializeAppStore({ force: true });
    vi.useFakeTimers({ toFake: ['Date'] });
    const store = () => useAppStore.getState();

    vi.setSystemTime(new Date('2026-09-15T09:25:00.000Z'));
    store().pauseTracking();
    vi.setSystemTime(new Date('2026-09-15T09:40:00.000Z'));
    store().resumeTracking();
    vi.setSystemTime(new Date('2026-09-15T10:00:00.000Z'));
    store().pauseTracking();
    vi.setSystemTime(new Date('2026-09-15T10:30:00.000Z'));
    store().stopTracking();

    const running = store().trackingEntries.find((entry) => entry.id === 'entry-running')!;
    expect(running.pauses).toEqual([
      { start: '2026-09-15T09:25:00.000Z', end: '2026-09-15T09:40:00.000Z' },
      { start: '2026-09-15T10:00:00.000Z', end: '2026-09-15T10:30:00.000Z' },
    ]);
    // 90 minutes on the clock, 45 of them paused.
    expect(getTrackingEntryDurationMinutes(running)).toBe(45);
    expect(store().goals.find((goal) => goal.id === 'goal-report')!.loggedMinutes).toBe(91 + 45);
    expect(store().currentTrackingEntryId).toBeNull();

    await vi.waitFor(async () => {
      const written = await readWritten();
      expect(written.state.currentTrackingEntryId).toBeNull();
    });
    const written = await readWritten();
    expect(written.version).toBe(9);
    const reloaded = migratePersistedState(written.state, written.version);
    expect(asWritten(reloaded)).toEqual(written.state);
    expect(reloaded.trackingEntries.find((entry) => entry.id === 'entry-running')!.pauses)
      .toEqual(running.pauses);
  });

  it('imports a v8 backup exactly', async () => {
    const stored = v8State();
    const backup = JSON.stringify({
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: 8,
      exportedAt: '2026-09-17T08:00:00.000Z',
      state: stored,
    });

    expect(asWritten(decodeBackup(backup))).toEqual(expectedV9(stored));
    expect(await useAppStore.getState().importData(backup)).toEqual({ ok: true });
    expect(asWritten(useAppStore.getState())).toEqual(expectedV9(stored));
  });
});

describe('the v9 gate', () => {
  const start = '2026-03-02T09:00:00.000Z';
  const end = '2026-03-02T10:00:00.000Z';
  const withEntry = (entry: Record<string, unknown>, current: string | null = null) =>
    ({ ...makeAppState(), trackingEntries: [entry], currentTrackingEntryId: current });
  const paused = (pauses: unknown, overrides: Partial<TrackingEntry> = {}) =>
    ({ ...makeTrackingEntry({ startTime: start, endTime: end, ...overrides }), pauses });

  it('drops a `pauses` key below v9 unread, even a malformed one', () => {
    const migrated = migratePersistedState(withEntry(paused('not a list')), 8);
    expect(migrated.trackingEntries[0]).not.toHaveProperty('pauses');
    expect(getTrackingEntryDurationMinutes(migrated.trackingEntries[0])).toBe(60);
  });

  it('keeps valid pauses from v9, and they come off the duration', () => {
    const pauses = [
      { start: '2026-03-02T09:10:00.000Z', end: '2026-03-02T09:20:00.000Z' },
      { start: '2026-03-02T09:50:00.000Z', end: end },
    ];
    const migrated = migratePersistedState(withEntry(paused(pauses)), 9);
    expect(migrated.trackingEntries[0].pauses).toEqual(pauses);
    expect(getTrackingEntryDurationMinutes(migrated.trackingEntries[0])).toBe(40);
  });

  it('keeps an open pause on the running entry', () => {
    const entry = { ...paused([{ start: '2026-03-02T09:10:00.000Z' }]), endTime: undefined };
    const migrated = migratePersistedState(withEntry(entry, 'entry-focus'), 9);
    expect(migrated.trackingEntries[0].pauses).toEqual([{ start: '2026-03-02T09:10:00.000Z' }]);
  });

  it('reads an empty or null list as never paused', () => {
    for (const pauses of [[], null]) {
      const migrated = migratePersistedState(withEntry(paused(pauses)), 9);
      expect(migrated.trackingEntries[0]).not.toHaveProperty('pauses');
    }
  });

  it.each([
    ['not a list', 'x', 'Invalid pauses'],
    ['a pause with no start', [{ end: end }], 'Invalid start'],
    ['a pause with a date-only start', [{ start: '2026-03-02' }], 'Invalid start'],
    ['a pause before the entry', [{ start: '2026-03-02T08:59:00.000Z', end: '2026-03-02T09:05:00.000Z' }], 'starts before the entry'],
    ['a pause that ends before it starts', [{ start: '2026-03-02T09:30:00.000Z', end: '2026-03-02T09:20:00.000Z' }], 'ends before it starts'],
    ['a pause after the entry', [{ start: '2026-03-02T09:30:00.000Z', end: '2026-03-02T10:05:00.000Z' }], 'ends after the entry'],
    ['overlapping pauses', [
      { start: '2026-03-02T09:10:00.000Z', end: '2026-03-02T09:30:00.000Z' },
      { start: '2026-03-02T09:20:00.000Z', end: '2026-03-02T09:40:00.000Z' },
    ], 'overlaps'],
    ['an open pause on a finished entry', [{ start: '2026-03-02T09:30:00.000Z' }], 'finished entry'],
    ['an open pause that is not the last', [
      { start: '2026-03-02T09:10:00.000Z' },
      { start: '2026-03-02T09:20:00.000Z', end: '2026-03-02T09:30:00.000Z' },
    ], 'only the last pause'],
  ])('refuses, on import, %s', (_label, pauses, message) => {
    expect(() => migratePersistedState(withEntry(paused(pauses)), 9)).toThrow(message);
  });

  it('sets an entry with broken pauses aside at hydration, and opens the rest', async () => {
    const good = makeTrackingEntry({ id: 'entry-good' });
    const bad = { ...paused('x'), id: 'entry-bad' };
    const state = { ...makeAppState(), trackingEntries: [good, bad] };
    await AsyncStorage.setItem(APP_STORAGE_KEY, JSON.stringify({ state, version: 9 }));

    await initializeAppStore({ force: true });

    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    expect(useAppStore.getState().trackingEntries.map((entry) => entry.id)).toEqual(['entry-good']);
    expect(getQuarantinedTrackingEntries()).toEqual([
      expect.objectContaining({ id: 'entry-bad', index: 1, record: bad }),
    ]);
  });

  it('round-trips pauses and the Pomodoro preference through a backup', () => {
    const entry = paused([{ start: '2026-03-02T09:10:00.000Z', end: '2026-03-02T09:25:00.000Z' }]);
    const state = migratePersistedState(
      { ...withEntry(entry), preferences: { weekStartsOn: 1, pomodoro: { enabled: false } } },
      9
    );
    const decoded = decodeBackup(encodeBackup(state));
    expect(decoded).toEqual(state);
    expect(getTrackingEntryDurationMinutes(decoded.trackingEntries[0])).toBe(45);
    expect(isPomodoroEnabled(decoded.preferences)).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['not an object', 'off'],
    ['without a boolean', { enabled: 'no' }],
  ])('drops a Pomodoro preference that is %s, which reads as on', (_label, pomodoro) => {
    const migrated = migratePersistedState(
      { ...makeAppState(), preferences: { weekStartsOn: 1, pomodoro } },
      9
    );
    expect(migrated.preferences).toEqual({ weekStartsOn: 1 });
    expect(isPomodoroEnabled(migrated.preferences)).toBe(true);
  });
});
