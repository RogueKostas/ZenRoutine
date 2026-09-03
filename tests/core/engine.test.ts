import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  getTrackedBreakdown,
  getWeeklyMinutesForActivityType,
  predictGoalCompletion,
} from '../../src/core/engine';
import {
  findOverlappingBlocks,
  validateGoal,
  validateRoutineBlock,
} from '../../src/core/engine/validation';
import type {
  ActivityType,
  Goal,
  Routine,
  RoutineBlock,
  TrackingEntry,
} from '../../src/core/types';
import {
  formatDuration,
  getDayName,
  minutesToTimeString,
  timeStringToMinutes,
} from '../../src/core/utils/time';

const timestamp = '2026-03-02T08:00:00.000Z';
const originalTimeZone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'UTC';
});

afterAll(() => {
  process.env.TZ = originalTimeZone;
});

const activityTypes: ActivityType[] = [
  {
    id: 'focus',
    name: 'Focus',
    color: '#112233',
    isDefault: false,
    sortOrder: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'fitness',
    name: 'Fitness',
    color: '#445566',
    isDefault: false,
    sortOrder: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

const routine: Routine = {
  id: 'routine-1',
  name: 'Test week',
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp,
  blocks: [
    {
      id: 'focus-morning',
      dayOfWeek: 1,
      startMinutes: 9 * 60,
      endMinutes: 10 * 60 + 30,
      activityTypeId: 'focus',
    },
    {
      id: 'focus-overnight',
      dayOfWeek: 2,
      startMinutes: 23 * 60,
      endMinutes: 60,
      activityTypeId: 'focus',
    },
    {
      id: 'fitness-hour',
      dayOfWeek: 3,
      startMinutes: 12 * 60,
      endMinutes: 13 * 60,
      activityTypeId: 'fitness',
    },
  ],
};

const makeGoal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'goal-1',
  name: 'Ship the prototype',
  description: 'Complete a deterministic slice',
  estimatedMinutes: 600,
  loggedMinutes: 180,
  activityTypeId: 'focus',
  status: 'active',
  priority: 3,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

const makeEntry = (
  id: string,
  activityTypeId: string,
  date: string,
  startTime: string,
  endTime?: string
): TrackingEntry => ({
  id,
  activityTypeId,
  date,
  startTime,
  endTime,
  source: 'manual',
  createdAt: startTime,
  updatedAt: endTime ?? startTime,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('core planning and prediction', () => {
  it('sums matching weekly blocks, including blocks that cross midnight', () => {
    expect(getWeeklyMinutesForActivityType(routine, 'focus')).toBe(210);
    expect(getWeeklyMinutesForActivityType(routine, 'fitness')).toBe(60);
    expect(getWeeklyMinutesForActivityType(routine, 'unknown')).toBe(0);
  });

  it('predicts a deterministic completion date and uses only relevant history for confidence', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-02T12:00:00.000Z'));

    const evidenceDates = [
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
    ];
    const focusHistory = evidenceDates.map((date, index) =>
      makeEntry(
        `focus-${index}`,
        'focus',
        date,
        `${date}T08:00:00.000Z`,
        `${date}T08:30:00.000Z`
      )
    );
    const irrelevantHistory = Array.from({ length: 14 }, (_, index) =>
      makeEntry(
        `fitness-${index}`,
        'fitness',
        '2026-03-02',
        '2026-03-02T10:00:00.000Z',
        '2026-03-02T10:30:00.000Z'
      )
    );

    expect(
      predictGoalCompletion(makeGoal(), routine, [
        ...focusHistory,
        ...irrelevantHistory,
      ])
    ).toMatchObject({
      goalId: 'goal-1',
      predictedCompletionDate: '2026-03-16',
      weeklyMinutesAllocated: 210,
      activityWeeklyCapacity: 210,
      dedicatedWeeklyMinutes: 0,
      sharedWeeklyCapacity: 210,
      allocationShare: 1,
      competingGoalCount: 0,
      remainingMinutes: 420,
      weeksRemaining: 2,
      confidenceLevel: 'medium',
      evidenceDays: 7,
    });
  });

  it('reports no date for zero allocation and today for an already completed goal', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-02T12:00:00.000Z'));

    const noAllocation = predictGoalCompletion(
      makeGoal({ activityTypeId: 'unknown' }),
      routine
    );
    expect(noAllocation).toMatchObject({
      predictedCompletionDate: null,
      weeklyMinutesAllocated: 0,
      remainingMinutes: 420,
      weeksRemaining: null,
      confidenceLevel: 'low',
    });

    const completed = predictGoalCompletion(
      makeGoal({ loggedMinutes: 750, status: 'completed' }),
      routine
    );
    expect(completed).toMatchObject({
      predictedCompletionDate: '2026-03-02',
      remainingMinutes: 0,
      weeksRemaining: 0,
      confidenceLevel: 'low',
    });
  });
});

describe('tracked analytics', () => {
  it('includes only completed entries in the half-open week and sorts by tracked time', () => {
    const entries = [
      makeEntry(
        'focus-90',
        'focus',
        '2026-03-02',
        '2026-03-02T09:00:00.000Z',
        '2026-03-02T10:30:00.000Z'
      ),
      makeEntry(
        'fitness-30',
        'fitness',
        '2026-03-08',
        '2026-03-08T12:00:00.000Z',
        '2026-03-08T12:30:00.000Z'
      ),
      makeEntry(
        'open',
        'focus',
        '2026-03-03',
        '2026-03-03T09:00:00.000Z'
      ),
      makeEntry(
        'next-week-boundary',
        'focus',
        '2026-03-09',
        '2026-03-09T00:00:00.000Z',
        '2026-03-09T01:00:00.000Z'
      ),
    ];

    const breakdown = getTrackedBreakdown(
      entries,
      '2026-03-02',
      activityTypes
    );

    expect(breakdown.map(({ activityTypeId, actualMinutes }) => ({
      activityTypeId,
      actualMinutes,
    }))).toEqual([
      { activityTypeId: 'focus', actualMinutes: 90 },
      { activityTypeId: 'fitness', actualMinutes: 30 },
    ]);
    expect(breakdown[0].percentageOfWeek).toBeCloseTo((90 / 10080) * 100);
  });
});

describe('validation and time utilities', () => {
  const existingBlock: RoutineBlock = {
    id: 'existing',
    dayOfWeek: 1,
    startMinutes: 9 * 60,
    endMinutes: 10 * 60,
    activityTypeId: 'focus',
  };

  it('reports each invalid routine-block field and accepts an overnight block', () => {
    const invalid = validateRoutineBlock({
      startMinutes: -1,
      endMinutes: 1440,
      activityTypeId: '',
    });
    expect(invalid.isValid).toBe(false);
    expect(invalid.errors.map((error) => error.field)).toEqual([
      'startMinutes',
      'endMinutes',
      'dayOfWeek',
      'activityTypeId',
    ]);

    expect(validateRoutineBlock({
      startMinutes: 23 * 60,
      endMinutes: 60,
      dayOfWeek: 1,
      activityTypeId: 'focus',
    })).toEqual({ isValid: true, errors: [] });
  });

  it('finds same-day overlaps while allowing adjacency, another day, and the same block', () => {
    const candidates: RoutineBlock[] = [
      existingBlock,
      { ...existingBlock, id: 'adjacent', startMinutes: 10 * 60, endMinutes: 11 * 60 },
      { ...existingBlock, id: 'another-day', dayOfWeek: 2 },
    ];

    expect(findOverlappingBlocks(candidates, {
      ...existingBlock,
      id: 'new',
      startMinutes: 9 * 60 + 30,
      endMinutes: 10 * 60 + 30,
    }).map((block) => block.id)).toEqual(['existing', 'adjacent']);

    expect(findOverlappingBlocks(candidates, existingBlock)).toEqual([]);

    expect(findOverlappingBlocks([existingBlock], {
      ...existingBlock,
      id: 'exactly-adjacent',
      startMinutes: 10 * 60,
      endMinutes: 11 * 60,
    })).toEqual([]);
  });

  it('validates goal essentials', () => {
    const invalid = validateGoal({
      name: '   ',
      estimatedMinutes: 0,
      activityTypeId: '',
    });
    expect(invalid.isValid).toBe(false);
    expect(invalid.errors.map((error) => error.field)).toEqual([
      'name',
      'estimatedMinutes',
      'activityTypeId',
    ]);
    expect(validateGoal(makeGoal())).toEqual({ isValid: true, errors: [] });
  });

  it('round-trips clock values and formats durations and day names', () => {
    expect(minutesToTimeString(0)).toBe('00:00');
    expect(minutesToTimeString(23 * 60 + 59)).toBe('23:59');
    expect(timeStringToMinutes('23:59')).toBe(23 * 60 + 59);
    expect(formatDuration(59.6)).toBe('1h');
    expect(formatDuration(125)).toBe('2h 5m');
    expect(getDayName(1)).toBe('Monday');
    expect(getDayName(1, true)).toBe('Mon');
  });
});
