import { describe, expect, it, vi } from 'vitest';

import {
  buildDaySlices,
  buildForecastEntriesByDate,
  buildMonthCells,
  buildWeekDays,
  calendarTitle,
  calendarToday,
  computeCalendarForecast,
  createForecastMemo,
  dayRibbonWindow,
  formatSliceLine,
  monthCellDisplay,
  openCalendarDay,
  resolveTypeFilter,
  slicesToRibbonBlocks,
  stepCalendar,
  summarizeUnscheduled,
  zoomCalendar,
  type CalendarFilter,
  type CalendarGoal,
} from '../../src/core/engine/forecastCalendar';
import type { RoutineBlock } from '../../src/core/types';
import { makeGoal, makeRoutine, makeRoutineBlock } from '../helpers/builders';

const WORK = 'activity-work';
const HEALTH = 'activity-health';
const FOOD = 'activity-food';
const H = 60;
const TYPES = [
  { id: WORK, name: 'Work' },
  { id: HEALTH, name: 'Health' },
  { id: FOOD, name: 'Food' },
];

const COMPLETIONS: CalendarFilter = { typeId: null, granularity: 'completions' };
const MILESTONES: CalendarFilter = { typeId: null, granularity: 'milestones' };

// 21 Sep 2026 is a Monday. Built inside functions, never at module load.
const monday = (hours = 0, minutes = 0) => new Date(2026, 8, 21, hours, minutes);

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
function workRoutine(extra: RoutineBlock[] = []) {
  return makeRoutine({
    blocks: [...everyDay({ id: 'work', activityTypeId: WORK, startMinutes: 9 * H, endMinutes: 13 * H }), ...extra],
  });
}

function directorGoals(): CalendarGoal[] {
  return [
    makeGoal({ id: 'ftue', name: 'Design FTUE flow', activityTypeId: WORK, estimatedMinutes: 6 * H, order: 0 }),
    makeGoal({
      id: 'analytics',
      name: 'Integrate Analytics Framework',
      activityTypeId: WORK,
      estimatedMinutes: 8 * H,
      order: 1,
    }),
  ];
}

function entrySummary(byDate: Map<string, { goalId: string; kind: string; badge: string }[]>) {
  return Object.fromEntries(
    [...byDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, entries]) => [date, entries.map((e) => `${e.goalId}:${e.kind === 'completion' ? 'done' : e.badge}`)])
  );
}

describe('buildForecastEntriesByDate — month-cell data', () => {
  it('puts each completion on its forecast day (review 27:18)', () => {
    const goals = directorGoals();
    const forecast = computeCalendarForecast(workRoutine(), goals, monday());
    expect(entrySummary(buildForecastEntriesByDate(forecast, goals, COMPLETIONS))).toEqual({
      '2026-09-22': ['ftue:done'],
      '2026-09-24': ['analytics:done'],
    });
  });

  it('adds 25/50/75% milestones only with the milestones granularity, in time order', () => {
    const goals = directorGoals();
    const forecast = computeCalendarForecast(workRoutine(), goals, monday());
    expect(entrySummary(buildForecastEntriesByDate(forecast, goals, MILESTONES))).toEqual({
      // FTUE 6h: 25% at 10:30 and 50% at 12:00 on Monday.
      '2026-09-21': ['ftue:25%', 'ftue:50%'],
      // 75% at 09:30, done at 11:00, then Analytics' 25% (2h) at 13:00.
      '2026-09-22': ['ftue:75%', 'ftue:done', 'analytics:25%'],
      '2026-09-23': ['analytics:50%', 'analytics:75%'],
      '2026-09-24': ['analytics:done'],
    });
  });

  it('leaves out milestones the logged time has already passed', () => {
    const goals = [
      makeGoal({ id: 'ftue', name: 'FTUE', activityTypeId: WORK, estimatedMinutes: 6 * H, loggedMinutes: 100 }),
    ];
    const forecast = computeCalendarForecast(workRoutine(), goals, monday());
    const badges = [...buildForecastEntriesByDate(forecast, goals, MILESTONES).values()]
      .flat()
      .map((entry) => entry.badge);
    expect(badges).toEqual(['50%', '75%', '']);
  });

  it('filters to one activity type', () => {
    const goals = [
      ...directorGoals(),
      makeGoal({ id: 'run', name: 'Run 5k', activityTypeId: HEALTH, estimatedMinutes: H, order: 2 }),
    ];
    const routine = workRoutine(everyDay({ id: 'gym', activityTypeId: HEALTH, startMinutes: 7 * H, endMinutes: 8 * H }));
    const forecast = computeCalendarForecast(routine, goals, monday());

    expect(entrySummary(buildForecastEntriesByDate(forecast, goals, COMPLETIONS))).toEqual({
      '2026-09-21': ['run:done'],
      '2026-09-22': ['ftue:done'],
      '2026-09-24': ['analytics:done'],
    });
    expect(entrySummary(buildForecastEntriesByDate(forecast, goals, { ...COMPLETIONS, typeId: WORK }))).toEqual({
      '2026-09-22': ['ftue:done'],
      '2026-09-24': ['analytics:done'],
    });
    expect(entrySummary(buildForecastEntriesByDate(forecast, goals, { ...COMPLETIONS, typeId: HEALTH }))).toEqual({
      '2026-09-21': ['run:done'],
    });
  });

  it('tolerates goals without a type or an estimate (#50)', () => {
    const goals: CalendarGoal[] = [
      { ...makeGoal({ id: 'untyped', order: 0 }), activityTypeId: undefined },
      { ...makeGoal({ id: 'unestimated', activityTypeId: WORK, order: 1 }), estimatedMinutes: undefined },
      ...directorGoals().map((goal, index) => ({ ...goal, order: index + 2 })),
    ];
    const forecast = computeCalendarForecast(workRoutine(), goals, monday());
    expect(entrySummary(buildForecastEntriesByDate(forecast, goals, MILESTONES))['2026-09-22']).toEqual([
      'ftue:75%',
      'ftue:done',
      'analytics:25%',
    ]);
  });
});

describe('reordering goals moves the completion dates (plan exit criterion 3)', () => {
  it('swapping the two Work goals moves both dates', () => {
    const [ftue, analytics] = directorGoals();
    const before = [ftue, analytics];
    const after = [
      { ...analytics, order: 0 },
      { ...ftue, order: 1 },
    ];
    const cellsFor = (goals: CalendarGoal[]) => {
      const forecast = computeCalendarForecast(workRoutine(), goals, monday());
      const cells = buildMonthCells(2026, 8, 1, buildForecastEntriesByDate(forecast, goals, COMPLETIONS), '2026-09-21');
      return Object.fromEntries(
        cells.filter((cell) => cell.entries.length > 0).map((cell) => [cell.date, cell.entries.map((e) => e.goalName)])
      );
    };

    expect(cellsFor(before)).toEqual({
      '2026-09-22': ['Design FTUE flow'],
      '2026-09-24': ['Integrate Analytics Framework'],
    });
    // Analytics (8h) now takes Monday and Tuesday; FTUE (6h) finishes on Thursday.
    expect(cellsFor(after)).toEqual({
      '2026-09-22': ['Integrate Analytics Framework'],
      '2026-09-24': ['Design FTUE flow'],
    });
  });

  it('follows `order`, not array position', () => {
    const [ftue, analytics] = directorGoals();
    const goals = [ftue, analytics].map((goal) => ({ ...goal, order: goal === ftue ? 1 : 0 }));
    const forecast = computeCalendarForecast(workRoutine(), goals, monday());
    expect(forecast.completions.analytics.date).toBe('2026-09-22');
    expect(forecast.completions.ftue.date).toBe('2026-09-24');
  });
});

describe('buildMonthCells', () => {
  it('lays the month out Monday-first with only the rows it needs', () => {
    const cells = buildMonthCells(2026, 8, 1, new Map(), '2026-09-17');
    // 1 Sep 2026 is a Tuesday: one leading day, 30 days, five rows.
    expect(cells).toHaveLength(35);
    expect(cells[0]).toMatchObject({ date: '2026-08-31', dayOfMonth: 31, inMonth: false });
    expect(cells[1]).toMatchObject({ date: '2026-09-01', inMonth: true });
    expect(cells[34]).toMatchObject({ date: '2026-10-04', inMonth: false });
    expect(cells.filter((cell) => cell.isToday).map((cell) => cell.date)).toEqual(['2026-09-17']);
  });

  it('follows a Sunday week start and grows to six rows when needed', () => {
    expect(buildMonthCells(2026, 8, 0, new Map(), '')[0].date).toBe('2026-08-30');
    // 1 Aug 2026 is a Saturday: five leading days + 31 = six rows Monday-first.
    const august = buildMonthCells(2026, 7, 1, new Map(), '');
    expect(august).toHaveLength(42);
    expect(august[0].date).toBe('2026-07-27');
  });

  it('keeps entries on days outside the month, as p69 does on 30 Aug', () => {
    const entry = {
      key: 'g:done', goalId: 'g', goalName: 'Follow up with John', kind: 'completion' as const,
      fraction: 1, minutes: 600, badge: '',
    };
    const cells = buildMonthCells(2026, 8, 1, new Map([['2026-10-02', [entry]]]), '');
    expect(cells.find((cell) => cell.date === '2026-10-02')).toMatchObject({ inMonth: false, entries: [entry] });
  });
});

describe('monthCellDisplay', () => {
  const entries = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({
    key: id, goalId: id, goalName: id, kind: 'completion' as const, fraction: 1, minutes: 0, badge: '',
  }));

  it('shows names in a wide cell, with a "more" count past three', () => {
    const display = monthCellDisplay(entries.slice(0, 4), 150);
    expect(display).toMatchObject({ mode: 'names', more: 1 });
    expect(display.shown.map((e) => e.goalId)).toEqual(['a', 'b', 'c']);
  });

  it('collapses to dots with a count in a narrow cell (500px wide)', () => {
    const display = monthCellDisplay(entries, 500 / 7);
    expect(display).toMatchObject({ mode: 'dots', count: 6 });
    expect(display.shown).toHaveLength(4);
  });
});

describe('buildDaySlices — which goal occupies which block (plan exit criterion 2)', () => {
  it('lists the director’s Tuesday in order, labelled by goal', () => {
    const goals = directorGoals();
    const forecast = computeCalendarForecast(workRoutine(), goals, monday());
    const slices = buildDaySlices(forecast, goals, '2026-09-22', COMPLETIONS);
    expect(slices.map(formatSliceLine)).toEqual([
      '09:00–11:00 · Design FTUE flow (done)',
      '11:00–13:00 · Integrate Analytics Framework',
    ]);
  });

  it('notes milestones reached inside a slice with the milestones granularity', () => {
    const goals = directorGoals();
    const forecast = computeCalendarForecast(workRoutine(), goals, monday());
    expect(buildDaySlices(forecast, goals, '2026-09-22', MILESTONES).map(formatSliceLine)).toEqual([
      '09:00–11:00 · Design FTUE flow (75%, done)',
      '11:00–13:00 · Integrate Analytics Framework (25%)',
    ]);
  });

  it('lists block time no goal uses, from `from` on', () => {
    const goals = directorGoals();
    const routine = workRoutine(everyDay({ id: 'lunch', activityTypeId: FOOD, startMinutes: 13 * H, endMinutes: 14 * H }));
    const from = monday(10);
    const forecast = computeCalendarForecast(routine, goals, from);
    const options = { routine, from, activityTypes: TYPES };

    expect(buildDaySlices(forecast, goals, '2026-09-21', COMPLETIONS, options).map(formatSliceLine)).toEqual([
      '10:00–13:00 · Design FTUE flow',
      '13:00–14:00 · Food (no goal)',
    ]);
    // FTUE ends Tue 12:00; Analytics gets 1h + 4h + 3h and finishes Thu 12:00. The rest is free.
    expect(buildDaySlices(forecast, goals, '2026-09-24', COMPLETIONS, options).map(formatSliceLine)).toEqual([
      '09:00–12:00 · Integrate Analytics Framework (done)',
      '12:00–13:00 · Work (no goal)',
      '13:00–14:00 · Food (no goal)',
    ]);
    // Nothing is forecast for a day before `from`.
    expect(buildDaySlices(forecast, goals, '2026-09-20', COMPLETIONS, options)).toEqual([]);
    // The type filter applies to free time too.
    expect(
      buildDaySlices(forecast, goals, '2026-09-21', { ...COMPLETIONS, typeId: FOOD }, options).map(formatSliceLine)
    ).toEqual(['13:00–14:00 · Food (no goal)']);
  });

  it('shows the after-midnight part of the previous day’s overnight slice first', () => {
    const routine = makeRoutine({
      blocks: everyDay({ id: 'late', activityTypeId: WORK, startMinutes: 22 * H, endMinutes: 2 * H }),
    });
    const goals = [makeGoal({ id: 'late', name: 'Late shift', activityTypeId: WORK, estimatedMinutes: 3 * H })];
    const forecast = computeCalendarForecast(routine, goals, monday());
    const slices = buildDaySlices(forecast, goals, '2026-09-21', COMPLETIONS);

    // Sunday's block runs into Monday 00:00–02:00, then Monday 22:00–23:00 finishes the goal.
    expect(slices.map(formatSliceLine)).toEqual([
      '00:00–02:00 · Late shift',
      '22:00–23:00 · Late shift (done)',
    ]);
    expect(slices[0]).toMatchObject({ carryover: true, date: '2026-09-21', startMinutes: 0, endMinutes: 120 });
    expect(slicesToRibbonBlocks(slices)).toEqual([
      { id: slices[0].key, dayOfWeek: 1, startMinutes: 0, endMinutes: 120, activityTypeId: WORK },
      { id: slices[1].key, dayOfWeek: 1, startMinutes: 1320, endMinutes: 1380, activityTypeId: WORK },
    ]);
    expect(dayRibbonWindow(slices)).toEqual({ startMinutes: 0, endMinutes: 1380 });
  });

  it('clips an overnight slice at midnight for the ribbon', () => {
    const routine = makeRoutine({
      blocks: [makeRoutineBlock({ id: 'mon', dayOfWeek: 1, activityTypeId: WORK, startMinutes: 22 * H, endMinutes: 2 * H })],
    });
    const goals = [makeGoal({ id: 'g', name: 'G', activityTypeId: WORK, estimatedMinutes: 4 * H })];
    const forecast = computeCalendarForecast(routine, goals, monday());
    const slices = buildDaySlices(forecast, goals, '2026-09-21', COMPLETIONS);
    expect(slices.map(formatSliceLine)).toEqual(['22:00–02:00 · G (done)']);
    expect(slicesToRibbonBlocks(slices)[0]).toMatchObject({ startMinutes: 1320, endMinutes: 1440 });
    expect(dayRibbonWindow(slices)).toEqual({ startMinutes: 420, endMinutes: 1440 });
  });

  it('defaults the ribbon window to 7am–11pm', () => {
    expect(dayRibbonWindow([])).toEqual({ startMinutes: 420, endMinutes: 1380 });
  });
});

describe('buildWeekDays', () => {
  it('returns the anchor’s week in the user’s order, each day with its slices', () => {
    const goals = directorGoals();
    const forecast = computeCalendarForecast(workRoutine(), goals, monday());
    const entries = buildForecastEntriesByDate(forecast, goals, COMPLETIONS);
    const week = buildWeekDays('2026-09-23', 1, forecast, goals, COMPLETIONS, entries, '2026-09-22');

    expect(week.map((day) => day.date)).toEqual([
      '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27',
    ]);
    expect(week.map((day) => day.slices.map((s) => `${s.label.split(' ')[0]} ${s.timeRange}`))).toEqual([
      ['Design 09:00–13:00'],
      ['Design 09:00–11:00', 'Integrate 11:00–13:00'],
      ['Integrate 09:00–13:00'],
      ['Integrate 09:00–11:00'],
      [], [], [],
    ]);
    expect(week.filter((day) => day.isToday).map((day) => day.date)).toEqual(['2026-09-22']);
    expect(week[3].entries.map((e) => e.goalId)).toEqual(['analytics']);
    expect(week[3].slices[0].completes).toBe(true);

    expect(buildWeekDays('2026-09-23', 0, forecast, goals, COMPLETIONS, entries, '')[0].date).toBe('2026-09-20');
    expect(
      buildWeekDays('2026-09-23', 1, forecast, goals, { ...COMPLETIONS, typeId: HEALTH }, entries, '')
        .flatMap((day) => day.slices)
    ).toEqual([]);
  });
});

describe('zoom and navigation', () => {
  it('steps by month (to the 1st), week and day', () => {
    expect(stepCalendar({ zoom: 'month', date: '2026-01-31' }, -1)).toEqual({ zoom: 'month', date: '2025-12-01' });
    expect(stepCalendar({ zoom: 'month', date: '2026-01-31' }, 1)).toEqual({ zoom: 'month', date: '2026-02-01' });
    expect(stepCalendar({ zoom: 'week', date: '2026-09-28' }, 1)).toEqual({ zoom: 'week', date: '2026-10-05' });
    expect(stepCalendar({ zoom: 'day', date: '2026-12-31' }, 1)).toEqual({ zoom: 'day', date: '2027-01-01' });
    expect(stepCalendar({ zoom: 'day', date: '2026-03-01' }, -1)).toEqual({ zoom: 'day', date: '2026-02-28' });
  });

  it('tapping a day opens day view for it', () => {
    expect(openCalendarDay('2026-09-22')).toEqual({ zoom: 'day', date: '2026-09-22' });
  });

  it('zooms in to today from the current month, and to the anchor from another month', () => {
    expect(zoomCalendar({ zoom: 'month', date: '2026-09-01' }, 'day', '2026-09-17')).toEqual({
      zoom: 'day',
      date: '2026-09-17',
    });
    expect(zoomCalendar({ zoom: 'month', date: '2026-11-01' }, 'week', '2026-09-17')).toEqual({
      zoom: 'week',
      date: '2026-11-01',
    });
    expect(zoomCalendar({ zoom: 'day', date: '2026-11-05' }, 'month', '2026-09-17')).toEqual({
      zoom: 'month',
      date: '2026-11-05',
    });
    expect(zoomCalendar({ zoom: 'week', date: '2026-11-05' }, 'day', '2026-09-17')).toEqual({
      zoom: 'day',
      date: '2026-11-05',
    });
  });

  it('"Today" keeps the zoom', () => {
    expect(calendarToday({ zoom: 'week', date: '2027-01-01' }, '2026-09-17')).toEqual({
      zoom: 'week',
      date: '2026-09-17',
    });
  });

  it('titles each zoom', () => {
    expect(calendarTitle({ zoom: 'month', date: '2026-09-17' }, 1)).toBe('September 2026');
    expect(calendarTitle({ zoom: 'day', date: '2026-09-22' }, 1)).toBe('Tuesday 22 September 2026');
    expect(calendarTitle({ zoom: 'week', date: '2026-09-23' }, 1)).toBe('21–27 Sep 2026');
    expect(calendarTitle({ zoom: 'week', date: '2026-09-30' }, 1)).toBe('28 Sep – 4 Oct 2026');
    expect(calendarTitle({ zoom: 'week', date: '2026-12-30' }, 1)).toBe('28 Dec 2026 – 3 Jan 2027');
    expect(calendarTitle({ zoom: 'week', date: '2026-09-23' }, 0)).toBe('20–26 Sep 2026');
  });

  it('falls back to all types when the filtered type is gone', () => {
    expect(resolveTypeFilter(WORK, TYPES)).toBe(WORK);
    expect(resolveTypeFilter('deleted', TYPES)).toBeNull();
    expect(resolveTypeFilter(null, TYPES)).toBeNull();
  });
});

describe('summarizeUnscheduled', () => {
  it('reads like the brief: "3 goals have no forecast: 1 has no type, 2 have no routine time"', () => {
    const goals: CalendarGoal[] = [
      { ...makeGoal({ id: 'untyped', name: 'Untyped', order: 0 }), activityTypeId: undefined },
      makeGoal({ id: 'run', name: 'Run', activityTypeId: HEALTH, order: 1 }),
      makeGoal({ id: 'swim', name: 'Swim', activityTypeId: HEALTH, order: 2 }),
      ...directorGoals().map((goal, index) => ({ ...goal, order: index + 3 })),
    ];
    const routine = workRoutine();
    const forecast = computeCalendarForecast(routine, goals, monday());
    const summary = summarizeUnscheduled(forecast.unscheduled, goals, routine, { activityTypes: TYPES });

    expect(summary.headline).toBe('3 goals have no forecast: 1 has no type, 2 have no routine time');
    expect(summary.items).toEqual([
      { goalId: 'untyped', goalName: 'Untyped', reason: 'no-type', text: 'No activity type' },
      { goalId: 'run', goalName: 'Run', reason: 'no-routine-time', text: 'No Health time in the routine' },
      { goalId: 'swim', goalName: 'Swim', reason: 'no-routine-time', text: 'No Health time in the routine' },
    ]);
  });

  it('counts missing estimates and goals past the horizon, and skips finished or paused goals', () => {
    const goals: CalendarGoal[] = [
      { ...makeGoal({ id: 'vague', name: 'Vague', activityTypeId: WORK, order: 0 }), estimatedMinutes: undefined },
      makeGoal({ id: 'huge', name: 'Huge', activityTypeId: WORK, estimatedMinutes: 100_000, order: 1 }),
      makeGoal({ id: 'after', name: 'After', activityTypeId: WORK, estimatedMinutes: H, order: 2 }),
      makeGoal({ id: 'done', name: 'Done', activityTypeId: WORK, status: 'completed', order: 3 }),
      makeGoal({ id: 'paused', name: 'Paused', activityTypeId: HEALTH, status: 'paused', order: 4 }),
    ];
    const routine = workRoutine();
    const forecast = computeCalendarForecast(routine, goals, monday());
    const summary = summarizeUnscheduled(forecast.unscheduled, goals, routine, { activityTypes: TYPES });

    expect(summary.headline).toBe("3 goals have no forecast: 1 has no estimate, 2 don't finish within a year");
    expect(summary.items.map((item) => [item.goalId, item.text])).toEqual([
      ['vague', 'No estimate'],
      ['huge', "Doesn't finish within a year"],
      ['after', "Doesn't finish within a year"],
    ]);
  });

  it('narrows to the filtered type, and is empty when everything is placed', () => {
    const goals: CalendarGoal[] = [
      { ...makeGoal({ id: 'untyped', name: 'Untyped', order: 0 }), activityTypeId: undefined },
      makeGoal({ id: 'run', name: 'Run', activityTypeId: HEALTH, order: 1 }),
      ...directorGoals().map((goal, index) => ({ ...goal, order: index + 2 })),
    ];
    const routine = workRoutine();
    const forecast = computeCalendarForecast(routine, goals, monday());

    expect(summarizeUnscheduled(forecast.unscheduled, goals, routine, { typeId: HEALTH }).headline).toBe(
      '1 goal has no forecast: 1 has no routine time'
    );
    expect(summarizeUnscheduled(forecast.unscheduled, goals, routine, { typeId: WORK })).toEqual({
      total: 0,
      headline: '',
      items: [],
    });
  });
});

describe('createForecastMemo', () => {
  it('recomputes only when the routine, goals, tracking or hour changes', () => {
    const compute = vi.fn(computeCalendarForecast);
    const memo = createForecastMemo(compute);
    const routine = workRoutine();
    const goals = directorGoals();
    const tracking: unknown[] = [];

    const first = memo(routine, goals, tracking, monday(9, 5));
    expect(memo(routine, goals, tracking, monday(9, 55))).toBe(first);
    expect(compute).toHaveBeenCalledTimes(1);
    // The cached forecast reports the instant it was walked from, not the latest clock.
    expect(first.from.getTime()).toBe(monday(9, 5).getTime());
    expect(first.result.completions.ftue.date).toBe('2026-09-22');

    memo(routine, [...goals], tracking, monday(9, 55));
    expect(compute).toHaveBeenCalledTimes(2);
    const newTracking: unknown[] = [];
    memo(routine, goals, newTracking, monday(9, 55));
    expect(compute).toHaveBeenCalledTimes(3);
    const newRoutine = workRoutine();
    const beforeTheHour = memo(newRoutine, goals, newTracking, monday(9, 55));
    expect(compute).toHaveBeenCalledTimes(4);
    expect(memo(newRoutine, goals, newTracking, monday(9, 59))).toBe(beforeTheHour);
    expect(memo(newRoutine, goals, newTracking, monday(10))).not.toBe(beforeTheHour);
    expect(compute).toHaveBeenCalledTimes(5);
  });
});
