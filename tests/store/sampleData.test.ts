import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppState, Routine } from '../../src/core/types';
import { predictAllGoals } from '../../src/core/engine/prediction';
import { findOverlappingBlocks, validateRoutineBlock } from '../../src/core/engine/validation';
import { getRoutineBlockDurationMinutes } from '../../src/core/utils/time';
import { useAppStore } from '../../src/store/useAppStore';
import {
  CURRENT_SCHEMA_VERSION,
  migratePersistedState,
  selectPersistedAppState,
} from '../../src/store/persistence';
import { SAMPLE_ROUTINE_NAME, isFirstRunEmpty } from '../../src/store/sampleData';

// A Monday morning, local time.
const frozenTime = new Date(2026, 8, 14, 9, 30);

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(frozenTime);
  await useAppStore.persist.rehydrate();
  await useAppStore.getState().resetState();
  await useAppStore.persist.clearStorage();
});

afterEach(() => {
  vi.useRealTimers();
});

function activeRoutineOf(state: AppState): Routine {
  const routine = state.routines.find((candidate) => candidate.id === state.activeRoutineId);
  if (!routine) throw new Error('no active routine');
  return routine;
}

function forecast(state: AppState) {
  return predictAllGoals(state.goals, activeRoutineOf(state), state.trackingEntries);
}

function scheduledMinutesOn(routine: Routine, day: number): number {
  return routine.blocks
    .filter((block) => block.dayOfWeek === day)
    .reduce((sum, block) => sum + getRoutineBlockDurationMinutes(block), 0);
}

describe('example data (#62)', () => {
  it('is offered on a fresh store and not once it is loaded', () => {
    expect(isFirstRunEmpty(useAppStore.getState())).toBe(true);

    // What "Try it with example data" does on the last onboarding slide.
    expect(useAppStore.getState()._addSampleData()).toBe(true);
    useAppStore.getState().completeOnboarding();

    const state = useAppStore.getState();
    expect(state.hasCompletedOnboarding).toBe(true);
    expect(isFirstRunEmpty(state)).toBe(false);
  });

  it('shows a confident and a low-confidence forecast side by side', () => {
    useAppStore.getState()._addSampleData();
    const state = useAppStore.getState();
    const predictions = forecast(state);

    expect(predictions.length).toBeGreaterThanOrEqual(4);
    const levels = predictions.map((prediction) => prediction.confidenceLevel);
    expect(levels).toContain('high');
    expect(levels).toContain('low');
    const byName = Object.fromEntries(predictions.map((prediction) => [
      state.goals.find((goal) => goal.id === prediction.goalId)!.name,
      `${prediction.confidenceLevel}/${prediction.evidenceDays}`,
    ]));
    expect(byName).toEqual({
      'Ship the analytics dashboard': 'high/15',
      'Write the Q4 planning doc': 'high/15',
      'Half-marathon training block': 'medium/12',
      'Finish the TypeScript course': 'low/3',
      "Read 'Deep Work'": 'low/0',
    });
    // Every goal is forecastable and none was completed by its own history.
    for (const prediction of predictions) {
      expect(prediction.predictedCompletionDate).not.toBeNull();
    }
    expect(state.goals.every((goal) => goal.status === 'active')).toBe(true);
    expect(state.goals.some((goal) => goal.loggedMinutes > 0)).toBe(true);
  });

  it('is a full weekday routine with lighter weekends, across several types and estimates', () => {
    useAppStore.getState()._addSampleData();
    const state = useAppStore.getState();
    const routine = activeRoutineOf(state);

    // The empty default routine was filled in place, not left as a duplicate.
    expect(state.routines).toHaveLength(1);
    expect(routine.name).toBe(SAMPLE_ROUTINE_NAME);

    for (const block of routine.blocks) {
      expect(validateRoutineBlock(block).isValid).toBe(true);
      expect(findOverlappingBlocks(routine.blocks, block)).toEqual([]);
      expect(block.goalId).toBeUndefined();
    }
    const weekday = [1, 2, 3, 4, 5].map((day) => scheduledMinutesOn(routine, day));
    const weekend = [0, 6].map((day) => scheduledMinutesOn(routine, day));
    expect(Math.min(...weekday)).toBeGreaterThanOrEqual(8 * 60);
    expect(Math.min(...weekend)).toBeGreaterThan(0);
    expect(Math.max(...weekend)).toBeLessThan(Math.min(...weekday));

    expect(new Set(routine.blocks.map((block) => block.activityTypeId)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(state.goals.map((goal) => goal.activityTypeId)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(state.goals.map((goal) => goal.estimatedMinutes)).size).toBe(state.goals.length);
  });

  it.each([
    ['a Thursday evening', new Date(2026, 8, 17, 21, 0)],
    ['a Sunday years from now', new Date(2031, 1, 2, 7, 15)],
  ])('stays relative to now when loaded on %s', (_label, now) => {
    vi.setSystemTime(now);
    useAppStore.getState()._addSampleData();
    const state = useAppStore.getState();

    const ends = state.trackingEntries.map((entry) => Date.parse(entry.endTime!));
    expect(Math.max(...ends)).toBeLessThanOrEqual(now.getTime());
    expect(now.getTime() - Math.max(...ends)).toBeLessThan(2 * 24 * 60 * 60 * 1000);
    const levels = forecast(state).map((prediction) => prediction.confidenceLevel);
    expect(levels).toContain('high');
    expect(levels).toContain('low');
  });

  it('keeps its forecasts across a save and strict reload', () => {
    useAppStore.getState()._addSampleData();
    const before = useAppStore.getState();
    const reloaded = migratePersistedState(
      JSON.parse(JSON.stringify(selectPersistedAppState(before))),
      CURRENT_SCHEMA_VERSION
    );
    expect(reloaded.trackingEntries).toHaveLength(before.trackingEntries.length);
    expect(forecast(reloaded).map((p) => p.confidenceLevel))
      .toEqual(forecast(before).map((p) => p.confidenceLevel));
  });
});

describe('loading example data over existing data', () => {
  function seedUserData() {
    const store = useAppStore.getState();
    // The user renamed Fitness, so the sample has to bring its own.
    const fitness = store.activityTypes.find((activity) => activity.name === 'Fitness')!;
    store.updateActivityType(fitness.id, { name: 'Climbing' });
    const routineId = store.activeRoutineId!;
    store.addRoutineBlock(routineId, {
      dayOfWeek: 2,
      startMinutes: 18 * 60,
      endMinutes: 20 * 60,
      activityTypeId: fitness.id,
    });
    const goalId = store.addGoal({
      name: 'Send a V5',
      description: '',
      estimatedMinutes: 600,
      activityTypeId: fitness.id,
    })!;
    store.addCompletedEntry({
      date: '2026-09-08',
      startTime: new Date(2026, 8, 8, 18).toISOString(),
      endTime: new Date(2026, 8, 8, 20).toISOString(),
      activityTypeId: fitness.id,
      goalId,
      source: 'manual',
    });
    return selectPersistedAppState(useAppStore.getState());
  }

  it('adds alongside it, leaving every existing record untouched and the user routine active', () => {
    const before = seedUserData();
    expect(isFirstRunEmpty(before)).toBe(false);

    expect(useAppStore.getState()._addSampleData()).toBe(true);
    const after = useAppStore.getState();

    expect(after.activeRoutineId).toBe(before.activeRoutineId);
    for (const key of ['activityTypes', 'goals', 'routines', 'trackingEntries'] as const) {
      expect(after[key].slice(0, before[key].length)).toEqual(before[key]);
      expect(after[key].length).toBeGreaterThan(before[key].length);
    }
    const example = after.routines.find((routine) => routine.name === SAMPLE_ROUTINE_NAME)!;
    expect(example.isActive).toBe(false);
    expect(after.activityTypes.filter((activity) => activity.name === 'Fitness')).toHaveLength(1);
  });

  it('does nothing the second time', () => {
    expect(useAppStore.getState()._addSampleData()).toBe(true);
    const once = selectPersistedAppState(useAppStore.getState());
    expect(useAppStore.getState()._addSampleData()).toBe(false);
    expect(selectPersistedAppState(useAppStore.getState())).toEqual(once);
  });

  it('activates the example routine when no routine is active', () => {
    useAppStore.getState().setActiveRoutine(null);
    const kept = useAppStore.getState().routines[0];

    useAppStore.getState()._addSampleData();
    const state = useAppStore.getState();

    expect(state.routines[0]).toEqual({ ...kept, isActive: false });
    expect(activeRoutineOf(state).name).toBe(SAMPLE_ROUTINE_NAME);
    expect(forecast(state).map((p) => p.confidenceLevel)).toContain('high');
  });
});
