import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getTrackedBreakdown } from '../../src/core/engine/analytics';
import {
  findOverlappingBlocks,
  validateRoutineBlock,
} from '../../src/core/engine/validation';
import type { RoutineBlock } from '../../src/core/types';
import {
  DEFAULT_WEEK_STARTS_ON,
  addDaysToDateKey,
  differenceInCalendarDays,
  getDayName,
  getLocalWeekStartDateKey,
  getMonthGridDates,
  getWeekStart,
  getWeekdayColumn,
  orderedWeekDays,
  parseLocalDateKey,
  toLocalDateKey,
} from '../../src/core/utils/time';
import {
  makeActivityType,
  makeRoutineBlock,
  makeTrackingEntry,
} from '../helpers/builders';

const originalTimeZone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'Europe/London';
});

afterAll(() => {
  process.env.TZ = originalTimeZone;
});

describe('local calendar utilities', () => {
  it('formats the same instant as the correct date in distant time zones', () => {
    const instant = new Date('2026-03-01T23:30:00.000Z');
    expect(toLocalDateKey(instant, 'Pacific/Kiritimati')).toBe('2026-03-02');
    expect(toLocalDateKey(instant, 'America/Los_Angeles')).toBe('2026-03-01');
    expect(toLocalDateKey(instant, 'Europe/London')).toBe('2026-03-01');
  });

  it('adds and compares calendar days across DST and year boundaries', () => {
    expect(addDaysToDateKey('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDaysToDateKey('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDaysToDateKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(differenceInCalendarDays('2026-03-28', '2026-03-29')).toBe(1);
    expect(differenceInCalendarDays('2026-10-24', '2026-10-25')).toBe(1);
  });

  it('rejects malformed and impossible local date keys', () => {
    for (const value of ['2026-2-03', '2025-02-29', '2026-02-30', 'not-a-date']) {
      expect(() => parseLocalDateKey(value)).toThrow('Invalid local date key');
      expect(() => differenceInCalendarDays(value, '2026-03-01')).toThrow(
        'Invalid local date key'
      );
    }
  });

  it('returns the local week key without a UTC conversion', () => {
    // Wednesday 4 March 2026, half past midnight.
    expect(getLocalWeekStartDateKey(new Date(2026, 2, 4, 0, 30), 0)).toBe('2026-03-01');
    expect(getLocalWeekStartDateKey(new Date(2026, 2, 4, 0, 30), 1)).toBe('2026-03-02');
  });
});

describe('week start preference (#44)', () => {
  // Built inside each test, not at module load: the file's beforeAll switches TZ to
  // Europe/London, and a Date constructed before that would be read an hour later on a UTC host.
  const lateSunday = () => new Date(2026, 8, 20, 23, 30); // Sunday 20 September 2026, late evening
  const earlyMonday = () => new Date(2026, 8, 21, 0, 15); // the next morning

  it('defaults to Monday, as the 2019 design draws the week', () => {
    expect(DEFAULT_WEEK_STARTS_ON).toBe(1);
    expect(getLocalWeekStartDateKey(lateSunday())).toBe('2026-09-14');
  });

  it('puts a Sunday at the end of the Monday week and the start of its own Sunday week', () => {
    const sunday = lateSunday();
    const monday = earlyMonday();
    expect(getLocalWeekStartDateKey(sunday, 1)).toBe('2026-09-14');
    expect(getLocalWeekStartDateKey(sunday, 0)).toBe('2026-09-20');
    // Crossing Sunday -> Monday opens a new week only under Monday-first.
    expect(getLocalWeekStartDateKey(monday, 1)).toBe('2026-09-21');
    expect(getLocalWeekStartDateKey(monday, 0)).toBe('2026-09-20');
  });

  it('returns local noon on the first day, across a DST change', () => {
    // UK clocks go back on Sunday 25 October 2026.
    const start = getWeekStart(new Date(2026, 9, 25, 1, 30), 1);
    expect(toLocalDateKey(start)).toBe('2026-10-19');
    expect(start.getHours()).toBe(12);
    expect(toLocalDateKey(getWeekStart(new Date(2026, 9, 25, 1, 30), 0))).toBe('2026-10-25');
  });

  it('orders the week days for display without renumbering them', () => {
    expect(orderedWeekDays(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(orderedWeekDays(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(orderedWeekDays(1).map((day) => getDayName(day, true))).toEqual(
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    );
  });

  it('places a stored day in its display column', () => {
    expect(getWeekdayColumn(0, 1)).toBe(6);
    expect(getWeekdayColumn(1, 1)).toBe(0);
    expect(getWeekdayColumn(0, 0)).toBe(0);
    expect(getWeekdayColumn(6, 0)).toBe(6);
  });

  it('lays out a month grid whose columns follow the preference', () => {
    // 1 September 2026 is a Tuesday.
    const mondayGrid = getMonthGridDates(2026, 8, 1).map((date) => toLocalDateKey(date));
    expect(mondayGrid).toHaveLength(42);
    expect(mondayGrid[0]).toBe('2026-08-31');
    expect(mondayGrid[1]).toBe('2026-09-01');
    expect(mondayGrid[41]).toBe('2026-10-11');

    const sundayGrid = getMonthGridDates(2026, 8, 0).map((date) => toLocalDateKey(date));
    expect(sundayGrid[0]).toBe('2026-08-30');
    expect(sundayGrid[2]).toBe('2026-09-01');

    // Today (Thursday 17 September 2026) sits in the Thursday column under both settings.
    const today = '2026-09-17';
    expect(mondayGrid.indexOf(today) % 7).toBe(3);
    expect(sundayGrid.indexOf(today) % 7).toBe(4);
    // And every column holds one weekday only.
    for (const [weekStartsOn, grid] of [[1, mondayGrid], [0, sundayGrid]] as const) {
      grid.forEach((key, index) => {
        expect(getWeekdayColumn(parseLocalDateKey(key).getDay(), weekStartsOn)).toBe(index % 7);
      });
    }
  });

  it('starts the grid on the 1st when the month begins on the first weekday', () => {
    // 1 June 2026 is a Monday; 1 November 2026 is a Sunday.
    expect(toLocalDateKey(getMonthGridDates(2026, 5, 1)[0])).toBe('2026-06-01');
    expect(toLocalDateKey(getMonthGridDates(2026, 10, 0)[0])).toBe('2026-11-01');
    expect(toLocalDateKey(getMonthGridDates(2026, 10, 1)[0])).toBe('2026-10-26');
  });
});

describe('weekly overlap validation', () => {
  const overlapIds = (existing: RoutineBlock[], candidate: RoutineBlock) =>
    findOverlappingBlocks(existing, candidate).map((block) => block.id);

  it('detects overlaps before and after midnight while preserving adjacency', () => {
    const overnight = makeRoutineBlock({
      id: 'monday-overnight',
      dayOfWeek: 1,
      startMinutes: 23 * 60,
      endMinutes: 60,
    });

    expect(overlapIds([overnight], makeRoutineBlock({
      id: 'monday-late',
      dayOfWeek: 1,
      startMinutes: 22 * 60 + 30,
      endMinutes: 23 * 60 + 30,
    }))).toEqual(['monday-overnight']);
    expect(overlapIds([overnight], makeRoutineBlock({
      id: 'tuesday-early',
      dayOfWeek: 2,
      startMinutes: 30,
      endMinutes: 120,
    }))).toEqual(['monday-overnight']);
    expect(overlapIds([overnight], makeRoutineBlock({
      id: 'tuesday-adjacent',
      dayOfWeek: 2,
      startMinutes: 60,
      endMinutes: 120,
    }))).toEqual([]);
  });

  it('detects Saturday spillover into Sunday across the weekly wrap', () => {
    const saturday = makeRoutineBlock({
      id: 'saturday-overnight',
      dayOfWeek: 6,
      startMinutes: 23 * 60,
      endMinutes: 60,
    });
    const sunday = makeRoutineBlock({
      id: 'sunday-early',
      dayOfWeek: 0,
      startMinutes: 30,
      endMinutes: 90,
    });
    expect(overlapIds([saturday], sunday)).toEqual(['saturday-overnight']);
    expect(overlapIds([sunday], saturday)).toEqual(['sunday-early']);
  });

  it('rejects fractional, out-of-range, and zero-duration blocks', () => {
    expect(validateRoutineBlock(makeRoutineBlock({ startMinutes: 1.5 })).isValid).toBe(false);
    expect(validateRoutineBlock(makeRoutineBlock({ endMinutes: 1440 })).isValid).toBe(false);
    expect(validateRoutineBlock(makeRoutineBlock({ startMinutes: 60, endMinutes: 60 })).isValid).toBe(false);
  });
});

describe('weekly analytics clipping', () => {
  const activityTypes = [makeActivityType()];

  it('clips completed entries to the half-open local week and ignores stale date labels', () => {
    const entries = [
      makeTrackingEntry({
        id: 'cross-start',
        date: '1999-01-01',
        startTime: '2026-02-28T23:30:00.000Z',
        endTime: '2026-03-01T00:30:00.000Z',
      }),
      makeTrackingEntry({
        id: 'cross-end',
        startTime: '2026-03-07T23:30:00.000Z',
        endTime: '2026-03-08T00:30:00.000Z',
      }),
      makeTrackingEntry({ id: 'open', endTime: undefined }),
      makeTrackingEntry({
        id: 'reversed',
        startTime: '2026-03-03T10:00:00.000Z',
        endTime: '2026-03-03T09:00:00.000Z',
      }),
    ];

    const breakdown = getTrackedBreakdown(entries, '2026-03-01', activityTypes);
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0].actualMinutes).toBe(60);
  });

  it('uses elapsed minutes across the London spring-forward week', () => {
    const entries = [makeTrackingEntry({
      id: 'whole-week',
      date: '2026-03-29',
      startTime: '2026-03-29T00:00:00.000Z',
      endTime: '2026-04-04T23:00:00.000Z',
    })];

    const breakdown = getTrackedBreakdown(entries, '2026-03-29', activityTypes);
    expect(breakdown[0].actualMinutes).toBe(7 * 24 * 60 - 60);
  });

  it('uses elapsed minutes across the London fall-back week', () => {
    const entries = [makeTrackingEntry({
      id: 'whole-fall-week',
      date: '2026-10-25',
      startTime: '2026-10-24T23:00:00.000Z',
      endTime: '2026-11-01T00:00:00.000Z',
    })];

    const breakdown = getTrackedBreakdown(entries, '2026-10-25', activityTypes);
    expect(breakdown[0].actualMinutes).toBe(7 * 24 * 60 + 60);
  });
});
