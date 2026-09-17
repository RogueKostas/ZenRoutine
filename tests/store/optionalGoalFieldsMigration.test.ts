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
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  CURRENT_SCHEMA_VERSION,
  GOAL_ORDER_SCHEMA_VERSION,
  OPTIONAL_GOAL_FIELDS_SCHEMA_VERSION,
  QUARANTINE_STORAGE_KEY,
  STRICT_SCHEMA_VERSION,
  createInitialState,
  decodeBackup,
  migratePersistedState,
  selectPersistedAppState,
} from '../../src/store/persistence';
import type { AppState } from '../../src/core/types';
import { makeAppState, makeGoal, makeTrackingEntry } from '../helpers/builders';

/**
 * A schema-7 store written by the pre-#50 store itself (`main` @ 9558403): its own
 * `initializeDefaults`, `addGoal`, `setGoalStatus`, `moveGoal`, routine, block and tracking
 * actions, with the clock and ids pinned, then the blob read back out of AsyncStorage and
 * pretty-printed. List order after two moves:
 *
 * | order | id          | type    | status    | logged |
 * |-------|-------------|---------|-----------|--------|
 * | 0     | goal-report | Work    | active    | 90     |
 * | 1     | goal-launch | Work    | active    | 0      |
 * | 2     | goal-run    | Fitness | completed | 120    |
 * | 3     | goal-paused | Work    | paused    | 0      |
 * | 4     | goal-read   | Pers.D. | active    | 0      |
 *
 * Also: an overnight block, per-type capacity stamps, a goal-linked entry started from a block,
 * a running timer linked to a goal, and an empty second routine.
 */
const V7_STORE_BLOB = readFileSync(
  join(__dirname, '..', 'fixtures', 'v7-goal-order-store.json'),
  'utf8'
);

type StoredGoal = Record<string, unknown> & { id: string };
type StoredState = Record<string, unknown> & { goals: StoredGoal[] };

function v7State(): StoredState {
  return (JSON.parse(V7_STORE_BLOB) as { state: StoredState }).state;
}

/**
 * The fixture as the v8 store holds it: only the stamp changes. The one other difference predates
 * #50 and has nothing to do with goals: an empty `capacityChangedAt` (the untouched default
 * routine's) is read as absent, as it has been since per-type stamps arrived.
 */
function expectedV8(stored: StoredState) {
  const routines = (stored.routines as Record<string, unknown>[]).map((routine) => {
    const stamps = routine.capacityChangedAt as Record<string, string> | undefined;
    if (!stamps || Object.keys(stamps).length > 0) return routine;
    const { capacityChangedAt: _empty, ...rest } = routine;
    return rest;
  });
  return { ...stored, routines, schemaVersion: CURRENT_SCHEMA_VERSION };
}

/** JSON drops `undefined`, which is exactly what a store write does. */
function asWritten(state: AppState): unknown {
  return JSON.parse(JSON.stringify(selectPersistedAppState(state)));
}

const nameOnlyGoal = (id: string, order: number) => {
  const { activityTypeId: _type, estimatedMinutes: _estimate, ...goal } = makeGoal({ id, order });
  return goal;
};

beforeEach(async () => {
  useAppStore.setState(createInitialState());
  await AsyncStorage.clear();
  vi.clearAllMocks();
});

describe('the fixture really is a pre-change v7 store', () => {
  it('has order, a type and an estimate on every goal', () => {
    const blob = JSON.parse(V7_STORE_BLOB) as { version: number; state: StoredState };
    expect(blob.version).toBe(7);
    expect(blob.state.schemaVersion).toBe(7);
    expect(blob.state.goals.map((goal) => goal.id)).toEqual([
      'goal-report', 'goal-launch', 'goal-run', 'goal-paused', 'goal-read',
    ]);
    for (const goal of blob.state.goals) {
      expect(goal).toHaveProperty('order');
      expect(typeof goal.activityTypeId).toBe('string');
      expect(goal.estimatedMinutes).toBeGreaterThan(0);
    }
  });
});

describe('schema 8: a goal\'s type and estimate are optional (#50)', () => {
  it('bumps the schema without moving the repair gate', () => {
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(OPTIONAL_GOAL_FIELDS_SCHEMA_VERSION);
    expect(OPTIONAL_GOAL_FIELDS_SCHEMA_VERSION).toBe(8);
    expect(GOAL_ORDER_SCHEMA_VERSION).toBe(7);
    expect(STRICT_SCHEMA_VERSION).toBe(4);
  });

  it('reads a real v7 store unchanged apart from the stamp', () => {
    const stored = v7State();
    const original = structuredClone(stored);

    const migrated = migratePersistedState(stored, 7);

    expect(asWritten(migrated)).toEqual(expectedV8(original));
    expect(stored).toEqual(original);
    expect(migratePersistedState(migrated, CURRENT_SCHEMA_VERSION)).toEqual(migrated);
  });

  it('opens a real v7 store, rewrites it at v8, and sets nothing aside', async () => {
    const stored = v7State();
    await AsyncStorage.setItem(APP_STORAGE_KEY, V7_STORE_BLOB);

    await initializeAppStore({ force: true });

    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    const state = useAppStore.getState();
    expect(asWritten(state)).toEqual(expectedV8(stored));
    expect(state.currentTrackingEntryId).toBe('entry-running');
    expect(getQuarantinedTrackingEntries()).toEqual([]);
    expect(getRepairedTrackingEntries()).toEqual([]);
    expect(await AsyncStorage.getItem(QUARANTINE_STORAGE_KEY)).toBeNull();

    const rewritten = JSON.parse((await AsyncStorage.getItem(APP_STORAGE_KEY))!) as {
      version: number;
      state: StoredState;
    };
    expect(rewritten.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(rewritten.state).toEqual(expectedV8(stored));
  });

  it('then lets a goal of that store lose its estimate and gain a new, name-only neighbour', async () => {
    await AsyncStorage.setItem(APP_STORAGE_KEY, V7_STORE_BLOB);
    await initializeAppStore({ force: true });
    const store = useAppStore.getState();

    store.updateGoal('goal-read', { estimatedMinutes: null });
    const todo = store.addGoal({ name: 'Buy milk', description: '' });
    expect(todo).not.toBeNull();

    await vi.waitFor(async () => {
      const written = JSON.parse((await AsyncStorage.getItem(APP_STORAGE_KEY))!) as {
        version: number;
        state: StoredState;
      };
      expect(written.state.goals).toHaveLength(6);
    });
    const written = JSON.parse((await AsyncStorage.getItem(APP_STORAGE_KEY))!) as {
      version: number;
      state: StoredState;
    };
    const read = written.state.goals.find((goal) => goal.id === 'goal-read')!;
    const milk = written.state.goals.find((goal) => goal.id === todo)!;
    expect(read).not.toHaveProperty('estimatedMinutes');
    expect(read.activityTypeId).toBe('generated-5');
    expect(milk).toMatchObject({ name: 'Buy milk', order: 5, status: 'active', loggedMinutes: 0 });
    expect(milk).not.toHaveProperty('activityTypeId');
    expect(milk).not.toHaveProperty('estimatedMinutes');

    // Reload: the next launch reads the v8 blob back exactly.
    const reloaded = migratePersistedState(written.state, written.version);
    expect(asWritten(reloaded)).toEqual(written.state);
  });

  it('imports a v7 backup exactly', async () => {
    const stored = v7State();
    const backup = JSON.stringify({
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: 7,
      exportedAt: '2026-09-17T08:00:00.000Z',
      state: stored,
    });

    expect(asWritten(decodeBackup(backup))).toEqual(expectedV8(stored));
    expect(await useAppStore.getState().importData(backup)).toEqual({ ok: true });
    expect(asWritten(useAppStore.getState())).toEqual(expectedV8(stored));
  });
});

describe('the v8 gate', () => {
  const withGoals = (goals: unknown[]) => ({ ...makeAppState(), goals });

  it.each([
    ['no estimate', 'estimatedMinutes', 'Invalid estimatedMinutes'],
    ['no activity type', 'activityTypeId', 'Invalid activityTypeId'],
  ])('still refuses a goal with %s below v8', (_label, key, message) => {
    const goal: Record<string, unknown> = { ...makeGoal() };
    delete goal[key];
    expect(() => migratePersistedState(withGoals([goal]), 7)).toThrow(message);
    expect(() => migratePersistedState(withGoals([goal]), 5)).toThrow(message);
  });

  it('accepts a name-only goal from v8, and keeps it name-only', () => {
    const migrated = migratePersistedState(withGoals([nameOnlyGoal('goal-todo', 0)]), 8);
    expect(migrated.goals).toHaveLength(1);
    expect(migrated.goals[0]).not.toHaveProperty('activityTypeId');
    expect(migrated.goals[0]).not.toHaveProperty('estimatedMinutes');
    expect(asWritten(migrated)).toEqual(asWritten(migratePersistedState(asWritten(migrated), 8)));
  });

  it('reads a null type or estimate (a hand-edited backup) as unset', () => {
    const goal = { ...makeGoal(), activityTypeId: null, estimatedMinutes: null };
    const migrated = migratePersistedState(withGoals([goal]), 8);
    expect(migrated.goals[0]).not.toHaveProperty('activityTypeId');
    expect(migrated.goals[0]).not.toHaveProperty('estimatedMinutes');
  });

  it.each([
    ['a zero estimate', { estimatedMinutes: 0 }, 'Invalid estimatedMinutes'],
    ['a fractional estimate', { estimatedMinutes: 1.5 }, 'Invalid estimatedMinutes'],
    ['a text estimate', { estimatedMinutes: '60' }, 'Invalid estimatedMinutes'],
    ['an empty type', { activityTypeId: '' }, 'Invalid activityTypeId'],
    ['a type that does not exist', { activityTypeId: 'activity-gone' }, 'referenced activity type does not exist'],
  ])('still refuses %s at v8', (_label, overrides, message) => {
    expect(() => migratePersistedState(withGoals([{ ...makeGoal(), ...overrides }]), 8))
      .toThrow(message);
  });

  it('refuses, on import, a tracking entry linked to a goal with no type', () => {
    const state = {
      ...withGoals([nameOnlyGoal('goal-todo', 0)]),
      trackingEntries: [makeTrackingEntry({ goalId: 'goal-todo' })],
    };
    expect(() => migratePersistedState(state, 8))
      .toThrow('goal is missing or uses another activity type');
  });
});
