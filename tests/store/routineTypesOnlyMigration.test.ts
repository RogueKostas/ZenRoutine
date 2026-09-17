import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getHydrationSnapshot,
  getQuarantinedTrackingEntries,
  getRepairedTrackingEntries,
  initializeAppStore,
  useAppStore,
} from '../../src/store/useAppStore';
import {
  APP_STORAGE_KEY,
  BLOCK_GOAL_REMOVED_SCHEMA_VERSION,
  CURRENT_SCHEMA_VERSION,
  QUARANTINE_STORAGE_KEY,
  STRICT_SCHEMA_VERSION,
  createInitialState,
  decodeBackup,
  migratePersistedState,
  selectPersistedAppState,
} from '../../src/store/persistence';
import type {
  QuarantinedTrackingEntry,
  RepairedTrackingEntry,
} from '../../src/store/persistence';
import type { AppState } from '../../src/core/types';

/**
 * A schema-5 backup with goal-linked routine blocks, exactly as `main` @ 2266069 (before #60)
 * exports one. The persisted AsyncStorage blob is `{ state, version }` around the very same
 * `selectPersistedAppState` output, so the store tests below wrap this file's `state` rather than
 * keeping a second copy. Read as text so every test gets a fresh, unshared object.
 */
const V5_BACKUP = readFileSync(
  join(__dirname, '..', 'fixtures', 'v5-goal-linked-backup.json'),
  'utf8'
);

type StoredBlock = Record<string, unknown>;
type StoredState = Record<string, unknown> & {
  routines: { blocks: StoredBlock[] }[];
  trackingEntries: Record<string, unknown>[];
};

function v5State(): StoredState {
  return (JSON.parse(V5_BACKUP) as { state: StoredState }).state;
}

/** The fixture as the v6 store should hold it: identical, less every block's goalId. */
function expectedV6(stored: StoredState) {
  const { schemaVersion: _stamp, ...rest } = stored;
  return {
    ...rest,
    routines: stored.routines.map((routine) => ({
      ...routine,
      blocks: routine.blocks.map(({ goalId: _goal, ...block }) => block),
    })),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/** JSON drops `undefined`, which is exactly what a store write does. */
function asWritten(state: AppState): unknown {
  return JSON.parse(JSON.stringify(selectPersistedAppState(state)));
}

function expectGoalFree(state: AppState) {
  for (const routine of state.routines) {
    for (const block of routine.blocks) expect(block).not.toHaveProperty('goalId');
  }
}

beforeEach(async () => {
  useAppStore.setState(createInitialState());
  await AsyncStorage.clear();
  vi.clearAllMocks();
});

describe('the fixture really is a pre-change store', () => {
  it('holds goal-linked blocks and goal-linked entries started from them', () => {
    const stored = v5State();
    expect(JSON.parse(V5_BACKUP).schemaVersion).toBe(5);
    expect(stored.schemaVersion).toBe(5);
    const linked = stored.routines[0].blocks.filter((block) => 'goalId' in block);
    expect(linked.map((block) => block.id)).toEqual([
      'block-mon-side',
      'block-tue-run',
      'block-wed-side',
    ]);
    expect(stored.trackingEntries.filter((entry) => entry.goalId && entry.routineBlockId))
      .toHaveLength(3);
  });
});

describe('schema 6: routine blocks name activity types only (#60)', () => {
  it('bumps the schema without moving the repair gate', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(6);
    expect(BLOCK_GOAL_REMOVED_SCHEMA_VERSION).toBe(6);
    // v5's own subtlety, kept: only the legacy repairs are gated on 4.
    expect(STRICT_SCHEMA_VERSION).toBe(4);
  });

  it('drops every block goalId and leaves goals and tracking entries untouched', () => {
    const stored = v5State();
    const original = structuredClone(stored);
    const quarantine: QuarantinedTrackingEntry[] = [];
    const repairs: RepairedTrackingEntry[] = [];

    const migrated = migratePersistedState(stored, 5, { quarantine, repairs });

    expect(asWritten(migrated)).toEqual(expectedV6(original));
    expectGoalFree(migrated);
    // The blocks survive, in order, with their times and types.
    expect(migrated.routines[0].blocks).toEqual([
      { id: 'block-mon-side', dayOfWeek: 1, startMinutes: 1140, endMinutes: 1260, activityTypeId: 'activity-side' },
      { id: 'block-tue-run', dayOfWeek: 2, startMinutes: 420, endMinutes: 480, activityTypeId: 'activity-fitness' },
      { id: 'block-wed-side', dayOfWeek: 3, startMinutes: 1140, endMinutes: 1200, activityTypeId: 'activity-side' },
      { id: 'block-sat-side', dayOfWeek: 6, startMinutes: 600, endMinutes: 720, activityTypeId: 'activity-side' },
    ]);
    // A tracking entry still names its goal, and its block.
    expect(migrated.trackingEntries.map((entry) => [entry.id, entry.goalId, entry.routineBlockId]))
      .toEqual([
        ['entry-mon-side', 'goal-app', 'block-mon-side'],
        ['entry-manual-blog', 'goal-blog', undefined],
        ['entry-wed-side', 'goal-blog', 'block-wed-side'],
        ['entry-tue-run', 'goal-10k', 'block-tue-run'],
      ]);
    expect(migrated.currentTrackingEntryId).toBe('entry-tue-run');
    expect(migrated.preferences).toEqual({ weekStartsOn: 0 });
    // Nothing was set aside or repaired on the way, and the input was not mutated.
    expect(quarantine).toEqual([]);
    expect(repairs).toEqual([]);
    expect(stored).toEqual(original);
    // The result is a valid current store.
    expect(migratePersistedState(migrated, CURRENT_SCHEMA_VERSION)).toEqual(migrated);
  });

  it('opens a real v5 store, rewrites it at v6 without block goals, and sets nothing aside', async () => {
    const stored = v5State();
    const raw = JSON.stringify({ state: stored, version: 5 });
    await AsyncStorage.setItem(APP_STORAGE_KEY, raw);
    vi.clearAllMocks();

    await initializeAppStore({ force: true });

    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    const state = useAppStore.getState();
    expect(asWritten(state)).toEqual(expectedV6(stored));
    expectGoalFree(state);
    expect(getQuarantinedTrackingEntries()).toEqual([]);
    expect(getRepairedTrackingEntries()).toEqual([]);
    expect(await AsyncStorage.getItem(QUARANTINE_STORAGE_KEY)).toBeNull();

    const rewritten = JSON.parse((await AsyncStorage.getItem(APP_STORAGE_KEY))!) as {
      version: number;
      state: StoredState;
    };
    expect(rewritten.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(rewritten.state).toEqual(expectedV6(stored));
    expect(rewritten.state.trackingEntries).toEqual(stored.trackingEntries);
  });

  it('imports an old backup file the same way', async () => {
    const stored = v5State();

    expect(await useAppStore.getState().importData(V5_BACKUP)).toEqual({ ok: true });

    const state = useAppStore.getState();
    expect(asWritten(state)).toEqual(expectedV6(stored));
    expectGoalFree(state);
    expect(asWritten(decodeBackup(V5_BACKUP))).toEqual(expectedV6(stored));
    const persisted = JSON.parse((await AsyncStorage.getItem(APP_STORAGE_KEY))!) as {
      version: number;
      state: StoredState;
    };
    expect(persisted.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(persisted.state.routines[0].blocks.some((block) => 'goalId' in block)).toBe(false);
  });

  it('starts a scheduled block of the migrated store with no goal', async () => {
    await useAppStore.getState().importData(V5_BACKUP);
    useAppStore.getState().stopTracking();

    const entryId = useAppStore.getState().startTracking({
      activityTypeId: 'activity-side',
      routineBlockId: 'block-mon-side',
      source: 'scheduled',
    });

    const entry = useAppStore.getState().trackingEntries.find((candidate) => candidate.id === entryId);
    expect(entry).toMatchObject({ routineBlockId: 'block-mon-side', goalId: undefined });
  });
});

describe('the strict checks that used to read a block goalId', () => {
  it('no longer refuses a v5 store over a dangling or mistyped block goal it is dropping', () => {
    // Before #60 each of these threw 'Invalid routine block goal' at v4 and v5, bricking the
    // store. The link is discarded now, so there is nothing left to be invalid.
    const dangling = v5State();
    dangling.routines[0].blocks[0].goalId = 'goal-vanished';
    const mistyped = v5State();
    mistyped.routines[0].blocks[3].goalId = 'goal-10k';
    const notAString = v5State();
    notAString.routines[0].blocks[3].goalId = 42;

    for (const stored of [dangling, mistyped, notAString]) {
      const quarantine: QuarantinedTrackingEntry[] = [];
      const migrated = migratePersistedState(stored, 5, { quarantine });
      expectGoalFree(migrated);
      expect(quarantine).toEqual([]);
      expect(migrated.trackingEntries).toHaveLength(4);
    }
  });

  it('keeps an entry whose goal differs from its block\'s old goal, goal and block both', () => {
    // At v5 this entry was quarantined: its block named goal-app, the entry goal-blog. With blocks
    // naming no goal, an entry started from a block may be for any goal of the type.
    const stored = v5State();
    stored.trackingEntries[1].routineBlockId = 'block-mon-side';
    const quarantine: QuarantinedTrackingEntry[] = [];

    const migrated = migratePersistedState(stored, 5, { quarantine });

    expect(quarantine).toEqual([]);
    expect(migrated.trackingEntries[1]).toMatchObject({
      id: 'entry-manual-blog',
      goalId: 'goal-blog',
      routineBlockId: 'block-mon-side',
    });
    // Backup import, which has no quarantine sink and throws instead, accepts it too.
    const forImport = v5State();
    forImport.trackingEntries[1].routineBlockId = 'block-mon-side';
    expect(() => migratePersistedState(forImport, 5)).not.toThrow();
  });

  it('still quarantines an entry whose block is of another activity type', () => {
    // The half of the routine-block check that did not depend on a block goal is unchanged.
    const stored = v5State();
    stored.trackingEntries[1].routineBlockId = 'block-tue-run';
    const quarantine: QuarantinedTrackingEntry[] = [];

    const migrated = migratePersistedState(stored, 5, { quarantine });

    expect(quarantine).toEqual([
      expect.objectContaining({
        index: 1,
        id: 'entry-manual-blog',
        reason: 'Invalid tracking entry routineBlockId: block is missing or does not match the entry',
      }),
    ]);
    expect(migrated.trackingEntries.map((entry) => entry.id)).not.toContain('entry-manual-blog');
  });

  it('still quarantines an entry whose own goal is dangling', () => {
    const stored = v5State();
    stored.trackingEntries[1].goalId = 'goal-vanished';
    const quarantine: QuarantinedTrackingEntry[] = [];

    migratePersistedState(stored, 5, { quarantine });

    expect(quarantine.map((entry) => entry.id)).toEqual(['entry-manual-blog']);
  });

  it('keeps a v5 store on the strict path: two open timers still refuse to open', () => {
    const stored = v5State();
    stored.trackingEntries.push({ ...stored.trackingEntries[3], id: 'entry-second-open' });

    expect(() => migratePersistedState(stored, 5)).toThrow('only one entry can be open');
  });

  it('ignores a stray block goalId in a v6 blob as it does any unknown key', () => {
    const stored = { ...v5State(), schemaVersion: 6 };
    const migrated = migratePersistedState(stored, 6);
    expectGoalFree(migrated);
  });
});
