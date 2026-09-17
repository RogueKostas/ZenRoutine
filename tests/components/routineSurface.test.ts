import { describe, expect, it } from 'vitest';
import type { DayOfWeek, RoutineBlock } from '../../src/core/types';
import {
  NEW_BLOCK_MINUTES,
  firstFreeHour,
  newBlockTimesAt,
  weekStripCells,
} from '../../src/components/routine/routineSurface';
import {
  minutesAtFraction,
  pressLocationX,
  ribbonSegmentAccessibilityLabel,
} from '../../src/components/ribbon/ribbonLayout';
import { makeRoutineBlock } from '../helpers/builders';

// No Dates anywhere in this file: day numbers are passed in, so the host timezone is irrelevant.

const hm = (text: string) => {
  const [hours, minutes] = text.split(':').map(Number);
  return hours * 60 + minutes;
};

const block = (id: string, start: string, end: string, dayOfWeek: DayOfWeek = 1): RoutineBlock =>
  makeRoutineBlock({ id, dayOfWeek, startMinutes: hm(start), endMinutes: hm(end) });

const times = (result: { start: number; end: number }) => ({
  start: `${Math.floor(result.start / 60)}:${String(result.start % 60).padStart(2, '0')}`,
  end: `${Math.floor(result.end / 60)}:${String(result.end % 60).padStart(2, '0')}`,
});

describe('weekStripCells', () => {
  const blocks = [
    block('mon-work', '09:00', '12:00', 1),
    block('mon-gym', '18:00', '19:30', 1),
    block('sun-family', '12:00', '16:00', 0),
    block('fri-late', '23:00', '01:00', 5),
  ];

  it('is Monday-first by default and reads M T W T F S S (p10)', () => {
    const cells = weekStripCells(blocks, 1, 3, 1);
    expect(cells.map((cell) => cell.day)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(cells.map((cell) => cell.letter).join(' ')).toBe('M T W T F S S');
  });

  it('follows a Sunday-first preference', () => {
    const cells = weekStripCells(blocks, 0, 3, 1);
    expect(cells.map((cell) => cell.day)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(cells.map((cell) => cell.letter).join(' ')).toBe('S M T W T F S');
  });

  it('marks exactly one today and one selected cell', () => {
    const cells = weekStripCells(blocks, 1, 3, 0);
    expect(cells.filter((cell) => cell.isToday).map((cell) => cell.day)).toEqual([3]);
    expect(cells.filter((cell) => cell.isSelected).map((cell) => cell.day)).toEqual([0]);
  });

  it("counts each day's activities and planned minutes, overnight blocks included", () => {
    const byDay = new Map(weekStripCells(blocks, 1, 3, 1).map((cell) => [cell.day, cell]));
    expect(byDay.get(1)).toMatchObject({ activityCount: 2, plannedMinutes: 270 });
    expect(byDay.get(0)).toMatchObject({ activityCount: 1, plannedMinutes: 240 });
    expect(byDay.get(5)).toMatchObject({ activityCount: 1, plannedMinutes: 120 });
    expect(byDay.get(2)).toMatchObject({ activityCount: 0, plannedMinutes: 0 });
  });

  it('gives each cell a spoken label', () => {
    const byDay = new Map(weekStripCells(blocks, 1, 3, 1).map((cell) => [cell.day, cell]));
    expect(byDay.get(1)?.accessibilityLabel).toBe('Monday, 2 activities, 4h 30m planned');
    expect(byDay.get(3)?.accessibilityLabel).toBe('Wednesday, nothing planned, today');
    expect(byDay.get(0)?.accessibilityLabel).toBe('Sunday, 1 activity, 4h planned');
  });
});

describe('newBlockTimesAt (tap on empty time, p13–p17)', () => {
  it('rounds the tap to the nearest quarter hour and lasts one hour (p17)', () => {
    expect(times(newBlockTimesAt(hm('11:10'), [], 1))).toEqual({ start: '11:15', end: '12:15' });
    expect(times(newBlockTimesAt(hm('11:07'), [], 1))).toEqual({ start: '11:00', end: '12:00' });
    expect(times(newBlockTimesAt(hm('19:52'), [], 1))).toEqual({
      start: '19:45',
      end: '20:45',
    });
    expect(NEW_BLOCK_MINUTES).toBe(60);
  });

  it('keeps the start inside the window and clips the end to it', () => {
    expect(times(newBlockTimesAt(hm('06:00'), [], 1))).toEqual({ start: '7:00', end: '8:00' });
    expect(times(newBlockTimesAt(hm('22:30'), [], 1))).toEqual({ start: '22:30', end: '23:00' });
    expect(times(newBlockTimesAt(hm('23:00'), [], 1))).toEqual({ start: '22:45', end: '23:00' });
  });

  it('stores an end at midnight as 0 (runs to midnight)', () => {
    const window = { startMinutes: 0, endMinutes: 1440 };
    expect(newBlockTimesAt(hm('23:30'), [], 1, window)).toEqual({ start: hm('23:30'), end: 0 });
  });

  it('stops at the next block instead of overlapping it', () => {
    const blocks = [block('lunch', '12:30', '13:00')];
    expect(times(newBlockTimesAt(hm('12:00'), blocks, 1))).toEqual({ start: '12:00', end: '12:30' });
  });

  it('rounds down when rounding up would land inside the next block', () => {
    const blocks = [block('work', '12:00', '13:00')];
    expect(times(newBlockTimesAt(hm('11:53'), blocks, 1))).toEqual({ start: '11:45', end: '12:00' });
  });

  it("starts at the previous block's end when rounding lands inside it", () => {
    const blocks = [block('breakfast', '07:00', '07:50'), block('work', '12:00', '13:00')];
    // 7:52 rounds to 7:45, inside breakfast, which started before the tap.
    expect(times(newBlockTimesAt(hm('07:52'), blocks, 1))).toEqual({ start: '7:50', end: '8:50' });
  });

  it('only looks at the displayed day, plus the previous night’s overnight tail', () => {
    const otherDay = [block('tue-work', '09:00', '17:00', 2)];
    expect(times(newBlockTimesAt(hm('09:00'), otherDay, 1))).toEqual({ start: '9:00', end: '10:00' });

    const overnight = [block('sun-night', '22:00', '08:00', 0)];
    expect(times(newBlockTimesAt(hm('07:10'), overnight, 1))).toEqual({ start: '8:00', end: '9:00' });
  });

  it('steps past back-to-back blocks to the first free time', () => {
    const blocks = [
      block('a', '09:00', '09:15'),
      block('b', '09:15', '09:30'),
      block('c', '09:30', '10:00'),
      block('d', '10:30', '11:00'),
    ];
    expect(times(newBlockTimesAt(hm('09:05'), blocks, 1))).toEqual({ start: '10:00', end: '10:30' });
  });

  it('falls back to the plain rounded hour when there is no room before the window ends', () => {
    const full = [block('all', '07:00', '23:00')];
    expect(times(newBlockTimesAt(hm('22:55'), full, 1))).toEqual({ start: '22:45', end: '23:00' });
  });
});

describe('firstFreeHour (the "+ Add activity" button)', () => {
  it('starts an empty day at the window start, not midnight', () => {
    expect(times(firstFreeHour([], 1))).toEqual({ start: '7:00', end: '8:00' });
  });

  it('finds the first whole free hour between blocks (sample Monday)', () => {
    const monday = [
      block('fitness', '07:00', '08:00'),
      block('work-am', '09:00', '12:00'),
      block('food', '12:00', '13:00'),
      block('work-pm', '13:00', '17:30'),
    ];
    expect(times(firstFreeHour(monday, 1))).toEqual({ start: '8:00', end: '9:00' });
    const noMorningGap = [block('early', '07:00', '08:30'), block('work', '09:00', '17:00')];
    expect(times(firstFreeHour(noMorningGap, 1))).toEqual({ start: '17:00', end: '18:00' });
  });

  it("respects the previous night's overnight tail and ignores other days", () => {
    const blocks = [block('sun-night', '22:00', '07:30', 0), block('tue', '07:00', '23:00', 2)];
    expect(times(firstFreeHour(blocks, 1))).toEqual({ start: '7:30', end: '8:30' });
  });

  it('falls back to the first free time when no whole hour is free', () => {
    const blocks = [block('a', '07:00', '12:00'), block('b', '12:30', '23:00')];
    expect(times(firstFreeHour(blocks, 1))).toEqual({ start: '12:00', end: '12:30' });
  });
});

describe('ribbon empty-press helpers', () => {
  it('maps a fraction of the window to minutes, clamped', () => {
    expect(minutesAtFraction(0)).toBe(hm('07:00'));
    expect(minutesAtFraction(0.5)).toBe(hm('15:00'));
    expect(minutesAtFraction(1)).toBe(hm('23:00'));
    expect(minutesAtFraction(-0.2)).toBe(hm('07:00'));
    expect(minutesAtFraction(1.7)).toBe(hm('23:00'));
    expect(minutesAtFraction(Number.NaN)).toBe(hm('07:00'));
    expect(minutesAtFraction(0.25, { startMinutes: 0, endMinutes: 1440 })).toBe(360);
  });

  it('reads the press position from native locationX or the web click offsetX', () => {
    expect(pressLocationX({ locationX: 120, offsetX: 5 })).toBe(120);
    expect(pressLocationX({ offsetX: 64 })).toBe(64);
    expect(pressLocationX({ locationX: undefined, offsetX: 0 })).toBe(0);
    expect(pressLocationX({ locationX: Number.NaN, offsetX: 'x' })).toBeNull();
    expect(pressLocationX({})).toBeNull();
  });

  it('labels an editable segment with type, times and day', () => {
    expect(ribbonSegmentAccessibilityLabel('Work', block('w', '09:00', '12:00'), 'Monday')).toBe(
      'Work, 9am to 12pm, Monday'
    );
    expect(ribbonSegmentAccessibilityLabel('Reading', block('r', '22:00', '23:30'))).toBe(
      'Reading, 10pm to 11:30pm'
    );
  });
});
