import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { selectActiveGoals, useAppStore } from '../../src/store/useAppStore';
import {
  APP_STORAGE_KEY,
  createInitialState,
  migratePersistedState,
  selectPersistedAppState,
} from '../../src/store/persistence';
import { forecastGoals } from '../../src/core/engine/forecast';
import { predictAllGoals, predictGoalCompletion } from '../../src/core/engine/prediction';
import { validateGoal } from '../../src/core/engine/validation';
import { activeGoalsForActivityType } from '../../src/components/routine/blockGoals';
import { makeActivityType, makeAppState, makeRoutine, makeRoutineBlock } from '../helpers/builders';

const NOW = '2026-03-02T09:00:00.000Z';
const LATER = '2026-03-02T11:00:00.000Z';

const store = () => useAppStore.getState();
const goal = (id: string) => store().goals.find((candidate) => candidate.id === id)!;

/** One type with a Monday 09:00–13:00 block, and nothing else. */
function seed() {
  useAppStore.setState({
    ...makeAppState({
      activityTypes: [makeActivityType({ id: 'work', name: 'Work' })],
      routines: [makeRoutine({
        blocks: [makeRoutineBlock({ activityTypeId: 'work', startMinutes: 540, endMinutes: 780 })],
      })],
    }),
  });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  useAppStore.setState(createInitialState());
  await AsyncStorage.clear();
  seed();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a goal with only a name (#50)', () => {
  it('is created with no type and no estimate stored', () => {
    const id = store().addGoal({ name: 'Buy milk', description: '' });

    expect(id).not.toBeNull();
    expect(goal(id!)).toEqual({
      id,
      name: 'Buy milk',
      description: '',
      loggedMinutes: 0,
      status: 'active',
      order: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(validateGoal(goal(id!))).toEqual({ isValid: true, errors: [] });
  });

  it('still needs a name, and a type or estimate that is given must be real', () => {
    expect(store().addGoal({ name: '  ', description: '' })).toBeNull();
    expect(store().addGoal({ name: 'x', description: '', estimatedMinutes: 0 })).toBeNull();
    expect(store().addGoal({ name: 'x', description: '', estimatedMinutes: 1.5 })).toBeNull();
    expect(store().addGoal({ name: 'x', description: '', activityTypeId: 'missing' })).toBeNull();
    expect(store().goals).toEqual([]);
  });

  it('is listed on Home and forecast without error, and without a forecast', () => {
    const todo = store().addGoal({ name: 'Buy milk', description: '' })!;
    const work = store().addGoal({ name: 'Report', description: '', activityTypeId: 'work', estimatedMinutes: 60 })!;
    const routine = store().routines[0];

    expect(selectActiveGoals(store().goals).map((g) => g.id)).toEqual([todo, work]);

    const predictions = predictAllGoals(store().goals, routine, [], new Date(2026, 2, 1, 8, 0));
    expect(predictions.map((p) => p.goalId)).toEqual([work]);
    expect(predictions[0].predictedCompletionDate).toBe('2026-03-02');
    expect(predictGoalCompletion(goal(todo), routine)).toMatchObject({
      goalId: todo,
      predictedCompletionDate: null,
      weeksRemaining: null,
    });

    const forecast = forecastGoals({ routine, goals: store().goals, from: new Date(2026, 2, 1, 8, 0) });
    expect(forecast.unscheduled).toEqual([{ goalId: todo, reason: 'no-type' }]);
    expect(forecast.allocations.every((a) => a.goalId === work)).toBe(true);
  });

  it('is not one of the Block Editor\'s goals for any type', () => {
    store().addGoal({ name: 'Buy milk', description: '' });
    expect(activeGoalsForActivityType(store().goals, 'work')).toEqual([]);
  });

  it('cannot take tracked time until it has a type, and then can', () => {
    const todo = store().addGoal({ name: 'Draft slides', description: '' })!;

    expect(store().startTracking({ activityTypeId: 'work', goalId: todo, source: 'manual' })).toBeNull();
    expect(store().trackingEntries).toEqual([]);

    store().updateGoal(todo, { activityTypeId: 'work' });
    expect(goal(todo).activityTypeId).toBe('work');
    const entry = store().startTracking({ activityTypeId: 'work', goalId: todo, source: 'manual' });
    expect(entry).not.toBeNull();
    vi.setSystemTime(new Date(LATER));
    store().stopTracking();

    // No estimate: the time is counted, and the goal does not complete itself.
    expect(goal(todo)).toMatchObject({ loggedMinutes: 120, status: 'active' });
    expect(goal(todo)).not.toHaveProperty('estimatedMinutes');

    // Its type is now fixed by the linked entry, and cannot be removed either.
    store().updateGoal(todo, { activityTypeId: null });
    expect(goal(todo).activityTypeId).toBe('work');
  });

  it('can lose its type and estimate again with null, and keeps them when a key is left out', () => {
    const id = store().addGoal({ name: 'Report', description: '', activityTypeId: 'work', estimatedMinutes: 60 })!;

    store().updateGoal(id, { name: 'Quarterly report' });
    expect(goal(id)).toMatchObject({ activityTypeId: 'work', estimatedMinutes: 60 });

    store().updateGoal(id, { estimatedMinutes: null });
    expect(goal(id)).not.toHaveProperty('estimatedMinutes');
    expect(goal(id).activityTypeId).toBe('work');

    store().updateGoal(id, { activityTypeId: null });
    expect(goal(id)).not.toHaveProperty('activityTypeId');
    expect(Object.keys(goal(id))).not.toContain('estimatedMinutes');

    store().updateGoal(id, { estimatedMinutes: 0 });
    expect(goal(id)).not.toHaveProperty('estimatedMinutes');
    store().updateGoal(id, { activityTypeId: 'missing' });
    expect(goal(id)).not.toHaveProperty('activityTypeId');
  });

  it('reopens a goal its own time completed when the estimate grows, but not one that has none', () => {
    const id = store().addGoal({ name: 'Report', description: '', activityTypeId: 'work', estimatedMinutes: 60 })!;
    store().logMinutesToGoal(id, 60);
    expect(goal(id).status).toBe('completed');
    store().updateGoal(id, { estimatedMinutes: 120 });
    expect(goal(id).status).toBe('active');
    store().logMinutesToGoal(id, 60);
    expect(goal(id).status).toBe('completed');

    // Removing the estimate leaves a done goal done.
    store().updateGoal(id, { estimatedMinutes: null });
    expect(goal(id)).toMatchObject({ status: 'completed', completedAt: NOW });
    // And with no estimate there is no telling a ticked box from met time, so giving it one later
    // does not untick it either.
    store().updateGoal(id, { estimatedMinutes: 240 });
    expect(goal(id).status).toBe('completed');

    // A ticked to-do item stays ticked when it later gets an estimate.
    const todo = store().addGoal({ name: 'Buy milk', description: '' })!;
    store().setGoalStatus(todo, 'completed');
    store().updateGoal(todo, { estimatedMinutes: 30 });
    expect(goal(todo)).toMatchObject({ status: 'completed', estimatedMinutes: 30 });
  });

  it('is exported and imported exactly, and survives a reload', async () => {
    const todo = store().addGoal({ name: 'Buy milk', description: '' })!;
    store().addGoal({ name: 'Report', description: 'q3', activityTypeId: 'work', estimatedMinutes: 90 });
    const before = selectPersistedAppState(store());

    const exported = store().exportData();
    useAppStore.setState(createInitialState());
    expect(await store().importData(exported)).toEqual({ ok: true });
    expect(selectPersistedAppState(store())).toEqual(before);
    expect(goal(todo)).not.toHaveProperty('activityTypeId');

    // What the store wrote is what the next launch reads.
    let written: { state: unknown; version: number } | null = null;
    await vi.waitFor(async () => {
      const raw = await AsyncStorage.getItem(APP_STORAGE_KEY);
      written = raw ? JSON.parse(raw) : null;
      expect(written).not.toBeNull();
    });
    const { state, version } = written!;
    expect(selectPersistedAppState(migratePersistedState(state, version))).toEqual(before);
  });
});
