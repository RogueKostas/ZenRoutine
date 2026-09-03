import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { predictAllGoals, predictGoalCompletion } from '../../src/core/engine/prediction';
import {
  makeGoal,
  makeRoutine,
  makeRoutineBlock,
  makeTrackingEntry,
} from '../helpers/builders';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-02T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function routineWithCapacity(minutes: number) {
  return makeRoutine({
    updatedAt: '2026-02-01T00:00:00.000Z',
    blocks: [makeRoutineBlock({ endMinutes: 9 * 60 + minutes })],
  });
}

describe('shared-capacity forecasting', () => {
  it('shares unlinked capacity by priority without double-counting and reallocates it', () => {
    const high = makeGoal({
      id: 'high',
      estimatedMinutes: 500,
      priority: 1,
    });
    const low = makeGoal({
      id: 'low',
      estimatedMinutes: 500,
      priority: 5,
    });

    const predictions = predictAllGoals([high, low], routineWithCapacity(300));
    const highPrediction = predictions.find((prediction) => prediction.goalId === high.id)!;
    const lowPrediction = predictions.find((prediction) => prediction.goalId === low.id)!;

    expect(highPrediction.weeklyMinutesAllocated).toBe(250);
    expect(lowPrediction.weeklyMinutesAllocated).toBe(50);
    expect(predictions.reduce((sum, prediction) => sum + prediction.weeklyMinutesAllocated, 0))
      .toBe(300);
    expect(highPrediction).toMatchObject({
      competingGoalCount: 1,
      predictedCompletionDate: '2026-03-16',
      weeksRemaining: 2,
    });
    expect(lowPrediction.weeksRemaining).toBeCloseTo(10 / 3);
    expect(lowPrediction.predictedCompletionDate).toBe('2026-03-26');
  });

  it('splits equal priorities equally and ignores paused or completed goals', () => {
    const activeA = makeGoal({ id: 'active-a', priority: 3 });
    const activeB = makeGoal({ id: 'active-b', priority: 3 });
    const paused = makeGoal({ id: 'paused', priority: 1, status: 'paused' });
    const completed = makeGoal({ id: 'completed', priority: 1, status: 'completed' });

    const predictions = predictAllGoals(
      [activeA, paused, activeB, completed],
      routineWithCapacity(120)
    );

    expect(predictions.map((prediction) => prediction.goalId)).toEqual(['active-a', 'active-b']);
    expect(predictions.map((prediction) => prediction.weeklyMinutesAllocated)).toEqual([60, 60]);
  });

  it('keeps linked blocks dedicated and reserves links to inactive goals', () => {
    const first = makeGoal({ id: 'first', priority: 5, estimatedMinutes: 300 });
    const second = makeGoal({ id: 'second', priority: 1, estimatedMinutes: 300 });
    const routine = makeRoutine({
      updatedAt: '2026-02-01T00:00:00.000Z',
      blocks: [
        makeRoutineBlock({ id: 'first-linked', endMinutes: 600, goalId: first.id }),
        makeRoutineBlock({ id: 'shared', startMinutes: 600, endMinutes: 720 }),
        makeRoutineBlock({
          id: 'inactive-linked',
          startMinutes: 720,
          endMinutes: 780,
          goalId: 'paused-goal',
        }),
      ],
    });

    const [firstPrediction, secondPrediction] = predictAllGoals([first, second], routine);

    expect(firstPrediction).toMatchObject({
      dedicatedWeeklyMinutes: 60,
      sharedWeeklyCapacity: 120,
      weeklyMinutesAllocated: 80,
      activityWeeklyCapacity: 240,
    });
    expect(secondPrediction.weeklyMinutesAllocated).toBe(100);
    expect(firstPrediction.weeklyMinutesAllocated + secondPrediction.weeklyMinutesAllocated)
      .toBe(180);
  });

  it('keeps an unallocated competitor at low confidence despite rich activity history', () => {
    const linked = makeGoal({ id: 'linked' });
    const competitor = makeGoal({ id: 'competitor' });
    const routine = makeRoutine({
      updatedAt: '2026-02-01T00:00:00.000Z',
      blocks: [makeRoutineBlock({ endMinutes: 660, goalId: linked.id })],
    });
    const history = Array.from({ length: 14 }, (_, index) => {
      const day = String(index + 2).padStart(2, '0');
      return makeTrackingEntry({
        id: `evidence-${day}`,
        date: `2026-02-${day}`,
        startTime: `2026-02-${day}T09:00:00+00:00`,
        endTime: `2026-02-${day}T10:00:00+00:00`,
      });
    });

    const [linkedPrediction, competitorPrediction] = predictAllGoals(
      [linked, competitor],
      routine,
      history
    );

    expect(linkedPrediction.confidenceLevel).toBe('high');
    expect(competitorPrediction).toMatchObject({
      weeklyMinutesAllocated: 0,
      otherLinkedWeeklyMinutes: 120,
      predictedCompletionDate: null,
      confidenceLevel: 'low',
      evidenceDays: 0,
      confidenceReason: 'No routine time is available to this goal.',
    });
  });

  it('reports no date when matching capacity is unavailable', () => {
    const goal = makeGoal({ activityTypeId: 'missing-activity' });
    expect(predictAllGoals([goal], routineWithCapacity(120))[0]).toMatchObject({
      predictedCompletionDate: null,
      weeklyMinutesAllocated: 0,
      weeksRemaining: null,
      confidenceLevel: 'low',
    });
  });

  it('responds deterministically to schedule capacity changes', () => {
    const goal = makeGoal({ estimatedMinutes: 120 });
    const oneHour = predictAllGoals([goal], routineWithCapacity(60))[0];
    const twoHours = predictAllGoals([goal], routineWithCapacity(120))[0];

    expect(oneHour.weeksRemaining).toBe(2);
    expect(twoHours.weeksRemaining).toBe(1);
    expect(oneHour.predictedCompletionDate).toBe('2026-03-16');
    expect(twoHours.predictedCompletionDate).toBe('2026-03-09');
  });

  it('uses distinct post-routine-change tracking days as confidence evidence', () => {
    const goal = makeGoal();
    const routine = routineWithCapacity(120);
    const sameDay = Array.from({ length: 14 }, (_, index) => makeTrackingEntry({
      id: `same-${index}`,
      date: '2026-02-20',
      startTime: `2026-02-20T${String(index).padStart(2, '0')}:00:00.000Z`,
      endTime: `2026-02-20T${String(index).padStart(2, '0')}:30:00.000Z`,
    }));
    expect(predictGoalCompletion(goal, routine, sameDay)).toMatchObject({
      confidenceLevel: 'low',
      evidenceDays: 1,
    });

    const sevenDays = Array.from({ length: 7 }, (_, index) => {
      const day = String(index + 20).padStart(2, '0');
      return makeTrackingEntry({
        id: `day-${day}`,
        date: `2026-02-${day}`,
        startTime: `2026-02-${day}T09:00:00.000Z`,
        endTime: `2026-02-${day}T10:00:00.000Z`,
      });
    });
    expect(predictGoalCompletion(goal, routine, sevenDays)).toMatchObject({
      confidenceLevel: 'medium',
      evidenceDays: 7,
    });

    const changedRoutine = { ...routine, updatedAt: '2026-03-01T00:00:00.000Z' };
    expect(predictGoalCompletion(goal, changedRoutine, sevenDays)).toMatchObject({
      confidenceLevel: 'low',
      evidenceDays: 0,
      confidenceReason: 'No completed tracking days since this routine changed.',
    });
  });

  it('returns stable values by goal while preserving caller display order', () => {
    const first = makeGoal({ id: 'first', priority: 2 });
    const second = makeGoal({ id: 'second', priority: 4 });
    const routine = routineWithCapacity(180);
    const forward = predictAllGoals([first, second], routine);
    const reversed = predictAllGoals([second, first], routine);

    expect(reversed.map((prediction) => prediction.goalId)).toEqual(['second', 'first']);
    expect(Object.fromEntries(forward.map((prediction) => [prediction.goalId, prediction])))
      .toEqual(Object.fromEntries(reversed.map((prediction) => [prediction.goalId, prediction])));
  });
});
