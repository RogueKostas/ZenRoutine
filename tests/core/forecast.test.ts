import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  forecastGoals,
  getAllocationsForDate,
  getScheduledAllocationAt,
  type ForecastAllocation,
} from '../../src/core/engine/forecast';
import type { Goal, RoutineBlock } from '../../src/core/types';
import { makeGoal, makeRoutine, makeRoutineBlock } from '../helpers/builders';

const WORK = 'activity-work';
const HEALTH = 'activity-health';
const H = 60;

// 21 Sep 2026 is a Monday.
const MONDAY = new Date(2026, 8, 21, 0, 0);

function everyDay(overrides: Partial<RoutineBlock>): RoutineBlock[] {
  return [1, 2, 3, 4, 5, 6, 0].map((day) =>
    makeRoutineBlock({
      ...overrides,
      id: `${overrides.id ?? 'block'}-${day}`,
      dayOfWeek: day as RoutineBlock['dayOfWeek'],
    })
  );
}

/** "every day we have just a four-hour work block" (review 27:18), 09:00–13:00. */
const workRoutine = makeRoutine({
  blocks: everyDay({ id: 'work', activityTypeId: WORK, startMinutes: 9 * H, endMinutes: 13 * H }),
});

const designFtue = makeGoal({ id: 'design-ftue', name: 'Design FTUE flow', activityTypeId: WORK, estimatedMinutes: 6 * H });
const integrateAnalytics = makeGoal({
  id: 'integrate-analytics',
  name: 'Integrate Analytics Framework',
  activityTypeId: WORK,
  estimatedMinutes: 8 * H,
});

function slice(date: string, goalId: string, start: number, end: number) {
  return { date, goalId, startMinutes: start, endMinutes: end };
}

function slices(allocations: ForecastAllocation[]) {
  return allocations.map(({ date, goalId, startMinutes, endMinutes }) =>
    slice(date, goalId, startMinutes, endMinutes)
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('forecastGoals — the director’s example (review 27:18)', () => {
  it('finishes Design FTUE halfway through Tuesday and Integrate Analytics on Thursday', () => {
    const result = forecastGoals({
      routine: workRoutine,
      goals: [designFtue, integrateAnalytics],
      from: MONDAY,
    });

    // "on Monday, Design FTUE flow; then on Tuesday the first two hours would be Design FTUE flow"
    expect(result.completions['design-ftue']).toEqual({
      date: '2026-09-22',
      minutes: 11 * H,
      dateTime: '2026-09-22T11:00',
    });
    // "then Thursday we would see Integrate Analytics Framework complete"
    expect(result.completions['integrate-analytics']).toEqual({
      date: '2026-09-24',
      minutes: 11 * H,
      dateTime: '2026-09-24T11:00',
    });
    // "two hours of Integrate Analytics Framework on Tuesday … four hours … on Wednesday"
    expect(slices(result.allocations)).toEqual([
      slice('2026-09-21', 'design-ftue', 9 * H, 13 * H),
      slice('2026-09-22', 'design-ftue', 9 * H, 11 * H),
      slice('2026-09-22', 'integrate-analytics', 11 * H, 13 * H),
      slice('2026-09-23', 'integrate-analytics', 9 * H, 13 * H),
      slice('2026-09-24', 'integrate-analytics', 9 * H, 11 * H),
    ]);
    expect(result.allocations[1]).toMatchObject({
      blockId: 'work-2',
      blockStart: 9 * H,
      blockEnd: 13 * H,
      activityTypeId: WORK,
    });
    expect(result.unscheduled).toEqual([]);
  });

  it('moves both dates when the two goals are reordered', () => {
    const result = forecastGoals({
      routine: workRoutine,
      goals: [integrateAnalytics, designFtue],
      from: MONDAY,
    });

    expect(result.completions['integrate-analytics'].dateTime).toBe('2026-09-22T13:00');
    expect(result.completions['design-ftue'].dateTime).toBe('2026-09-24T11:00');
  });
});

describe('forecastGoals — capacity', () => {
  it('keeps each activity type’s minutes to its own goals', () => {
    const routine = makeRoutine({
      blocks: [
        ...everyDay({ id: 'work', activityTypeId: WORK, startMinutes: 9 * H, endMinutes: 13 * H }),
        ...everyDay({ id: 'gym', activityTypeId: HEALTH, startMinutes: 18 * H, endMinutes: 19 * H }),
      ],
    });
    const run = makeGoal({ id: 'run', activityTypeId: HEALTH, estimatedMinutes: 2 * H });

    const result = forecastGoals({ routine, goals: [run, integrateAnalytics], from: MONDAY });

    expect(result.completions['run'].dateTime).toBe('2026-09-22T19:00');
    expect(result.completions['integrate-analytics'].dateTime).toBe('2026-09-22T13:00');
    for (const allocation of result.allocations) {
      expect(allocation.activityTypeId).toBe(allocation.goalId === 'run' ? HEALTH : WORK);
    }
  });

  it('ignores a block’s goalId: the type’s minutes go to goals in list order', () => {
    const routine = makeRoutine({
      // A legacy value still carrying goalId (#60 removed it from the type).
      blocks: everyDay({
        id: 'work',
        activityTypeId: WORK,
        startMinutes: 9 * H,
        endMinutes: 13 * H,
        goalId: 'integrate-analytics',
      } as Partial<RoutineBlock>),
    });

    const result = forecastGoals({ routine, goals: [designFtue, integrateAnalytics], from: MONDAY });

    expect(result.allocations[0].goalId).toBe('design-ftue');
    expect(result.completions['design-ftue'].dateTime).toBe('2026-09-22T11:00');
  });

  it('completes a goal with nothing remaining at `from` and gives its time to the next goal', () => {
    const done = makeGoal({ id: 'done', activityTypeId: WORK, estimatedMinutes: 3 * H, loggedMinutes: 4 * H });
    const from = new Date(2026, 8, 21, 8, 15);

    const result = forecastGoals({ routine: workRoutine, goals: [done, designFtue], from });

    expect(result.completions['done']).toEqual({
      date: '2026-09-21',
      minutes: 8 * H + 15,
      dateTime: '2026-09-21T08:15',
    });
    expect(result.allocations.some((a) => a.goalId === 'done')).toBe(false);
    expect(result.allocations[0]).toMatchObject({ goalId: 'design-ftue', startMinutes: 9 * H });
  });

  it('uses only the rest of a block that `from` falls inside', () => {
    const from = new Date(2026, 8, 21, 11, 0);

    const result = forecastGoals({ routine: workRoutine, goals: [designFtue], from });

    expect(slices(result.allocations)).toEqual([
      slice('2026-09-21', 'design-ftue', 11 * H, 13 * H),
      slice('2026-09-22', 'design-ftue', 9 * H, 13 * H),
    ]);
    expect(result.allocations[0]).toMatchObject({ blockStart: 9 * H, blockEnd: 13 * H });
    expect(result.completions['design-ftue'].dateTime).toBe('2026-09-22T13:00');
  });

  it('treats a part-elapsed minute as gone', () => {
    const from = new Date(2026, 8, 21, 11, 0, 30);

    const result = forecastGoals({ routine: workRoutine, goals: [designFtue], from });

    expect(result.allocations[0].startMinutes).toBe(11 * H + 1);
  });

  it('attributes an overnight block to the day it starts', () => {
    const routine = makeRoutine({
      blocks: everyDay({ id: 'night', activityTypeId: WORK, startMinutes: 22 * H, endMinutes: 2 * H }),
    });
    const goal = makeGoal({ id: 'night-goal', activityTypeId: WORK, estimatedMinutes: 3 * H });

    const result = forecastGoals({ routine, goals: [goal], from: new Date(2026, 8, 21, 12, 0) });

    expect(result.allocations[0]).toMatchObject({
      date: '2026-09-21',
      blockStart: 22 * H,
      blockEnd: 26 * H,
      startMinutes: 22 * H,
      endMinutes: 25 * H,
    });
    // Monday's forecast day, but 01:00 on Tuesday's wall clock.
    expect(result.completions['night-goal']).toEqual({
      date: '2026-09-21',
      minutes: 25 * H,
      dateTime: '2026-09-22T01:00',
    });
  });

  it('counts the after-midnight tail of yesterday’s overnight block', () => {
    const routine = makeRoutine({
      blocks: [makeRoutineBlock({ id: 'sun-night', dayOfWeek: 0, activityTypeId: WORK, startMinutes: 22 * H, endMinutes: 2 * H })],
    });
    const goal = makeGoal({ id: 'night-goal', activityTypeId: WORK, estimatedMinutes: H / 2 });

    const result = forecastGoals({ routine, goals: [goal], from: new Date(2026, 8, 21, 1, 0) });

    expect(slices(result.allocations)).toEqual([slice('2026-09-20', 'night-goal', 25 * H, 25 * H + 30)]);
    expect(result.completions['night-goal'].dateTime).toBe('2026-09-21T01:30');
    expect(getScheduledAllocationAt(result.allocations, new Date(2026, 8, 21, 1, 10))?.goalId).toBe('night-goal');
  });

  it('marks a goal whose type has no blocks as no-capacity', () => {
    const run = makeGoal({ id: 'run', activityTypeId: HEALTH, estimatedMinutes: H });

    const result = forecastGoals({ routine: workRoutine, goals: [run, designFtue], from: MONDAY });

    expect(result.unscheduled).toEqual([{ goalId: 'run', reason: 'no-capacity' }]);
    expect(result.completions['run']).toBeUndefined();
    expect(result.completions['design-ftue']).toBeDefined();
  });

  it('marks a goal not finished within the horizon as no-capacity, keeping its partial slices', () => {
    const result = forecastGoals({
      routine: workRoutine,
      goals: [designFtue],
      from: MONDAY,
      horizonDays: 1,
    });

    expect(result.unscheduled).toEqual([{ goalId: 'design-ftue', reason: 'no-capacity' }]);
    expect(slices(result.allocations)).toEqual([slice('2026-09-21', 'design-ftue', 9 * H, 13 * H)]);
  });

  it('lists goals it cannot schedule, with a reason, in input order', () => {
    const noType = { ...makeGoal({ id: 'no-type' }), activityTypeId: undefined };
    const noEstimate = { ...makeGoal({ id: 'no-estimate', activityTypeId: WORK }), estimatedMinutes: undefined };
    const zeroEstimate = makeGoal({ id: 'zero-estimate', activityTypeId: WORK, estimatedMinutes: 0 });
    const completed = makeGoal({ id: 'completed', activityTypeId: WORK, status: 'completed' });
    const paused = makeGoal({ id: 'paused', activityTypeId: WORK, status: 'paused' });

    const result = forecastGoals({
      routine: workRoutine,
      goals: [noType, noEstimate, designFtue, zeroEstimate, completed, paused],
      from: MONDAY,
    });

    expect(result.unscheduled).toEqual([
      { goalId: 'no-type', reason: 'no-type' },
      { goalId: 'no-estimate', reason: 'no-estimate' },
      { goalId: 'zero-estimate', reason: 'no-estimate' },
      { goalId: 'completed', reason: 'completed' },
      { goalId: 'paused', reason: 'inactive' },
    ]);
    expect(Object.keys(result.completions)).toEqual(['design-ftue']);
  });

  it('never reads goal.priority', () => {
    const low = { ...designFtue, priority: 5 as const };
    const high = { ...integrateAnalytics, priority: 1 as const };

    const result = forecastGoals({ routine: workRoutine, goals: [low, high], from: MONDAY });

    expect(result.allocations[0].goalId).toBe('design-ftue');
  });

  it('accepts a caller-supplied remaining-minutes function', () => {
    const result = forecastGoals({
      routine: workRoutine,
      goals: [designFtue],
      from: MONDAY,
      remainingMinutes: () => H,
    });

    expect(result.completions['design-ftue'].dateTime).toBe('2026-09-21T10:00');
  });
});

describe('forecastGoals — milestones', () => {
  it('dates 50% of a 20h goal with 5h already logged', () => {
    const goal = makeGoal({ id: 'spanish', activityTypeId: WORK, estimatedMinutes: 20 * H, loggedMinutes: 5 * H });

    const result = forecastGoals({
      routine: workRoutine,
      goals: [goal],
      from: MONDAY,
      milestones: [0.5, 0.25],
    });

    // 25% (5h) is already logged; 50% (10h) needs 5 more: Monday's 4h and 1h on Tuesday.
    expect(result.milestones['spanish']).toEqual([
      { fraction: 0.25, date: '2026-09-21', minutes: 0, dateTime: '2026-09-21T00:00' },
      { fraction: 0.5, date: '2026-09-22', minutes: 10 * H, dateTime: '2026-09-22T10:00' },
    ]);
  });

  it('reaches every milestone of a goal with nothing remaining at `from`', () => {
    const goal = makeGoal({ id: 'done', activityTypeId: WORK, estimatedMinutes: 2 * H, loggedMinutes: 2 * H });

    const result = forecastGoals({ routine: workRoutine, goals: [goal], from: MONDAY, milestones: [0.5, 1] });

    expect(result.milestones['done'].map((m) => [m.fraction, m.dateTime])).toEqual([
      [0.5, '2026-09-21T00:00'],
      [1, '2026-09-21T00:00'],
    ]);
  });
});

describe('forecastGoals — calendar dates', () => {
  it('steps by calendar date across a DST change', () => {
    vi.stubEnv('TZ', 'Europe/London');
    // London leaves summer time at 02:00 on Sun 25 Oct 2026.
    expect(new Date(2026, 9, 24, 12).getTimezoneOffset()).not.toBe(
      new Date(2026, 9, 26, 12).getTimezoneOffset()
    );
    const routine = makeRoutine({
      blocks: everyDay({ id: 'early', activityTypeId: WORK, startMinutes: 0, endMinutes: H }),
    });
    const goal = makeGoal({ id: 'long', activityTypeId: WORK, estimatedMinutes: 5 * H });

    const result = forecastGoals({ routine, goals: [goal], from: new Date(2026, 9, 23, 0, 0) });

    expect(result.allocations.map((a) => a.date)).toEqual([
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
    ]);
    expect(result.completions['long'].dateTime).toBe('2026-10-27T01:00');
  });

  it('is deterministic and never reads the system clock', () => {
    const input = { routine: workRoutine, goals: [designFtue, integrateAnalytics], from: MONDAY, milestones: [0.5] };
    vi.useFakeTimers();

    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const first = forecastGoals(input);
    vi.setSystemTime(new Date('2031-06-15T18:30:00Z'));
    const second = forecastGoals(input);

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('walks a 365-day horizon for 50 goals and a full routine in well under 50 ms', () => {
    const types = ['t0', 't1', 't2', 't3', 't4'];
    const blocks: RoutineBlock[] = [];
    for (let day = 0; day < 7; day += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        blocks.push(
          makeRoutineBlock({
            id: `b-${day}-${hour}`,
            dayOfWeek: day as RoutineBlock['dayOfWeek'],
            startMinutes: hour * H,
            endMinutes: hour === 23 ? 0 : (hour + 1) * H,
            activityTypeId: types[hour % types.length],
          })
        );
      }
    }
    // Estimates large enough that the last goal of each type is still open after a year.
    const goals: Goal[] = Array.from({ length: 50 }, (_, i) =>
      makeGoal({ id: `g${i}`, activityTypeId: types[i % types.length], estimatedMinutes: (i >= 45 ? 5000 : 150) * H })
    );
    const input = { routine: makeRoutine({ blocks }), goals, from: MONDAY, milestones: [0.25, 0.5, 0.75] };
    forecastGoals(input); // warm up the JIT

    const started = performance.now();
    const result = forecastGoals(input);
    const elapsed = performance.now() - started;

    expect(result.unscheduled.length).toBe(5);
    expect(result.allocations.at(-1)?.date).toBe('2027-09-20');
    expect(elapsed).toBeLessThan(50);
  });
});

describe('forecast helpers for a day view and Home', () => {
  const result = forecastGoals({ routine: workRoutine, goals: [designFtue, integrateAnalytics], from: MONDAY });

  it('lists one day’s slices in order', () => {
    expect(slices(getAllocationsForDate(result.allocations, '2026-09-22'))).toEqual([
      slice('2026-09-22', 'design-ftue', 9 * H, 11 * H),
      slice('2026-09-22', 'integrate-analytics', 11 * H, 13 * H),
    ]);
  });

  it('finds the goal scheduled at a given moment', () => {
    const at = (hour: number, minute = 0) => new Date(2026, 8, 22, hour, minute);
    expect(getScheduledAllocationAt(result.allocations, at(10, 59))?.goalId).toBe('design-ftue');
    expect(getScheduledAllocationAt(result.allocations, at(11))?.goalId).toBe('integrate-analytics');
    expect(getScheduledAllocationAt(result.allocations, at(13))).toBeUndefined();
    expect(getScheduledAllocationAt(result.allocations, at(8, 59))).toBeUndefined();
  });
});
