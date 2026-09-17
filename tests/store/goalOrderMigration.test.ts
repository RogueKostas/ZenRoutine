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
  QUARANTINE_STORAGE_KEY,
  STRICT_SCHEMA_VERSION,
  createInitialState,
  decodeBackup,
  encodeBackup,
  migratePersistedState,
  orderGoalsByLegacyPriority,
  selectPersistedAppState,
} from '../../src/store/persistence';
import type { AppState } from '../../src/core/types';
import { makeAppState, makeGoal, withListOrder } from '../helpers/builders';

/**
 * A schema-6 store written by the pre-#49 store itself (`main` @ a30a862): its own `addGoal`,
 * `setGoalStatus`, block and tracking actions, with the clock and ids pinned, then the blob read
 * back out of AsyncStorage and pretty-printed. Six goals, added in this order:
 *
 * | id           | priority | createdAt          | status    |
 * |--------------|----------|--------------------|-----------|
 * | goal-read    | 5        | 09-01 08:00        | active    |
 * | goal-run     | 2        | 09-01 09:00        | completed |
 * | goal-zeta    | 3        | 09-02 08:00        | active    |
 * | goal-report  | 3        | 09-02 08:00 (same) | active    |
 * | goal-launch  | 1        | 09-03 08:00        | active    |
 * | goal-paused  | 1        | 09-05 08:00        | paused    |
 *
 * Also: an overnight block, a Sunday block, per-type capacity stamps, a goal-linked entry started
 * from a block, a running timer and a Sunday week start.
 */
const V6_STORE_BLOB = readFileSync(
  join(__dirname, '..', 'fixtures', 'v6-priority-store.json'),
  'utf8'
);

/** Priority first, then oldest, then id: `goal-report` < `goal-zeta` breaks their tie. */
const DERIVED_ORDER = [
  'goal-launch',
  'goal-paused',
  'goal-run',
  'goal-report',
  'goal-zeta',
  'goal-read',
];

type StoredGoal = Record<string, unknown> & { id: string };
type StoredState = Record<string, unknown> & { goals: StoredGoal[] };

function v6State(): StoredState {
  return (JSON.parse(V6_STORE_BLOB) as { state: StoredState }).state;
}

/** The fixture as the v7 store holds it: goals in the derived order, and nothing else changed. */
function expectedV7(stored: StoredState) {
  const { schemaVersion: _stamp, ...rest } = stored;
  return { ...withListOrder(rest, DERIVED_ORDER), schemaVersion: CURRENT_SCHEMA_VERSION };
}

/** JSON drops `undefined`, which is exactly what a store write does. */
function asWritten(state: AppState): unknown {
  return JSON.parse(JSON.stringify(selectPersistedAppState(state)));
}

beforeEach(async () => {
  useAppStore.setState(createInitialState());
  await AsyncStorage.clear();
  vi.clearAllMocks();
});

describe('the fixture really is a pre-change v6 store', () => {
  it('has a priority on every goal and no order', () => {
    const blob = JSON.parse(V6_STORE_BLOB) as { version: number; state: StoredState };
    expect(blob.version).toBe(6);
    expect(blob.state.schemaVersion).toBe(6);
    expect(blob.state.goals.map((goal) => [goal.id, goal.priority])).toEqual([
      ['goal-read', 5],
      ['goal-run', 2],
      ['goal-zeta', 3],
      ['goal-report', 3],
      ['goal-launch', 1],
      ['goal-paused', 1],
    ]);
    for (const goal of blob.state.goals) expect(goal).not.toHaveProperty('order');
  });
});

describe('schema 7: goal priority becomes list order (#49)', () => {
  it('bumps the schema without moving the repair gate', () => {
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(GOAL_ORDER_SCHEMA_VERSION);
    expect(GOAL_ORDER_SCHEMA_VERSION).toBe(7);
    expect(STRICT_SCHEMA_VERSION).toBe(4);
  });

  it('orders by priority, then createdAt, then id, whatever order the goals arrive in', () => {
    const goal = (id: string, priority: number, createdAt: string) => ({
      goal: { id, createdAt },
      priority,
    });
    const goals = [
      goal('b', 3, '2026-09-02T08:00:00.000Z'),
      goal('late-high', 1, '2026-09-09T08:00:00.000Z'),
      goal('a', 3, '2026-09-02T08:00:00.000Z'),
      // The same instant written with an offset: compared as time, not as text.
      goal('offset', 3, '2026-09-02T09:59:00.000+02:00'),
      goal('early-high', 1, '2026-09-01T08:00:00.000Z'),
      goal('low', 5, '2026-08-01T08:00:00.000Z'),
      // Code-unit order, not locale order: 'Z' sorts before 'a'.
      goal('Z', 3, '2026-09-02T08:00:00.000Z'),
    ];
    const expected = [
      ['early-high', 0],
      ['late-high', 1],
      ['offset', 2],
      ['Z', 3],
      ['a', 4],
      ['b', 5],
      ['low', 6],
    ];

    expect(orderGoalsByLegacyPriority(goals).map((g) => [g.id, g.order])).toEqual(expected);
    expect(orderGoalsByLegacyPriority([...goals].reverse()).map((g) => [g.id, g.order]))
      .toEqual(expected);
  });

  it('keeps every goal of a real v6 store, in the derived order, and changes nothing else', () => {
    const stored = v6State();
    const original = structuredClone(stored);

    const migrated = migratePersistedState(stored, 6);

    expect(migrated.goals.map((goal) => goal.id)).toEqual(DERIVED_ORDER);
    expect(migrated.goals.map((goal) => goal.order)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const goal of migrated.goals) expect(goal).not.toHaveProperty('priority');
    expect(asWritten(migrated)).toEqual(expectedV7(original));
    // Spelled out, since these are what a goal migration could plausibly disturb.
    const { goals: _goals, schemaVersion: _stamp, ...others } = original;
    const { goals: _migratedGoals, schemaVersion: _stamp2, ...migratedOthers } =
      asWritten(migrated) as StoredState;
    expect(migratedOthers).toEqual(others);
    expect(stored).toEqual(original);
    expect(migratePersistedState(migrated, CURRENT_SCHEMA_VERSION)).toEqual(migrated);
  });

  it('opens a real v6 store, rewrites it at v7, and sets nothing aside', async () => {
    const stored = v6State();
    await AsyncStorage.setItem(APP_STORAGE_KEY, V6_STORE_BLOB);

    await initializeAppStore({ force: true });

    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    const state = useAppStore.getState();
    expect(state.goals.map((goal) => goal.id)).toEqual(DERIVED_ORDER);
    expect(asWritten(state)).toEqual(expectedV7(stored));
    expect(state.currentTrackingEntryId).toBe('entry-running');
    expect(state.preferences).toEqual({ weekStartsOn: 0 });
    expect(getQuarantinedTrackingEntries()).toEqual([]);
    expect(getRepairedTrackingEntries()).toEqual([]);
    expect(await AsyncStorage.getItem(QUARANTINE_STORAGE_KEY)).toBeNull();

    const rewritten = JSON.parse((await AsyncStorage.getItem(APP_STORAGE_KEY))!) as {
      version: number;
      state: StoredState;
    };
    expect(rewritten.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(rewritten.state).toEqual(expectedV7(stored));

    // And the next launch's strict read gives it back unchanged.
    expect(asWritten(migratePersistedState(rewritten.state, rewritten.version)))
      .toEqual(expectedV7(stored));
  });

  it('imports an old backup that still has priorities with the same derived order', async () => {
    const stored = v6State();
    const backup = JSON.stringify({
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: 6,
      exportedAt: '2026-09-16T08:00:00.000Z',
      state: stored,
    });

    expect(asWritten(decodeBackup(backup))).toEqual(expectedV7(stored));
    expect(await useAppStore.getState().importData(backup)).toEqual({ ok: true });
    expect(useAppStore.getState().goals.map((goal) => goal.id)).toEqual(DERIVED_ORDER);
  });

  it('exports and re-imports a reordered list exactly', async () => {
    await AsyncStorage.setItem(APP_STORAGE_KEY, V6_STORE_BLOB);
    await initializeAppStore({ force: true });
    useAppStore.getState().moveGoal('goal-read', { before: 'goal-launch' });
    const reordered = useAppStore.getState().goals.map((goal) => goal.id);
    expect(reordered[0]).toBe('goal-read');

    const exported = useAppStore.getState().exportData();
    expect((JSON.parse(exported) as { schemaVersion: number }).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    useAppStore.setState(createInitialState());
    expect(await useAppStore.getState().importData(exported)).toEqual({ ok: true });

    expect(useAppStore.getState().goals.map((goal) => goal.id)).toEqual(reordered);
    expect(useAppStore.getState().goals.map((goal) => goal.order)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('reading order at v7', () => {
  const stateWith = (orders: unknown[]) => ({
    ...makeAppState(),
    goals: orders.map((order, index) => ({ ...makeGoal({ id: `goal-${index}` }), order })),
  });

  it('sorts by order and closes gaps, keeping relative order', () => {
    const migrated = migratePersistedState(stateWith([7, 2, 40]), CURRENT_SCHEMA_VERSION);
    expect(migrated.goals.map((goal) => [goal.id, goal.order])).toEqual([
      ['goal-1', 0],
      ['goal-0', 1],
      ['goal-2', 2],
    ]);
  });

  it('ignores a priority left on a v7 goal', () => {
    const state = {
      ...makeAppState(),
      goals: [
        { ...makeGoal({ id: 'goal-0' }), order: 1, priority: 1 },
        { ...makeGoal({ id: 'goal-1' }), order: 0 },
      ],
    };
    const migrated = migratePersistedState(state, CURRENT_SCHEMA_VERSION);
    expect(migrated.goals.map((goal) => goal.id)).toEqual(['goal-1', 'goal-0']);
    expect(migrated.goals[1]).not.toHaveProperty('priority');
  });

  it.each([
    ['a missing order', [0, undefined], 'Invalid order'],
    ['a fractional order', [0, 0.5], 'Invalid order'],
    ['a negative order', [0, -1], 'Invalid order'],
    ['a shared order', [1, 1], 'two goals share a list position'],
  ])('refuses %s', (_label, orders, message) => {
    expect(() => migratePersistedState(stateWith(orders), CURRENT_SCHEMA_VERSION))
      .toThrow(message);
  });

  it('round-trips through a backup', () => {
    const state = migratePersistedState(stateWith([2, 0, 1]), CURRENT_SCHEMA_VERSION);
    expect(decodeBackup(encodeBackup(state))).toEqual(selectPersistedAppState(state));
  });
});
