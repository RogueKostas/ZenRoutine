import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppState, Goal } from '../../src/core/types';
import { useAppStore } from '../../src/store/useAppStore';
import {
  CURRENT_SCHEMA_VERSION,
  migratePersistedState,
  selectPersistedAppState,
} from '../../src/store/persistence';

const storageKey = 'zenroutine-storage';
const frozenTime = '2026-03-02T09:00:00.000Z';

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(frozenTime));
  await useAppStore.persist.rehydrate();
  await useAppStore.getState().resetState();
  await useAppStore.persist.clearStorage();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('goal and tracking actions', () => {
  it('adds a goal with defaults and completes it when logged time reaches its estimate', () => {
    const activityTypeId = useAppStore.getState().activityTypes[0].id;
    const goalId = useAppStore.getState().addGoal({
      name: 'Finish revival slice',
      description: 'Cover the central persisted workflow',
      estimatedMinutes: 120,
      activityTypeId,
    });
    expect(goalId).not.toBeNull();

    expect(useAppStore.getState().goals).toContainEqual(expect.objectContaining({
      id: goalId,
      loggedMinutes: 0,
      priority: 3,
      status: 'active',
      createdAt: frozenTime,
      updatedAt: frozenTime,
    }));

    useAppStore.getState().logMinutesToGoal(goalId!, 30);
    expect(useAppStore.getState().goals[0]).toMatchObject({
      loggedMinutes: 30,
      status: 'active',
    });

    useAppStore.getState().logMinutesToGoal(goalId!, 90);
    expect(useAppStore.getState().goals[0]).toMatchObject({
      loggedMinutes: 120,
      status: 'completed',
      completedAt: frozenTime,
    });
  });

  it('starts and stops a timed entry and logs its rounded duration to the linked goal', () => {
    const activityTypeId = useAppStore.getState().activityTypes[0].id;
    const goalId = useAppStore.getState().addGoal({
      name: 'Focused session',
      description: 'Track a timed work session',
      estimatedMinutes: 180,
      activityTypeId,
    });
    expect(goalId).not.toBeNull();

    const entryId = useAppStore.getState().startTracking({
      activityTypeId,
      goalId: goalId!,
      source: 'manual',
    });
    expect(entryId).not.toBeNull();
    expect(useAppStore.getState().currentTrackingEntryId).toBe(entryId);
    expect(useAppStore.getState().trackingEntries[0]).toMatchObject({
      id: entryId,
      date: '2026-03-02',
      startTime: frozenTime,
      endTime: undefined,
      goalId: goalId!,
    });

    vi.advanceTimersByTime(90 * 60 * 1000);
    useAppStore.getState().stopTracking();

    expect(useAppStore.getState().currentTrackingEntryId).toBeNull();
    expect(useAppStore.getState().trackingEntries[0].endTime).toBe(
      '2026-03-02T10:30:00.000Z'
    );
    expect(useAppStore.getState().goals[0]).toMatchObject({
      loggedMinutes: 90,
      status: 'active',
    });
  });

  it('clamps a backwards-clock stop instead of persisting an entry hydration cannot read', () => {
    const activityTypeId = useAppStore.getState().activityTypes[0].id;
    const goalId = useAppStore.getState().addGoal({
      name: 'Session across an NTP resync',
      description: 'The device clock moves backwards mid-session',
      estimatedMinutes: 180,
      activityTypeId,
    });
    const entryId = useAppStore.getState().startTracking({
      activityTypeId,
      goalId: goalId!,
      source: 'manual',
    });
    expect(entryId).not.toBeNull();

    // The clock jumps back an hour between start and stop.
    vi.setSystemTime(new Date('2026-03-02T08:00:00.000Z'));
    useAppStore.getState().stopTracking();

    const entry = useAppStore.getState().trackingEntries[0];
    expect(entry.id).toBe(entryId);
    expect(entry.endTime).toBe(frozenTime);
    expect(Date.parse(entry.endTime!)).toBeGreaterThanOrEqual(Date.parse(entry.startTime));
    expect(useAppStore.getState().currentTrackingEntryId).toBeNull();
    // A bad clock must neither invent nor erase goal progress.
    expect(useAppStore.getState().goals[0].loggedMinutes).toBe(0);

    // The property that matters: what stopTracking just wrote has to survive the strict path
    // that every launch takes, or the next launch cannot open the app at all.
    expect(() => migratePersistedState(
      selectPersistedAppState(useAppStore.getState()),
      CURRENT_SCHEMA_VERSION
    )).not.toThrow();
  });
});

describe('routine block capacity timestamps', () => {
  function routineById(id: string) {
    return useAppStore.getState().routines.find((routine) => routine.id === id)!;
  }

  it('stamps only the activity types whose scheduled capacity changed', () => {
    const [untouched, edited] = useAppStore.getState().activityTypes;
    const routineId = useAppStore.getState().addRoutine('Week');

    useAppStore.getState().addRoutineBlock(routineId, {
      dayOfWeek: 1,
      startMinutes: 9 * 60,
      endMinutes: 10 * 60,
      activityTypeId: untouched.id,
    });
    vi.advanceTimersByTime(60_000);
    const editedBlockId = useAppStore.getState().addRoutineBlock(routineId, {
      dayOfWeek: 1,
      startMinutes: 18 * 60,
      endMinutes: 19 * 60,
      activityTypeId: edited.id,
    });
    expect(editedBlockId).not.toBeNull();
    expect(routineById(routineId).capacityChangedAt).toEqual({
      [untouched.id]: frozenTime,
      [edited.id]: '2026-03-02T09:01:00.000Z',
    });

    vi.advanceTimersByTime(60_000);
    useAppStore.getState().updateRoutineBlock(routineId, editedBlockId!, {
      endMinutes: 19 * 60 + 5,
    });

    // The whole routine's updatedAt still advances; the other activity type's
    // capacity timestamp must not, or its goals would lose their evidence.
    expect(routineById(routineId).updatedAt).toBe('2026-03-02T09:02:00.000Z');
    expect(routineById(routineId).capacityChangedAt).toEqual({
      [untouched.id]: frozenTime,
      [edited.id]: '2026-03-02T09:02:00.000Z',
    });

    vi.advanceTimersByTime(60_000);
    useAppStore.getState().deleteRoutineBlock(routineId, editedBlockId!);
    expect(routineById(routineId).capacityChangedAt).toEqual({
      [untouched.id]: frozenTime,
      [edited.id]: '2026-03-02T09:03:00.000Z',
    });
  });

  it('seeds activity types that predate the field with the routine\'s previous timestamp', () => {
    const [untouched, edited] = useAppStore.getState().activityTypes;
    const legacyUpdatedAt = '2026-02-01T00:00:00.000Z';
    useAppStore.setState({
      routines: [{
        id: 'legacy-routine',
        name: 'Legacy week',
        isActive: true,
        blocks: [
          {
            id: 'legacy-untouched',
            dayOfWeek: 1,
            startMinutes: 9 * 60,
            endMinutes: 10 * 60,
            activityTypeId: untouched.id,
          },
          {
            id: 'legacy-edited',
            dayOfWeek: 1,
            startMinutes: 18 * 60,
            endMinutes: 19 * 60,
            activityTypeId: edited.id,
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: legacyUpdatedAt,
      }],
      activeRoutineId: 'legacy-routine',
    });

    useAppStore.getState().updateRoutineBlock('legacy-routine', 'legacy-edited', {
      endMinutes: 19 * 60 + 5,
    });

    // Without seeding, the untouched activity type would fall through to the
    // bumped updatedAt and collapse anyway on the first edit after migration.
    expect(routineById('legacy-routine').capacityChangedAt).toEqual({
      [untouched.id]: legacyUpdatedAt,
      [edited.id]: frozenTime,
    });
  });

  describe('a save that changes nothing', () => {
    const editedBlockStart = 18 * 60;
    const editedBlockEnd = 19 * 60;

    /**
     * A routine with one block per activity type, the second one goal-linked --
     * the shape BlockEditor edits. Returns everything a caller needs to replay
     * a Save with the same values already on screen.
     */
    function seedRoutine() {
      const [untouched, edited] = useAppStore.getState().activityTypes;
      const routineId = useAppStore.getState().addRoutine('Week');
      const goalId = useAppStore.getState().addGoal({
        name: 'Run a 10k',
        description: 'A goal linked to the block under edit',
        estimatedMinutes: 600,
        activityTypeId: edited.id,
      });
      expect(goalId).not.toBeNull();

      useAppStore.getState().addRoutineBlock(routineId, {
        dayOfWeek: 1,
        startMinutes: 9 * 60,
        endMinutes: 10 * 60,
        activityTypeId: untouched.id,
      });
      vi.advanceTimersByTime(60_000);
      const blockId = useAppStore.getState().addRoutineBlock(routineId, {
        dayOfWeek: 1,
        startMinutes: editedBlockStart,
        endMinutes: editedBlockEnd,
        activityTypeId: edited.id,
        goalId: goalId!,
      });
      expect(blockId).not.toBeNull();

      return { untouched, edited, routineId, goalId: goalId!, blockId: blockId! };
    }

    it('leaves every capacity timestamp, the routine, and the block untouched', () => {
      const { untouched, edited, routineId, goalId, blockId } = seedRoutine();
      const before = routineById(routineId);
      const capacityBefore = { ...before.capacityChangedAt };
      expect(capacityBefore).toEqual({
        [untouched.id]: frozenTime,
        [edited.id]: '2026-03-02T09:01:00.000Z',
      });

      vi.advanceTimersByTime(60_000);
      // Exactly what BlockEditor sends when the user opens a block to look at
      // it and taps Save: every field, all of them the values already stored.
      useAppStore.getState().updateRoutineBlock(routineId, blockId, {
        startMinutes: editedBlockStart,
        endMinutes: editedBlockEnd,
        activityTypeId: edited.id,
        goalId,
      });

      const after = routineById(routineId);
      // The headline of #7: no capacity moved, so no goal may lose its evidence.
      expect(after.capacityChangedAt).toEqual(capacityBefore);
      expect(after.updatedAt).toBe(before.updatedAt);
      expect(after.blocks).toEqual(before.blocks);
    });

    it('still stamps when only the goal link is cleared', () => {
      const { untouched, edited, routineId, blockId } = seedRoutine();

      vi.advanceTimersByTime(60_000);
      // A goal link moves that time between the dedicated and the shared pool,
      // so the forecast really does change even though the hours do not.
      useAppStore.getState().updateRoutineBlock(routineId, blockId, {
        startMinutes: editedBlockStart,
        endMinutes: editedBlockEnd,
        activityTypeId: edited.id,
        goalId: undefined,
      });

      expect(routineById(routineId).capacityChangedAt).toEqual({
        [untouched.id]: frozenTime,
        [edited.id]: '2026-03-02T09:02:00.000Z',
      });
      expect(
        routineById(routineId).blocks.find((block) => block.id === blockId)!.goalId
      ).toBeUndefined();
    });

    it('still stamps when the block moves to another day', () => {
      const { untouched, edited, routineId, blockId } = seedRoutine();

      vi.advanceTimersByTime(60_000);
      useAppStore.getState().updateRoutineBlock(routineId, blockId, { dayOfWeek: 2 });

      expect(routineById(routineId).capacityChangedAt).toEqual({
        [untouched.id]: frozenTime,
        [edited.id]: '2026-03-02T09:02:00.000Z',
      });
    });

    it('still stamps both the old and the new activity type when the type changes', () => {
      const { untouched, edited, routineId, blockId } = seedRoutine();

      vi.advanceTimersByTime(60_000);
      // The goal belongs to `edited`, so it has to be released with the type.
      useAppStore.getState().updateRoutineBlock(routineId, blockId, {
        activityTypeId: untouched.id,
        goalId: undefined,
      });

      expect(routineById(routineId).capacityChangedAt).toEqual({
        [untouched.id]: '2026-03-02T09:02:00.000Z',
        [edited.id]: '2026-03-02T09:02:00.000Z',
      });
    });
  });
});

describe('persisted state', () => {
  it('rehydrates application data from the configured AsyncStorage key', async () => {
    const activityType = useAppStore.getState().activityTypes[0];
    const persistedGoal: Goal = {
      id: 'persisted-goal',
      name: 'Resume safely',
      description: 'Prove data can be restored',
      estimatedMinutes: 240,
      loggedMinutes: 45,
      activityTypeId: activityType.id,
      status: 'active',
      priority: 2,
      createdAt: frozenTime,
      updatedAt: frozenTime,
    };
    const persistedState: AppState = {
      activityTypes: [activityType],
      goals: [persistedGoal],
      routines: [],
      trackingEntries: [],
      activeRoutineId: null,
      currentTrackingEntryId: null,
      hasCompletedOnboarding: true,
      schemaVersion: 3,
    };

    useAppStore.setState({ goals: [], hasCompletedOnboarding: false });
    await AsyncStorage.setItem(storageKey, JSON.stringify({
      state: persistedState,
      version: 3,
    }));
    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState()).toMatchObject({
      goals: [persistedGoal],
      hasCompletedOnboarding: true,
      schemaVersion: 4,
    });
    expect(await AsyncStorage.getItem(storageKey)).not.toBeNull();
  });

  it('preserves per-activity capacity timestamps through a rehydrate', async () => {
    const activityType = useAppStore.getState().activityTypes[0];
    const capacityChangedAt = { [activityType.id]: '2026-02-01T00:00:00.000Z' };
    const persistedState: AppState = {
      activityTypes: [activityType],
      goals: [],
      routines: [{
        id: 'persisted-routine',
        name: 'Persisted week',
        isActive: true,
        blocks: [{
          id: 'persisted-block',
          dayOfWeek: 1,
          startMinutes: 9 * 60,
          endMinutes: 10 * 60,
          activityTypeId: activityType.id,
        }],
        capacityChangedAt,
        createdAt: frozenTime,
        updatedAt: frozenTime,
      }],
      trackingEntries: [],
      activeRoutineId: 'persisted-routine',
      currentTrackingEntryId: null,
      hasCompletedOnboarding: true,
      schemaVersion: 4,
    };

    await AsyncStorage.setItem(storageKey, JSON.stringify({
      state: persistedState,
      version: 4,
    }));
    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState().routines[0].capacityChangedAt).toEqual(capacityChangedAt);
  });

  it('drops malformed capacity timestamps instead of failing hydration', async () => {
    const activityType = useAppStore.getState().activityTypes[0];
    const persistedState = {
      activityTypes: [activityType],
      goals: [],
      routines: [{
        id: 'corrupt-routine',
        name: 'Corrupt week',
        isActive: true,
        blocks: [],
        capacityChangedAt: { [activityType.id]: 'not-a-timestamp' },
        createdAt: frozenTime,
        updatedAt: frozenTime,
      }],
      trackingEntries: [],
      activeRoutineId: 'corrupt-routine',
      currentTrackingEntryId: null,
      hasCompletedOnboarding: true,
      schemaVersion: 4,
    };

    await AsyncStorage.setItem(storageKey, JSON.stringify({
      state: persistedState,
      version: 4,
    }));
    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState().routines[0].id).toBe('corrupt-routine');
    expect(useAppStore.getState().routines[0].capacityChangedAt).toBeUndefined();
  });
});
