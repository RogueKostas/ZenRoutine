import { beforeEach, describe, expect, it } from 'vitest';

import {
  QUICK_ADD_GOAL_ESTIMATE_MINUTES,
  activeGoalsForActivityType,
  quickAddGoal,
} from '../../src/components/routine/blockGoals';
import { useAppStore } from '../../src/store/useAppStore';
import { createInitialState } from '../../src/store/persistence';
import { makeGoal } from '../helpers/builders';

describe('Goals for this activity type (Block Editor, #48/#60)', () => {
  // Array order deliberately disagrees with list order: `order` is what counts (#49).
  const goals = [
    makeGoal({ id: 'side-low', activityTypeId: 'side', order: 6 }),
    makeGoal({ id: 'fitness', activityTypeId: 'fitness', order: 1 }),
    makeGoal({ id: 'side-high', activityTypeId: 'side', order: 0 }),
    makeGoal({ id: 'side-paused', activityTypeId: 'side', order: 2, status: 'paused' }),
    makeGoal({ id: 'side-mid-a', activityTypeId: 'side', order: 3 }),
    makeGoal({ id: 'side-done', activityTypeId: 'side', order: 4, status: 'completed' }),
    makeGoal({ id: 'side-mid-b', activityTypeId: 'side', order: 5 }),
  ];

  it('lists only the type\'s active goals, in list order', () => {
    expect(activeGoalsForActivityType(goals, 'side').map((goal) => goal.id)).toEqual([
      'side-high',
      'side-mid-a',
      'side-mid-b',
      'side-low',
    ]);
  });

  it('lists nothing before a type is chosen, and leaves the input alone', () => {
    const before = goals.map((goal) => goal.id);
    expect(activeGoalsForActivityType(goals, null)).toEqual([]);
    activeGoalsForActivityType(goals, 'side');
    expect(goals.map((goal) => goal.id)).toEqual(before);
  });

  it('quick-adds a named goal of the type with the default estimate', () => {
    expect(quickAddGoal('  Test goal ', 'side')).toEqual({
      ok: true,
      goal: {
        name: 'Test goal',
        description: '',
        estimatedMinutes: 60,
        activityTypeId: 'side',
      },
    });
    expect(QUICK_ADD_GOAL_ESTIMATE_MINUTES).toBe(60);
  });

  it('refuses a blank name or a missing type', () => {
    expect(quickAddGoal('   ', 'side')).toEqual({ ok: false, error: 'Enter a name for the goal.' });
    expect(quickAddGoal('Test goal', null)).toEqual({
      ok: false,
      error: 'Choose an activity type first.',
    });
  });

  describe('against the store', () => {
    beforeEach(() => {
      useAppStore.setState(createInitialState());
    });

    it('creates a goal the store accepts, and touches no routine block', () => {
      const store = useAppStore.getState();
      const activityTypeId = store.activityTypes[0].id;
      const routineId = store.addRoutine('Week');
      const blockId = store.addRoutineBlock(routineId, {
        dayOfWeek: 1,
        startMinutes: 540,
        endMinutes: 600,
        activityTypeId,
      });
      const routinesBefore = useAppStore.getState().routines;

      const request = quickAddGoal('Test goal', activityTypeId);
      if (!request.ok) throw new Error(request.error);
      const goalId = useAppStore.getState().addGoal(request.goal);

      expect(goalId).not.toBeNull();
      expect(useAppStore.getState().goals).toEqual([
        expect.objectContaining({
          id: goalId,
          name: 'Test goal',
          activityTypeId,
          estimatedMinutes: 60,
          status: 'active',
        }),
      ]);
      expect(useAppStore.getState().routines).toBe(routinesBefore);
      expect(blockId).not.toBeNull();
      expect(
        activeGoalsForActivityType(useAppStore.getState().goals, activityTypeId)
          .map((goal) => goal.name)
      ).toEqual(['Test goal']);
    });
  });
});
