import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '../../src/store/useAppStore';

const frozenTime = '2026-03-02T09:00:00.000Z';

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(frozenTime));
  await useAppStore.getState().resetState();
  await AsyncStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

function addGoal(name: string, activityTypeId: string, estimatedMinutes = 120): string {
  const id = useAppStore.getState().addGoal({
    name,
    description: '',
    estimatedMinutes,
    activityTypeId,
  });
  if (!id) throw new Error('Expected the test goal to be created.');
  return id;
}

describe('goal progress invariants', () => {
  it('sets completion once, preserves its timestamp, and reopens after corrected progress', () => {
    const activityTypeId = useAppStore.getState().activityTypes[0].id;
    const goalId = addGoal('Progress', activityTypeId);

    useAppStore.getState().logMinutesToGoal(goalId, 120);
    expect(useAppStore.getState().goals[0]).toMatchObject({
      loggedMinutes: 120,
      status: 'completed',
      completedAt: frozenTime,
    });

    vi.advanceTimersByTime(60_000);
    useAppStore.getState().logMinutesToGoal(goalId, 15);
    expect(useAppStore.getState().goals[0].completedAt).toBe(frozenTime);

    useAppStore.getState().logMinutesToGoal(goalId, -30);
    expect(useAppStore.getState().goals[0]).toMatchObject({
      loggedMinutes: 105,
      status: 'active',
    });
    expect(useAppStore.getState().goals[0].completedAt).toBeUndefined();
  });

  it('never records negative or non-finite progress and clears stale completion metadata', () => {
    const activityTypeId = useAppStore.getState().activityTypes[0].id;
    const goalId = addGoal('Safe totals', activityTypeId);
    useAppStore.getState().logMinutesToGoal(goalId, -50);
    useAppStore.getState().logMinutesToGoal(goalId, Number.NaN);
    useAppStore.getState().logMinutesToGoal(goalId, Number.POSITIVE_INFINITY);
    expect(useAppStore.getState().goals[0].loggedMinutes).toBe(0);

    useAppStore.getState().setGoalStatus(goalId, 'completed');
    expect(useAppStore.getState().goals[0].completedAt).toBe(frozenTime);
    useAppStore.getState().setGoalStatus(goalId, 'paused');
    expect(useAppStore.getState().goals[0]).toMatchObject({ status: 'paused' });
    expect(useAppStore.getState().goals[0].completedAt).toBeUndefined();
  });

  it('reconciles progress when an estimate crosses the logged total', () => {
    const activityTypeId = useAppStore.getState().activityTypes[0].id;
    const goalId = addGoal('Estimate', activityTypeId, 120);
    useAppStore.getState().logMinutesToGoal(goalId, 90);
    useAppStore.getState().updateGoal(goalId, { estimatedMinutes: 60 });
    expect(useAppStore.getState().goals[0].status).toBe('completed');

    useAppStore.getState().updateGoal(goalId, { estimatedMinutes: 180 });
    expect(useAppStore.getState().goals[0]).toMatchObject({
      loggedMinutes: 90,
      status: 'active',
    });
  });

  it('rejects changing a goal activity after routine or tracking data links to it', () => {
    const [firstActivity, secondActivity] = useAppStore.getState().activityTypes;
    const goalId = addGoal('Linked activity', firstActivity.id);
    const routineId = useAppStore.getState().activeRoutineId!;
    useAppStore.getState().addRoutineBlock(routineId, {
      dayOfWeek: 1,
      startMinutes: 540,
      endMinutes: 600,
      activityTypeId: firstActivity.id,
      goalId,
    });

    useAppStore.getState().updateGoal(goalId, { activityTypeId: secondActivity.id });

    expect(useAppStore.getState().goals[0].activityTypeId).toBe(firstActivity.id);
    expect(useAppStore.getState().routines[0].blocks[0].goalId).toBe(goalId);
  });
});

describe('tracking-entry contribution accounting', () => {
  it('records the local calendar date when UTC is already on the next day', () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      vi.setSystemTime(new Date('2026-03-02T00:30:00.000Z'));
      const activityTypeId = useAppStore.getState().activityTypes[0].id;
      const entryId = useAppStore.getState().startTracking({
        activityTypeId,
        source: 'manual',
      });
      expect(useAppStore.getState().trackingEntries.find((entry) => entry.id === entryId)?.date)
        .toBe('2026-03-01');
    } finally {
      process.env.TZ = originalTimeZone;
    }
  });

  it('applies duration edits, goal reassignment, and deletion as atomic deltas', () => {
    const activityTypeId = useAppStore.getState().activityTypes[0].id;
    const goalA = addGoal('A', activityTypeId, 60);
    const goalB = addGoal('B', activityTypeId, 180);
    const entryId = useAppStore.getState().addCompletedEntry({
      date: '2026-03-02',
      startTime: '2026-03-02T09:00:00.000Z',
      endTime: '2026-03-02T10:00:00.000Z',
      activityTypeId,
      goalId: goalA,
      source: 'manual',
    });
    expect(entryId).not.toBeNull();
    expect(useAppStore.getState().goals.find((goal) => goal.id === goalA)).toMatchObject({
      loggedMinutes: 60,
      status: 'completed',
    });

    const observed: Array<[number, number]> = [];
    const unsubscribe = useAppStore.subscribe((state) => {
      observed.push([
        state.goals.find((goal) => goal.id === goalA)?.loggedMinutes ?? -1,
        state.goals.find((goal) => goal.id === goalB)?.loggedMinutes ?? -1,
      ]);
    });
    useAppStore.getState().updateTrackingEntry(entryId!, {
      endTime: '2026-03-02T10:30:00.000Z',
      goalId: goalB,
    });
    unsubscribe();

    expect(observed.at(-1)).toEqual([0, 90]);
    expect(useAppStore.getState().goals.find((goal) => goal.id === goalA)).toMatchObject({
      loggedMinutes: 0,
      status: 'active',
    });
    expect(useAppStore.getState().goals.find((goal) => goal.id === goalB)?.loggedMinutes).toBe(90);

    useAppStore.getState().deleteTrackingEntry(entryId!);
    expect(useAppStore.getState().goals.find((goal) => goal.id === goalB)?.loggedMinutes).toBe(0);
  });

  it('rejects reopening a completed entry so it cannot become an orphaned timer', () => {
    const activityTypeId = useAppStore.getState().activityTypes[0].id;
    const goalId = addGoal('Editable', activityTypeId);
    const entryId = useAppStore.getState().addCompletedEntry({
      date: '2026-03-02',
      startTime: '2026-03-02T09:00:00.000Z',
      endTime: '2026-03-02T10:00:00.000Z',
      activityTypeId,
      goalId,
      source: 'manual',
    });
    expect(entryId).not.toBeNull();
    useAppStore.getState().updateTrackingEntry(entryId!, { endTime: undefined });
    expect(useAppStore.getState().goals[0].loggedMinutes).toBe(60);
    expect(useAppStore.getState().trackingEntries[0].endTime).toBe(
      '2026-03-02T10:00:00.000Z'
    );
    expect(useAppStore.getState().currentTrackingEntryId).toBeNull();
  });
});

describe('routine store boundary', () => {
  it('rejects invalid references and overlaps including overnight spillover', () => {
    const state = useAppStore.getState();
    const routineId = state.activeRoutineId!;
    const activityTypeId = state.activityTypes[0].id;
    const overnightId = state.addRoutineBlock(routineId, {
      dayOfWeek: 1,
      startMinutes: 23 * 60,
      endMinutes: 60,
      activityTypeId,
    });
    expect(overnightId).not.toBeNull();
    expect(useAppStore.getState().addRoutineBlock(routineId, {
      dayOfWeek: 2,
      startMinutes: 30,
      endMinutes: 90,
      activityTypeId,
    })).toBeNull();
    expect(useAppStore.getState().addRoutineBlock(routineId, {
      dayOfWeek: 3,
      startMinutes: 120,
      endMinutes: 180,
      activityTypeId: 'missing-activity',
    })).toBeNull();
    expect(useAppStore.getState().routines[0].blocks).toHaveLength(1);
  });

  it('rejects missing routine-block references and unlinks history when a block is deleted', () => {
    const state = useAppStore.getState();
    const routineId = state.activeRoutineId!;
    const activityTypeId = state.activityTypes[0].id;

    expect(state.startTracking({
      activityTypeId,
      routineBlockId: 'missing-block',
      source: 'scheduled',
    })).toBeNull();

    const blockId = state.addRoutineBlock(routineId, {
      dayOfWeek: 1,
      startMinutes: 540,
      endMinutes: 600,
      activityTypeId,
    });
    expect(blockId).not.toBeNull();
    const entryId = useAppStore.getState().addCompletedEntry({
      date: '2026-03-02',
      startTime: '2026-03-02T09:00:00.000Z',
      endTime: '2026-03-02T10:00:00.000Z',
      activityTypeId,
      routineBlockId: blockId!,
      source: 'scheduled',
    });
    expect(entryId).not.toBeNull();

    useAppStore.getState().deleteRoutineBlock(routineId, blockId!);

    expect(useAppStore.getState().trackingEntries[0].routineBlockId).toBeUndefined();
  });
});
