import { describe, expect, it } from 'vitest';
import { getRoutineBreakdown } from '../../src/core/engine/analytics';
import {
  formatWeeklyHours,
  pieSlices,
  pieWedges,
  plannedBreakdown,
  rankedBars,
  type BreakdownDatum,
} from '../../src/components/breakdown/pieLayout';
import type { DayOfWeek } from '../../src/core/types';
import { makeActivityType, makeRoutine, makeRoutineBlock } from '../helpers/builders';

const types = [
  makeActivityType({ id: 'work', name: 'Work', color: '#E53935' }),
  makeActivityType({ id: 'fitness', name: 'Fitness', color: '#4CAF50' }),
  makeActivityType({ id: 'reading', name: 'Reading', color: '#111111' }),
  makeActivityType({ id: 'unused', name: 'Unused', color: '#999999' }),
];

let nextId = 0;
const span = (activityTypeId: string, days: DayOfWeek[], start: number, end: number) =>
  days.map((dayOfWeek) =>
    makeRoutineBlock({ id: `b${nextId++}`, activityTypeId, dayOfWeek, startMinutes: start, endMinutes: end })
  );

// Work 5 × 7h = 35h, Fitness 3 × 1h + an overnight 23:30–00:30 = 4h, Reading 7 × 1h = 7h.
const routine = makeRoutine({
  blocks: [
    ...span('work', [1, 2, 3, 4, 5], 9 * 60, 16 * 60),
    ...span('fitness', [1, 3, 5], 7 * 60, 8 * 60),
    ...span('fitness', [6], 23 * 60 + 30, 30),
    ...span('reading', [0, 1, 2, 3, 4, 5, 6], 22 * 60, 23 * 60),
    // A block whose type was deleted: getRoutineBreakdown leaves it out, so the pie does too.
    ...span('deleted-type', [0], 10 * 60, 12 * 60),
  ],
});

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe('plannedBreakdown', () => {
  it('is getRoutineBreakdown, reshaped, largest first', () => {
    const engine = getRoutineBreakdown(routine, types);
    const data = plannedBreakdown(routine, types);
    expect(data).toEqual(
      engine.map((row) => ({
        id: row.activityTypeId,
        name: row.activityTypeName,
        color: row.color,
        minutes: row.plannedMinutes,
      }))
    );
    expect(data.map((row) => [row.name, row.minutes])).toEqual([
      ['Work', 35 * 60],
      ['Reading', 7 * 60],
      ['Fitness', 4 * 60],
    ]);
  });

  it('is empty without a routine', () => {
    expect(plannedBreakdown(null, types)).toEqual([]);
    expect(plannedBreakdown(undefined, types)).toEqual([]);
  });
});

describe('pieSlices', () => {
  const data = plannedBreakdown(routine, types);
  const slices = pieSlices(data);

  it('sweeps add up to 360 and slices are contiguous from 12 o’clock', () => {
    expect(sum(slices.map((slice) => slice.sweep))).toBeCloseTo(360, 9);
    expect(slices[0].startAngle).toBe(0);
    for (let index = 1; index < slices.length; index++) {
      expect(slices[index].startAngle).toBeCloseTo(
        slices[index - 1].startAngle + slices[index - 1].sweep,
        9
      );
    }
    const last = slices[slices.length - 1];
    expect(last.startAngle + last.sweep).toBe(360);
  });

  it('gives each type its share of the planned minutes from getRoutineBreakdown', () => {
    const engine = getRoutineBreakdown(routine, types);
    const total = sum(engine.map((row) => row.plannedMinutes));
    expect(slices.map((slice) => slice.id)).toEqual(engine.map((row) => row.activityTypeId));
    slices.forEach((slice, index) => {
      expect(slice.sweep).toBeCloseTo((engine[index].plannedMinutes / total) * 360, 9);
      expect(slice.color).toBe(engine[index].color);
    });
    // 35 : 7 : 4 of 46 hours.
    expect(slices.map((slice) => slice.percent)).toEqual([76, 15, 9]);
  });

  it('drops empty or invalid rows and returns nothing for no time', () => {
    const rows: BreakdownDatum[] = [
      { id: 'a', name: 'A', color: '#000', minutes: 0 },
      { id: 'b', name: 'B', color: '#000', minutes: Number.NaN },
      { id: 'c', name: 'C', color: '#000', minutes: 30 },
    ];
    expect(pieSlices(rows)).toEqual([
      expect.objectContaining({ id: 'c', startAngle: 0, sweep: 360, fraction: 1, percent: 100 }),
    ]);
    expect(pieSlices([])).toEqual([]);
    expect(pieSlices([{ id: 'a', name: 'A', color: '#000', minutes: 0 }])).toEqual([]);
  });
});

describe('pieWedges', () => {
  it('splits slices over 180° so every wedge can be drawn as a half-disc', () => {
    const slices = pieSlices(plannedBreakdown(routine, types));
    const wedges = pieWedges(slices);
    expect(wedges.every((wedge) => wedge.sweep > 0 && wedge.sweep <= 180)).toBe(true);
    expect(sum(wedges.map((wedge) => wedge.sweep))).toBeCloseTo(360, 9);
    // Work is 76% (273.9°): two wedges, 0–180 and 180–273.9.
    const work = wedges.filter((wedge) => wedge.key.startsWith('work:'));
    expect(work.map((wedge) => wedge.startAngle)).toEqual([0, 180]);
    expect(work[1].sweep).toBeCloseTo((35 / 46) * 360 - 180, 9);
  });

  it('draws a single type as two half-discs', () => {
    const wedges = pieWedges(pieSlices([{ id: 'x', name: 'X', color: '#123', minutes: 60 }]));
    expect(wedges).toEqual([
      { key: 'x:0', color: '#123', startAngle: 0, sweep: 180 },
      { key: 'x:1', color: '#123', startAngle: 180, sweep: 180 },
    ]);
  });
});

describe('rankedBars and hour labels (p43)', () => {
  it('ranks longest first with lengths proportional to the longest', () => {
    const bars = rankedBars([
      { id: 'f', name: 'Fitness', color: '#0f0', minutes: 8 * 60 },
      { id: 'w', name: 'Work', color: '#f00', minutes: 35 * 60 },
      { id: 'e', name: 'Entertainment', color: '#fa0', minutes: 22 * 60 },
      { id: 'z', name: 'Zero', color: '#000', minutes: 0 },
    ]);
    expect(bars.map((bar) => bar.name)).toEqual(['Work', 'Entertainment', 'Fitness']);
    expect(bars.map((bar) => bar.widthFraction)).toEqual([1, 22 / 35, 8 / 35]);
  });

  it('formats weekly hours like the design', () => {
    expect(formatWeeklyHours(35 * 60)).toBe('35hrs');
    expect(formatWeeklyHours(8.5 * 60)).toBe('8.5hrs');
    expect(formatWeeklyHours(45)).toBe('45min');
    expect(formatWeeklyHours(0)).toBe('0hrs');
  });
});
