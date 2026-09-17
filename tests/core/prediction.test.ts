import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { moveGoalInList } from '../../src/core/engine/goalOrder';
import {
  GOAL_FORECAST_EXPLAINER,
  describeGoalQueue,
  predictAllGoals,
  predictGoalCompletion,
} from '../../src/core/engine/prediction';
import type { RoutineBlock, TrackingEntry } from '../../src/core/types';
import {
  makeGoal,
  makeRoutine,
  makeRoutineBlock,
  makeTrackingEntry,
} from '../helpers/builders';

const WEEK_MINUTES = 7 * 24 * 60;

beforeEach(() => {
  vi.useFakeTimers();
  // Monday 2 March 2026, 08:00 local: before the 09:00 blocks below, in any time zone. The
  // forecast walks local days, so a UTC instant here would move the dates with the host zone.
  vi.setSystemTime(new Date(2026, 2, 2, 8, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

/** One Monday block from 09:00, `minutes` long. */
function routineWithCapacity(minutes: number) {
  return makeRoutine({
    updatedAt: '2026-02-01T00:00:00.000Z',
    blocks: [makeRoutineBlock({ endMinutes: 9 * 60 + minutes })],
  });
}

describe('list-order forecasting (#49)', () => {
  it('gives the top goal all of its type\'s time, then the next goal', () => {
    const top = makeGoal({ id: 'top', estimatedMinutes: 500, order: 0 });
    const next = makeGoal({ id: 'next', estimatedMinutes: 500, order: 1 });

    const [topPrediction, nextPrediction] = predictAllGoals([top, next], routineWithCapacity(300));

    // Top: 300 today, 200 next Monday (done 12:20). Next: 100 next Monday, 300, then 100.
    expect(topPrediction).toMatchObject({
      predictedCompletionDate: '2026-03-09',
      weeklyMinutesAllocated: 300,
      allocationShare: 1,
      activityWeeklyCapacity: 300,
      competingGoalCount: 1,
      goalsAhead: 0,
      remainingMinutes: 500,
    });
    expect(topPrediction.weeksRemaining).toBeCloseTo((WEEK_MINUTES + 260) / WEEK_MINUTES);
    expect(nextPrediction).toMatchObject({
      predictedCompletionDate: '2026-03-23',
      weeklyMinutesAllocated: 0,
      allocationShare: 0,
      competingGoalCount: 1,
      goalsAhead: 1,
    });
    expect(nextPrediction.weeksRemaining).toBeCloseTo((3 * WEEK_MINUTES + 160) / WEEK_MINUTES);
  });

  it('reads the order from `order`, not from where the goal sits in the array', () => {
    const top = makeGoal({ id: 'top', estimatedMinutes: 500, order: 1 });
    const next = makeGoal({ id: 'next', estimatedMinutes: 500, order: 0 });

    const predictions = predictAllGoals([top, next], routineWithCapacity(300));

    expect(predictions.map((prediction) => prediction.goalId)).toEqual(['top', 'next']);
    expect(predictions.map((prediction) => prediction.predictedCompletionDate))
      .toEqual(['2026-03-23', '2026-03-09']);
  });

  it('moves both dates when the director\'s two goals are reordered (review 27:18)', () => {
    // Every day a 09:00–13:00 Work block; from Monday 21 Sep 2026, 00:00 local.
    const monday = new Date(2026, 8, 21, 0, 0);
    const routine = makeRoutine({
      updatedAt: '2026-09-01T00:00:00.000Z',
      blocks: [1, 2, 3, 4, 5, 6, 0].map((day) => makeRoutineBlock({
        id: `work-${day}`,
        dayOfWeek: day as RoutineBlock['dayOfWeek'],
        startMinutes: 9 * 60,
        endMinutes: 13 * 60,
      })),
    });
    const listed = [
      makeGoal({ id: 'design-ftue', estimatedMinutes: 6 * 60, order: 0 }),
      makeGoal({ id: 'integrate-analytics', estimatedMinutes: 8 * 60, order: 1 }),
    ];
    const dates = (goals: readonly ReturnType<typeof makeGoal>[]) => Object.fromEntries(
      predictAllGoals([...goals], routine, [], monday)
        .map((prediction) => [prediction.goalId, prediction.predictedCompletionDate])
    );

    expect(dates(listed)).toEqual({
      'design-ftue': '2026-09-22',
      'integrate-analytics': '2026-09-24',
    });

    const reordered = moveGoalInList(
      listed, 'integrate-analytics', { before: 'design-ftue' }, monday.toISOString()
    );
    expect(dates(reordered)).toEqual({
      'integrate-analytics': '2026-09-22',
      'design-ftue': '2026-09-24',
    });
  });

  it('ignores paused or completed goals, which hold no place in the queue', () => {
    const paused = makeGoal({ id: 'paused', status: 'paused', order: 0 });
    const activeA = makeGoal({ id: 'active-a', order: 1 });
    const completed = makeGoal({ id: 'completed', status: 'completed', order: 2 });
    const activeB = makeGoal({ id: 'active-b', order: 3 });

    const predictions = predictAllGoals(
      [activeA, paused, activeB, completed],
      routineWithCapacity(120)
    );

    expect(predictions.map((prediction) => prediction.goalId)).toEqual(['active-a', 'active-b']);
    expect(predictions.map((prediction) => prediction.goalsAhead)).toEqual([0, 1]);
    expect(predictions.map((prediction) => prediction.weeklyMinutesAllocated)).toEqual([120, 0]);
    expect(predictions.map((prediction) => prediction.predictedCompletionDate))
      .toEqual(['2026-03-02', '2026-03-09']);
  });

  it('pools every block of a type, so no block is reserved for one goal (#60)', () => {
    const first = makeGoal({ id: 'first', estimatedMinutes: 300, order: 0 });
    const second = makeGoal({ id: 'second', estimatedMinutes: 300, order: 1 });
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

    // All three blocks go to the top goal this week: nothing is dedicated and nothing withheld.
    expect(firstPrediction).toMatchObject({
      weeklyMinutesAllocated: 240,
      activityWeeklyCapacity: 240,
      competingGoalCount: 1,
      predictedCompletionDate: '2026-03-09',
    });
    expect(secondPrediction).toMatchObject({
      weeklyMinutesAllocated: 0,
      activityWeeklyCapacity: 240,
      predictedCompletionDate: '2026-03-16',
    });
    expect(firstPrediction).not.toHaveProperty('dedicatedWeeklyMinutes');
  });

  it('ignores a goalId left on a block value, feeding the shared pool with it', () => {
    // The type no longer allows it, but a stale in-memory object is still a runtime possibility;
    // the engine must not resurrect a dedicated branch for it.
    const first = makeGoal({ id: 'first', estimatedMinutes: 300, order: 0 });
    const second = makeGoal({ id: 'second', estimatedMinutes: 300, order: 1 });
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
    expect(predictions.map((prediction) => prediction.weeklyMinutesAllocated)).toEqual([120, 0]);
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

    // One hour: today 09:00–10:00 and next Monday 09:00–10:00. Two hours: today until 11:00.
    expect(oneHour.predictedCompletionDate).toBe('2026-03-09');
    expect(twoHours.predictedCompletionDate).toBe('2026-03-02');
    expect(oneHour.weeksRemaining).toBeCloseTo((WEEK_MINUTES + 120) / WEEK_MINUTES);
    expect(twoHours.weeksRemaining).toBeCloseTo(180 / WEEK_MINUTES);
  });

  it('says where a goal stands in its type\'s queue, and never mentions priority', () => {
    expect(describeGoalQueue({ goalsAhead: 0, competingGoalCount: 0 }))
      .toBe('The only active goal of this type.');
    expect(describeGoalQueue({ goalsAhead: 0, competingGoalCount: 2 }))
      .toBe('First in line: this type\'s time goes here first.');
    expect(describeGoalQueue({ goalsAhead: 1, competingGoalCount: 2 }))
      .toBe('Next in line after 1 goal of this type.');
    expect(describeGoalQueue({ goalsAhead: 2, competingGoalCount: 2 }))
      .toBe('Next in line after 2 goals of this type.');
    expect(GOAL_FORECAST_EXPLAINER).toMatch(/list order/);
    expect(GOAL_FORECAST_EXPLAINER).toMatch(/top one gets all of the time first/);
    expect(GOAL_FORECAST_EXPLAINER).not.toMatch(/priorit|share/i);
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
    const first = makeGoal({ id: 'first', order: 0 });
    const second = makeGoal({ id: 'second', order: 1 });
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

  /** Two active goals of one activity type, both worked this week: A first, then B. */
  const goalA = makeGoal({ id: 'goal-a', order: 0 });
  const goalB = makeGoal({ id: 'goal-b', order: 1 });

  function predictPair(history: TrackingEntry[]) {
    const [a, b] = predictAllGoals([goalA, goalB], routineWithCapacity(300), history);
    expect(a).toMatchObject({ weeklyMinutesAllocated: 120, goalsAhead: 0 });
    expect(b).toMatchObject({ weeklyMinutesAllocated: 120, goalsAhead: 1 });
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
    // Deliberate: unlinked time is the pool this model spends on these goals
    // in list order, so it is evidence for both. Only time attributed to a
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
