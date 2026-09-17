import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { predictAllGoals, predictGoalCompletion } from '../../src/core/engine/prediction';
import type { RoutineBlock, TrackingEntry } from '../../src/core/types';
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

  it('pools every block of a type, so no block is reserved for one goal (#60)', () => {
    const first = makeGoal({ id: 'first', priority: 5, estimatedMinutes: 300 });
    const second = makeGoal({ id: 'second', priority: 1, estimatedMinutes: 300 });
    // Three blocks of one type, 240 minutes in all. Before #60 the first and last could be pinned
    // to a goal and held back from the pool; now they are ordinary capacity.
    const routine = makeRoutine({
      updatedAt: '2026-02-01T00:00:00.000Z',
      blocks: [
        makeRoutineBlock({ id: 'morning', endMinutes: 600 }),
        makeRoutineBlock({ id: 'midday', startMinutes: 600, endMinutes: 720 }),
        makeRoutineBlock({ id: 'afternoon', startMinutes: 720, endMinutes: 780 }),
      ],
    });

    const [firstPrediction, secondPrediction] = predictAllGoals([first, second], routine);

    // Weights 1 and 5 over the whole 240: nothing is dedicated and nothing is withheld.
    expect(firstPrediction).toMatchObject({
      weeklyMinutesAllocated: 40,
      activityWeeklyCapacity: 240,
      competingGoalCount: 1,
    });
    expect(secondPrediction).toMatchObject({
      weeklyMinutesAllocated: 200,
      activityWeeklyCapacity: 240,
    });
    expect(firstPrediction.weeklyMinutesAllocated + secondPrediction.weeklyMinutesAllocated)
      .toBe(240);
    expect(firstPrediction).not.toHaveProperty('dedicatedWeeklyMinutes');
  });

  it('ignores a goalId left on a block value, feeding the shared pool with it', () => {
    // The type no longer allows it, but a stale in-memory object is still a runtime possibility;
    // the engine must not resurrect a dedicated branch for it.
    const first = makeGoal({ id: 'first', priority: 3, estimatedMinutes: 300 });
    const second = makeGoal({ id: 'second', priority: 3, estimatedMinutes: 300 });
    const legacyLinked = { ...makeRoutineBlock({ endMinutes: 11 * 60 }), goalId: first.id };
    const linked = makeRoutine({
      updatedAt: '2026-02-01T00:00:00.000Z',
      blocks: [legacyLinked as RoutineBlock],
    });
    const plain = makeRoutine({
      updatedAt: '2026-02-01T00:00:00.000Z',
      blocks: [makeRoutineBlock({ endMinutes: 11 * 60 })],
    });

    const predictions = predictAllGoals([first, second], linked);
    expect(predictions.map((prediction) => prediction.weeklyMinutesAllocated)).toEqual([60, 60]);
    expect(predictions).toEqual(predictAllGoals([first, second], plain));
    expect(predictGoalCompletion(second, linked)).toEqual(predictGoalCompletion(second, plain));
  });

  it('keeps a goal with no scheduled time at low confidence despite rich activity history', () => {
    const goal = makeGoal({ id: 'unscheduled' });
    // The routine schedules only another activity type, so this goal's pool is empty.
    const routine = makeRoutine({
      updatedAt: '2026-02-01T00:00:00.000Z',
      blocks: [makeRoutineBlock({ endMinutes: 660, activityTypeId: 'activity-other' })],
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

    expect(predictAllGoals([goal, makeGoal({ id: 'sibling' })], routine, history)[0])
      .toMatchObject({
        weeklyMinutesAllocated: 0,
        activityWeeklyCapacity: 0,
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

describe('confidence evidence is scoped to the goal it is shown against', () => {
  /**
   * Completed hour-long days on the shared activity, attributed to `goalId`.
   * Pass `undefined` for the unlinked case that feeds the shared pool.
   */
  function evidenceDays(goalId: string | undefined, count: number, firstDayOfFebruary: number) {
    return Array.from({ length: count }, (_, index) => {
      const day = String(firstDayOfFebruary + index).padStart(2, '0');
      return makeTrackingEntry({
        id: `${goalId ?? 'unlinked'}-${day}`,
        goalId,
        date: `2026-02-${day}`,
        startTime: `2026-02-${day}T09:00:00.000Z`,
        endTime: `2026-02-${day}T10:00:00.000Z`,
      });
    });
  }

  /** Two active goals of one activity type, each really allocated 150 min/week. */
  const goalA = makeGoal({ id: 'goal-a' });
  const goalB = makeGoal({ id: 'goal-b' });

  function predictPair(history: TrackingEntry[]) {
    const [a, b] = predictAllGoals([goalA, goalB], routineWithCapacity(300), history);
    expect(a.weeklyMinutesAllocated).toBe(150);
    expect(b.weeklyMinutesAllocated).toBe(150);
    return { a, b };
  }

  it('reports different confidence for co-allocated goals with different histories', () => {
    const { a, b } = predictPair([
      ...evidenceDays(goalA.id, 14, 2),
      ...evidenceDays(goalB.id, 7, 16),
    ]);

    expect(a).toMatchObject({ confidenceLevel: 'high', evidenceDays: 14 });
    expect(b).toMatchObject({ confidenceLevel: 'medium', evidenceDays: 7 });
  });

  it('never lets a goal inherit a sibling goal\'s evidence', () => {
    const history = evidenceDays(goalA.id, 14, 2);
    const { a, b } = predictPair(history);

    expect(a).toMatchObject({ confidenceLevel: 'high', evidenceDays: 14 });
    expect(b).toMatchObject({
      confidenceLevel: 'low',
      evidenceDays: 0,
      confidenceReason: 'No completed tracking days since this routine changed.',
    });
    expect(predictGoalCompletion(goalB, routineWithCapacity(300), history)).toMatchObject({
      confidenceLevel: 'low',
      evidenceDays: 0,
    });
  });

  it('counts unlinked tracking as evidence for every goal sharing the pool', () => {
    // Deliberate: unlinked time is the shared pool this model divides between
    // these goals, so it is evidence for both. Only time attributed to a
    // different goal is excluded.
    const { a, b } = predictPair([
      ...evidenceDays(undefined, 14, 2),
      ...evidenceDays('goal-elsewhere', 14, 2),
    ]);

    expect(a).toMatchObject({ confidenceLevel: 'high', evidenceDays: 14 });
    expect(b).toMatchObject({ confidenceLevel: 'high', evidenceDays: 14 });
  });
});

describe('confidence evidence is scoped to the activity type whose capacity changed', () => {
  const ACTIVITY = 'activity-focus';
  const OTHER_ACTIVITY = 'activity-fitness';
  const OLD_CHANGE = '2026-02-01T00:00:00.000Z';
  const NEW_CHANGE = '2026-03-01T00:00:00.000Z';

  /** Fourteen distinct completed days on ACTIVITY, all after OLD_CHANGE. */
  function fourteenEvidenceDays() {
    return Array.from({ length: 14 }, (_, index) => {
      const day = String(index + 2).padStart(2, '0');
      return makeTrackingEntry({
        id: `evidence-${day}`,
        date: `2026-02-${day}`,
        startTime: `2026-02-${day}T09:00:00.000Z`,
        endTime: `2026-02-${day}T10:00:00.000Z`,
      });
    });
  }

  function twoActivityRoutine(
    capacityChangedAt: Record<string, string> | undefined,
    updatedAt = OLD_CHANGE
  ) {
    return makeRoutine({
      updatedAt,
      capacityChangedAt,
      blocks: [
        makeRoutineBlock({ id: 'focus-block', endMinutes: 11 * 60 }),
        makeRoutineBlock({
          id: 'fitness-block',
          startMinutes: 12 * 60,
          endMinutes: 13 * 60,
          activityTypeId: OTHER_ACTIVITY,
        }),
      ],
    });
  }

  it('keeps evidence when a block of another activity type is edited', () => {
    const goal = makeGoal();
    const history = fourteenEvidenceDays();
    const before = twoActivityRoutine({
      [ACTIVITY]: OLD_CHANGE,
      [OTHER_ACTIVITY]: OLD_CHANGE,
    });
    // What the store writes when only a fitness block moves: the routine's own
    // updatedAt advances, but the focus activity's capacity did not change.
    const afterUnrelatedEdit = {
      ...before,
      updatedAt: NEW_CHANGE,
      capacityChangedAt: { ...before.capacityChangedAt, [OTHER_ACTIVITY]: NEW_CHANGE },
    };

    expect(predictGoalCompletion(goal, before, history)).toMatchObject({
      confidenceLevel: 'high',
      evidenceDays: 14,
    });
    expect(predictGoalCompletion(goal, afterUnrelatedEdit, history)).toMatchObject({
      confidenceLevel: 'high',
      evidenceDays: 14,
    });
    expect(predictAllGoals([goal], afterUnrelatedEdit, history)[0]).toMatchObject({
      confidenceLevel: 'high',
      evidenceDays: 14,
    });
  });

  it('resets evidence when the capacity that feeds the goal changes', () => {
    const goal = makeGoal();
    const history = fourteenEvidenceDays();
    const afterOwnEdit = twoActivityRoutine(
      { [ACTIVITY]: NEW_CHANGE, [OTHER_ACTIVITY]: OLD_CHANGE },
      NEW_CHANGE
    );

    expect(predictGoalCompletion(goal, afterOwnEdit, history)).toMatchObject({
      confidenceLevel: 'low',
      evidenceDays: 0,
      confidenceReason: 'No completed tracking days since this routine changed.',
    });
    expect(predictAllGoals([goal], afterOwnEdit, history)[0]).toMatchObject({
      confidenceLevel: 'low',
      evidenceDays: 0,
    });
  });

  it('falls back to the whole-routine timestamp when no capacity timestamps exist', () => {
    const goal = makeGoal();
    const history = fourteenEvidenceDays();
    const preMigration = twoActivityRoutine(undefined);
    expect(preMigration.capacityChangedAt).toBeUndefined();

    expect(predictGoalCompletion(goal, preMigration, history)).toMatchObject({
      confidenceLevel: 'high',
      evidenceDays: 14,
    });
    expect(
      predictGoalCompletion(goal, { ...preMigration, updatedAt: NEW_CHANGE }, history)
    ).toMatchObject({
      confidenceLevel: 'low',
      evidenceDays: 0,
    });
  });
});
