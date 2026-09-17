import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatDayMinute,
  formatHomeClock,
  formatRowProgress,
  formatRowTimeRange,
  getDayOverview,
  getScheduledStart,
  getScheduleFocus,
  type DayOverviewGoal,
  type DayOverviewRow,
} from '../../src/core/engine/dayOverview';
import type { RoutineBlock, TrackingEntry } from '../../src/core/types';
import { useAppStore } from '../../src/store/useAppStore';
import { makeGoal, makeRoutine, makeRoutineBlock, makeTrackingEntry } from '../helpers/builders';

const WORK = 'activity-work';
const HEALTH = 'activity-health';
const H = 60;

// 22 Sep 2026 is a Tuesday. Dates are built inside functions, in local time.
function tuesdayAt(hours: number, minutes = 0): Date {
  return new Date(2026, 8, 22, hours, minutes);
}

function everyDay(overrides: Partial<RoutineBlock>): RoutineBlock[] {
  return [1, 2, 3, 4, 5, 6, 0].map((day) =>
    makeRoutineBlock({
      ...overrides,
      id: `${overrides.id ?? 'block'}-${day}`,
      dayOfWeek: day as RoutineBlock['dayOfWeek'],
    })
  );
}

/** The director's example (review 27:18): a four-hour Work block every day, 09:00–13:00. */
const workRoutine = makeRoutine({
  blocks: everyDay({ id: 'work', activityTypeId: WORK, startMinutes: 9 * H, endMinutes: 13 * H }),
});

/** As of Tuesday midnight: Monday's four hours went to Design FTUE. */
function ftue(overrides: Partial<DayOverviewGoal> = {}): DayOverviewGoal {
  return makeGoal({
    id: 'design-ftue',
    name: 'Design FTUE flow',
    activityTypeId: WORK,
    estimatedMinutes: 6 * H,
    loggedMinutes: 4 * H,
    ...overrides,
  });
}

function analytics(overrides: Partial<DayOverviewGoal> = {}): DayOverviewGoal {
  return makeGoal({
    id: 'integrate-analytics',
    name: 'Integrate Analytics Framework',
    activityTypeId: WORK,
    estimatedMinutes: 8 * H,
    loggedMinutes: 0,
    ...overrides,
  });
}

function entry(goalId: string, start: Date, end?: Date): TrackingEntry {
  return makeTrackingEntry({
    id: `entry-${goalId}-${start.getTime()}`,
    date: '2026-09-22',
    activityTypeId: WORK,
    goalId,
    startTime: start.toISOString(),
    endTime: end?.toISOString(),
  });
}

function summary(rows: DayOverviewRow[]) {
  return rows.map((row) => ({
    time: formatRowTimeRange(row),
    goal: row.goalName,
    progress: formatRowProgress(row),
    state: row.state,
  }));
}

describe('getDayOverview — the director’s example on Tuesday', () => {
  it('splits the block: Design FTUE until 11:00, then Integrate Analytics, with running totals', () => {
    // Tracking Design FTUE since 09:00, as planned.
    const rows = getDayOverview({
      routine: workRoutine,
      goals: [ftue(), analytics()],
      trackingEntries: [entry('design-ftue', tuesdayAt(9))],
      now: tuesdayAt(10, 30),
    });

    expect(summary(rows)).toEqual([
      { time: '09:00–11:00', goal: 'Design FTUE flow', progress: '6/6h', state: 'current' },
      { time: '11:00–13:00', goal: 'Integrate Analytics Framework', progress: '2/8h', state: 'upcoming' },
    ]);
    expect(rows[0]).toMatchObject({
      blockId: 'work-2',
      blockStart: 9 * H,
      blockEnd: 13 * H,
      activityTypeId: WORK,
      goalId: 'design-ftue',
      trackedMinutes: 6 * H,
      estimatedMinutes: 6 * H,
    });
  });

  it('shows every row as upcoming before the block, and all as past after it', () => {
    const goals = [ftue(), analytics()];
    const before = getDayOverview({ routine: workRoutine, goals, trackingEntries: [], now: tuesdayAt(8) });
    expect(summary(before).map((row) => [row.time, row.state])).toEqual([
      ['09:00–11:00', 'upcoming'],
      ['11:00–13:00', 'upcoming'],
    ]);

    // After the block, with the morning tracked as planned.
    const after = getDayOverview({
      routine: workRoutine,
      goals: [
        ftue({ loggedMinutes: 6 * H, status: 'completed', completedAt: tuesdayAt(11).toISOString() }),
        analytics({ loggedMinutes: 2 * H }),
      ],
      trackingEntries: [
        entry('design-ftue', tuesdayAt(9), tuesdayAt(11)),
        entry('integrate-analytics', tuesdayAt(11), tuesdayAt(13)),
      ],
      now: tuesdayAt(14),
    });
    expect(summary(after)).toEqual([
      { time: '09:00–11:00', goal: 'Design FTUE flow', progress: '6/6h', state: 'past' },
      { time: '11:00–13:00', goal: 'Integrate Analytics Framework', progress: '2/8h', state: 'past' },
    ]);
  });

  it('keeps past slices on the goals planned for them after time is logged today', () => {
    // 12:00. Design FTUE was tracked 09:00–11:00 and so completed today; Analytics is running.
    const rows = getDayOverview({
      routine: workRoutine,
      goals: [
        ftue({ loggedMinutes: 6 * H, status: 'completed', completedAt: tuesdayAt(11).toISOString() }),
        analytics(),
      ],
      trackingEntries: [
        entry('design-ftue', tuesdayAt(9), tuesdayAt(11)),
        entry('integrate-analytics', tuesdayAt(11)),
      ],
      now: tuesdayAt(12),
    });

    expect(summary(rows)).toEqual([
      // Not counted twice: 4h at midnight + 2h planned = 6h, not 6h + 2h.
      { time: '09:00–11:00', goal: 'Design FTUE flow', progress: '6/6h', state: 'past' },
      // 1h running + 1h still to come.
      { time: '11:00–13:00', goal: 'Integrate Analytics Framework', progress: '2/8h', state: 'current' },
    ]);
  });

  it('keeps the planned past slice even when the goal is still active and its time was logged', () => {
    // Design FTUE got only 09:00–10:00 of its planned two hours; it is 11:30.
    const rows = getDayOverview({
      routine: workRoutine,
      goals: [ftue({ loggedMinutes: 5 * H }), analytics()],
      trackingEntries: [entry('design-ftue', tuesdayAt(9), tuesdayAt(10))],
      now: tuesdayAt(11, 30),
    });

    expect(summary(rows)).toEqual([
      // The plan at midnight: FTUE until 11:00 (4h + 2h).
      { time: '09:00–11:00', goal: 'Design FTUE flow', progress: '6/6h', state: 'past' },
      // From now, the plan moves: FTUE still needs an hour, then Analytics.
      { time: '11:00–11:30', goal: 'Integrate Analytics Framework', progress: '0.5/8h', state: 'past' },
      { time: '11:30–12:30', goal: 'Design FTUE flow', progress: '6/6h', state: 'current' },
      { time: '12:30–13:00', goal: 'Integrate Analytics Framework', progress: '0.5/8h', state: 'upcoming' },
    ]);
  });

  it('moves the rest of today when nothing has been tracked yet', () => {
    const rows = getDayOverview({
      routine: workRoutine,
      goals: [ftue(), analytics()],
      trackingEntries: [],
      now: tuesdayAt(10),
    });
    expect(summary(rows)).toEqual([
      { time: '09:00–12:00', goal: 'Design FTUE flow', progress: '6/6h', state: 'current' },
      { time: '12:00–13:00', goal: 'Integrate Analytics Framework', progress: '1/8h', state: 'upcoming' },
    ]);
  });
});

describe('getDayOverview — other shapes of day', () => {
  it('lists the same goal twice with its running total advancing (design p74)', () => {
    const routine = makeRoutine({
      blocks: [
        makeRoutineBlock({ id: 'am', dayOfWeek: 2, activityTypeId: WORK, startMinutes: 10 * H + 15, endMinutes: 12 * H + 45 }),
        makeRoutineBlock({ id: 'pm', dayOfWeek: 2, activityTypeId: WORK, startMinutes: 14 * H + 30, endMinutes: 17 * H }),
      ],
    });
    const rows = getDayOverview({
      routine,
      goals: [analytics({ name: 'Integrate Analytics Framework' })],
      trackingEntries: [],
      now: tuesdayAt(8),
    });
    expect(summary(rows)).toEqual([
      { time: '10:15–12:45', goal: 'Integrate Analytics Framework', progress: '2.5/8h', state: 'upcoming' },
      { time: '14:30–17:00', goal: 'Integrate Analytics Framework', progress: '5/8h', state: 'upcoming' },
    ]);
  });

  it('gives a block whose type has no goal one row with no goal', () => {
    const routine = makeRoutine({
      blocks: [makeRoutineBlock({ id: 'gym', dayOfWeek: 2, activityTypeId: HEALTH, startMinutes: 13 * H, endMinutes: 14 * H })],
    });
    const rows = getDayOverview({ routine, goals: [ftue()], trackingEntries: [], now: tuesdayAt(13, 20) });
    expect(rows).toEqual([
      {
        blockId: 'gym',
        blockStart: 13 * H,
        blockEnd: 14 * H,
        startMinutes: 13 * H,
        endMinutes: 14 * H,
        activityTypeId: HEALTH,
        goalId: null,
        goalName: null,
        trackedMinutes: 0,
        estimatedMinutes: 0,
        state: 'current',
      },
    ]);
    expect(formatRowProgress(rows[0])).toBe('');
  });

  it('fills the part of a block the goals do not need with a row with no goal', () => {
    const rows = getDayOverview({
      routine: workRoutine,
      goals: [ftue()],
      trackingEntries: [],
      now: tuesdayAt(8),
    });
    expect(summary(rows)).toEqual([
      { time: '09:00–11:00', goal: 'Design FTUE flow', progress: '6/6h', state: 'upcoming' },
      { time: '11:00–13:00', goal: null, progress: '', state: 'upcoming' },
    ]);
  });

  it('tolerates goals with no type or no estimate, and skips paused and long-completed goals', () => {
    const untyped = { ...analytics({ id: 'untyped', name: 'Untyped' }), activityTypeId: undefined };
    const unestimated = { ...analytics({ id: 'unestimated', name: 'Unestimated' }), estimatedMinutes: undefined };
    const paused = analytics({ id: 'paused', name: 'Paused', status: 'paused' });
    const doneLastWeek = analytics({
      id: 'done',
      name: 'Done last week',
      // Marked done by hand, short of its estimate.
      loggedMinutes: 7 * H,
      status: 'completed',
      completedAt: new Date(2026, 8, 15, 12).toISOString(),
    });
    const rows = getDayOverview({
      routine: workRoutine,
      goals: [untyped, unestimated, paused, doneLastWeek, ftue()],
      trackingEntries: [entry('untyped', tuesdayAt(7), tuesdayAt(8))],
      // After the block, so the rows come from the plan at midnight.
      now: tuesdayAt(14),
    });
    expect(summary(rows).map((row) => [row.time, row.goal])).toEqual([
      ['09:00–11:00', 'Design FTUE flow'],
      ['11:00–13:00', null],
    ]);
  });

  it('shows the after-midnight part of yesterday’s overnight block', () => {
    const routine = makeRoutine({
      blocks: [makeRoutineBlock({ id: 'late', dayOfWeek: 1, activityTypeId: WORK, startMinutes: 22 * H, endMinutes: 2 * H })],
    });
    const rows = getDayOverview({
      routine,
      goals: [analytics()],
      trackingEntries: [],
      now: tuesdayAt(1),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      blockStart: -2 * H,
      blockEnd: 2 * H,
      startMinutes: 0,
      endMinutes: 2 * H,
      goalId: 'integrate-analytics',
      state: 'current',
      trackedMinutes: 1 * H,
    });
    expect(formatRowTimeRange(rows[0])).toBe('00:00–02:00');
  });

  it('returns no rows without a routine or without blocks today', () => {
    expect(getDayOverview({ routine: null, goals: [ftue()], trackingEntries: [], now: tuesdayAt(9) })).toEqual([]);
    const mondayOnly = makeRoutine({ blocks: [makeRoutineBlock({ dayOfWeek: 1, activityTypeId: WORK })] });
    expect(getDayOverview({ routine: mondayOnly, goals: [ftue()], trackingEntries: [], now: tuesdayAt(9) })).toEqual([]);
  });
});

describe('getScheduleFocus', () => {
  const rowsAt = (hours: number) =>
    getDayOverview({ routine: workRoutine, goals: [ftue(), analytics()], trackingEntries: [], now: tuesdayAt(hours) });

  it('offers the row scheduled now', () => {
    const focus = getScheduleFocus(rowsAt(9));
    expect(focus.kind).toBe('now');
    expect(focus.kind !== 'none' && focus.row.goalName).toBe('Design FTUE flow');
  });

  it('offers the next row when nothing is scheduled now', () => {
    const focus = getScheduleFocus(rowsAt(7));
    expect(focus.kind).toBe('next');
    expect(focus.kind !== 'none' && formatRowTimeRange(focus.row)).toBe('09:00–11:00');
  });

  it('offers nothing after the last block', () => {
    expect(getScheduleFocus(rowsAt(14))).toEqual({ kind: 'none' });
  });
});

describe('formatting', () => {
  it('formats the Home clock line', () => {
    expect(formatHomeClock(new Date(2026, 8, 17, 17, 12, 45))).toBe('Thursday 17 September · 17:12');
    expect(formatHomeClock(new Date(2026, 0, 4, 7, 5))).toBe('Sunday 4 January · 07:05');
  });

  it('formats minutes on today’s scale and progress in hours', () => {
    expect(formatDayMinute(-120)).toBe('22:00');
    expect(formatDayMinute(1560)).toBe('02:00');
    expect(formatRowProgress({ goalId: 'g', trackedMinutes: 2700, estimatedMinutes: 4800 })).toBe('45/80h');
    expect(formatRowProgress({ goalId: 'g', trackedMinutes: 150, estimatedMinutes: 480 })).toBe('2.5/8h');
  });
});

describe('Start from the schedule links the goal (store)', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(tuesdayAt(10, 30));
    await useAppStore.getState().resetState();
    await AsyncStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts tracking the scheduled goal, with its type and block', () => {
    const store = useAppStore.getState();
    const [work, other] = store.activityTypes;
    const addGoal = (name: string, activityTypeId: string, estimatedMinutes: number) => {
      const id = useAppStore.getState().addGoal({ name, description: '', estimatedMinutes, activityTypeId });
      if (!id) throw new Error('Expected the test goal to be created.');
      return id;
    };
    addGoal('Something else', other.id, 60);
    const ftueId = addGoal('Design FTUE flow', work.id, 6 * H);
    addGoal('Integrate Analytics Framework', work.id, 8 * H);
    const routineId = useAppStore.getState().activeRoutineId;
    useAppStore.setState((state) => ({
      routines: state.routines.map((routine) =>
        routine.id === routineId
          ? { ...routine, blocks: [makeRoutineBlock({ id: 'tue-work', dayOfWeek: 2, activityTypeId: work.id, startMinutes: 9 * H, endMinutes: 13 * H })] }
          : routine
      ),
    }));

    const state = useAppStore.getState();
    const focus = getScheduleFocus(
      getDayOverview({
        routine: state.routines.find((routine) => routine.id === routineId),
        goals: state.goals,
        trackingEntries: state.trackingEntries,
        now: new Date(),
      })
    );
    if (focus.kind !== 'now') throw new Error(`Expected a scheduled row now, got ${focus.kind}.`);
    expect(focus.row.goalName).toBe('Design FTUE flow');

    const entryId = useAppStore.getState().startTracking(getScheduledStart(focus.row));
    expect(entryId).not.toBeNull();
    const started = useAppStore.getState().trackingEntries.find((candidate) => candidate.id === entryId);
    expect(started).toMatchObject({
      activityTypeId: work.id,
      goalId: ftueId,
      routineBlockId: 'tue-work',
      source: 'scheduled',
    });
    expect(useAppStore.getState().currentTrackingEntryId).toBe(entryId);
  });
});
