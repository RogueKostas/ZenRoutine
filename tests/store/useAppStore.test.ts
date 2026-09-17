import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppState, Goal, RoutineBlock } from '../../src/core/types';
import { getCapacityChangedAt } from '../../src/core/engine/prediction';
import { useAppStore } from '../../src/store/useAppStore';
import {
  CURRENT_SCHEMA_VERSION,
  migratePersistedState,
  selectPersistedAppState,
} from '../../src/store/persistence';

/** A stored goal before v7 replaced `priority` with `order` (#49). */
type PreV7Goal = Omit<Goal, 'order'> & { priority: 1 | 2 | 3 | 4 | 5 };

/** The stored shape before v5 added `preferences` (#44). */
type PreV5AppState = Omit<AppState, 'preferences' | 'goals'> & { goals: PreV7Goal[] };

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
      order: 0,
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
     * A routine with one block per activity type, the second one with a goal
     * of its type in the store -- the shape BlockEditor edits. Returns
     * everything a caller needs to replay a Save with the same values already
     * on screen.
     */
    function seedRoutine() {
      const [untouched, edited] = useAppStore.getState().activityTypes;
      const routineId = useAppStore.getState().addRoutine('Week');
      const goalId = useAppStore.getState().addGoal({
        name: 'Run a 10k',
        description: 'A goal of the block under edit\'s type',
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
      });
      expect(blockId).not.toBeNull();

      return { untouched, edited, routineId, goalId: goalId!, blockId: blockId! };
    }

    it('leaves every capacity timestamp, the routine, and the block untouched', () => {
      const { untouched, edited, routineId, blockId } = seedRoutine();
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
      });

      const after = routineById(routineId);
      // The headline of #7: no capacity moved, so no goal may lose its evidence.
      expect(after.capacityChangedAt).toEqual(capacityBefore);
      expect(after.updatedAt).toBe(before.updatedAt);
      expect(after.blocks).toEqual(before.blocks);
    });

    it('drops a goalId a caller still sends, writing nothing for it (#60)', () => {
      const { edited, routineId, goalId, blockId } = seedRoutine();
      const before = routineById(routineId);

      vi.advanceTimersByTime(60_000);
      // What an out-of-date caller would send: the old BlockEditor's full
      // payload, goal link included. A block cannot hold it, so it is neither
      // stored nor counted as a change -- no stamp, no new updatedAt.
      const stale = {
        startMinutes: editedBlockStart,
        endMinutes: editedBlockEnd,
        activityTypeId: edited.id,
        goalId,
      } as Partial<Omit<RoutineBlock, 'id'>>;
      useAppStore.getState().updateRoutineBlock(routineId, blockId, stale);

      const after = routineById(routineId);
      expect(after).toEqual(before);
      expect(after.blocks.find((block) => block.id === blockId)).not.toHaveProperty('goalId');
    });

    it('drops a goalId a caller sends with a new block', () => {
      const { edited, routineId, goalId } = seedRoutine();

      const newBlock = {
        dayOfWeek: 3,
        startMinutes: editedBlockStart,
        endMinutes: editedBlockEnd,
        activityTypeId: edited.id,
        goalId,
      } as Omit<RoutineBlock, 'id'>;
      const blockId = useAppStore.getState().addRoutineBlock(routineId, newBlock);

      expect(blockId).not.toBeNull();
      expect(routineById(routineId).blocks.find((block) => block.id === blockId)).toEqual({
        id: blockId,
        dayOfWeek: 3,
        startMinutes: editedBlockStart,
        endMinutes: editedBlockEnd,
        activityTypeId: edited.id,
      });
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
      useAppStore.getState().updateRoutineBlock(routineId, blockId, {
        activityTypeId: untouched.id,
      });

      expect(routineById(routineId).capacityChangedAt).toEqual({
        [untouched.id]: '2026-03-02T09:02:00.000Z',
        [edited.id]: '2026-03-02T09:02:00.000Z',
      });
    });
  });
});

describe('routine-level capacity timestamps', () => {
  function routineById(id: string) {
    return useAppStore.getState().routines.find((routine) => routine.id === id)!;
  }

  function addBlock(routineId: string, activityTypeId: string, dayOfWeek: 0 | 1 | 2, endHour: number) {
    return useAppStore.getState().addRoutineBlock(routineId, {
      dayOfWeek,
      startMinutes: 9 * 60,
      endMinutes: endHour * 60,
      activityTypeId,
    });
  }

  /** A routine saved before `capacityChangedAt` existed: blocks, but no map. */
  function legacyRoutine(id: string, activityTypeId: string, updatedAt: string) {
    return {
      id,
      name: `Routine ${id}`,
      isActive: false,
      blocks: [{
        id: `${id}-block`,
        dayOfWeek: 1 as const,
        startMinutes: 9 * 60,
        endMinutes: 10 * 60,
        activityTypeId,
      }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt,
    };
  }

  describe('setActiveRoutine', () => {
    it('leaves every routine that is not changing hands untouched', () => {
      const [work] = useAppStore.getState().activityTypes;
      const bystanderId = useAppStore.getState().addRoutine('Bystander');
      addBlock(bystanderId, work.id, 1, 10);
      const targetId = useAppStore.getState().addRoutine('Vacation');
      const bystanderBefore = routineById(bystanderId);

      vi.advanceTimersByTime(60_000);
      useAppStore.getState().setActiveRoutine(targetId);

      // Object identity, not just equality: the old code rebuilt every routine
      // in the list with a fresh `updatedAt`, whether or not `isActive` moved.
      expect(routineById(bystanderId)).toBe(bystanderBefore);
      expect(routineById(bystanderId).updatedAt).toBe(frozenTime);
    });

    it('seeds the routine being switched away from instead of collapsing it', () => {
      const [work] = useAppStore.getState().activityTypes;
      const legacyUpdatedAt = '2026-02-01T00:00:00.000Z';
      useAppStore.setState({
        routines: [
          { ...legacyRoutine('outgoing', work.id, legacyUpdatedAt), isActive: true },
          legacyRoutine('incoming', work.id, legacyUpdatedAt),
        ],
        activeRoutineId: 'outgoing',
      });

      useAppStore.getState().setActiveRoutine('incoming');

      // `isActive` really did change, so `updatedAt` really does move -- but no
      // block of the outgoing routine moved, so the cutoff a forecast reads
      // must not follow it. This is issue #7 with no block ever touched.
      expect(routineById('outgoing').updatedAt).toBe(frozenTime);
      expect(getCapacityChangedAt(routineById('outgoing'), work.id)).toBe(legacyUpdatedAt);
    });

    it('stamps only the activity types whose schedule differs from the one going out', () => {
      const [shared, differing] = useAppStore.getState().activityTypes;
      const fromId = useAppStore.getState().addRoutine('From');
      const toId = useAppStore.getState().addRoutine('To');
      // Identical `shared` schedules; `differing` runs an hour longer in `to`.
      addBlock(fromId, shared.id, 1, 10);
      addBlock(toId, shared.id, 1, 10);
      addBlock(fromId, differing.id, 2, 11);
      addBlock(toId, differing.id, 2, 12);
      useAppStore.getState().setActiveRoutine(fromId);

      vi.advanceTimersByTime(60_000);
      useAppStore.getState().setActiveRoutine(toId);

      // Switching between two routines that schedule an activity type the same
      // way must leave its evidence alone, exactly as re-saving an unchanged
      // block does. The one that genuinely moved resets.
      expect(getCapacityChangedAt(routineById(toId), shared.id)).toBe(frozenTime);
      expect(getCapacityChangedAt(routineById(toId), differing.id))
        .toBe('2026-03-02T09:01:00.000Z');
    });

    it('stamps an activity type the routine going out did not schedule at all', () => {
      const [carried, appearing] = useAppStore.getState().activityTypes;
      const fromId = useAppStore.getState().addRoutine('From');
      const toId = useAppStore.getState().addRoutine('To');
      addBlock(fromId, carried.id, 1, 10);
      addBlock(toId, carried.id, 1, 10);
      addBlock(toId, appearing.id, 2, 11);
      useAppStore.getState().setActiveRoutine(fromId);

      vi.advanceTimersByTime(60_000);
      useAppStore.getState().setActiveRoutine(toId);

      // Nothing was scheduled for `appearing` a moment ago, so its capacity
      // moved from zero and its evidence starts here.
      expect(getCapacityChangedAt(routineById(toId), appearing.id))
        .toBe('2026-03-02T09:01:00.000Z');
      expect(getCapacityChangedAt(routineById(toId), carried.id)).toBe(frozenTime);
    });

    it('writes nothing when the already-active routine is activated again', () => {
      const [work] = useAppStore.getState().activityTypes;
      const routineId = useAppStore.getState().addRoutine('Week');
      addBlock(routineId, work.id, 1, 10);
      useAppStore.getState().setActiveRoutine(routineId);
      const before = routineById(routineId);

      vi.advanceTimersByTime(60_000);
      useAppStore.getState().setActiveRoutine(routineId);

      expect(routineById(routineId)).toBe(before);
      expect(useAppStore.getState().activeRoutineId).toBe(routineId);
    });
  });

  describe('updateRoutine', () => {
    it('renames without moving any capacity cutoff', () => {
      const [work] = useAppStore.getState().activityTypes;
      const legacyUpdatedAt = '2026-02-01T00:00:00.000Z';
      useAppStore.setState({
        routines: [{ ...legacyRoutine('legacy', work.id, legacyUpdatedAt), isActive: true }],
        activeRoutineId: 'legacy',
      });

      useAppStore.getState().updateRoutine('legacy', { name: 'Renamed' });

      expect(routineById('legacy').name).toBe('Renamed');
      expect(routineById('legacy').updatedAt).toBe(frozenTime);
      // A rename is not a capacity change, so no goal may lose its evidence.
      expect(getCapacityChangedAt(routineById('legacy'), work.id)).toBe(legacyUpdatedAt);
    });

    it('writes nothing when the name is already the name', () => {
      const [work] = useAppStore.getState().activityTypes;
      const routineId = useAppStore.getState().addRoutine('Week');
      addBlock(routineId, work.id, 1, 10);
      const before = routineById(routineId);

      vi.advanceTimersByTime(60_000);
      useAppStore.getState().updateRoutine(routineId, { name: 'Week' });

      expect(routineById(routineId)).toBe(before);
    });

    it('cannot be used to clobber the capacity map or the active flag', () => {
      const [work] = useAppStore.getState().activityTypes;
      const routineId = useAppStore.getState().addRoutine('Week');
      addBlock(routineId, work.id, 1, 10);
      useAppStore.getState().setActiveRoutine(routineId);
      const before = routineById(routineId);

      useAppStore.getState().updateRoutine(routineId, {
        // @ts-expect-error capacity is written only by the block mutations, which stamp as they go.
        capacityChangedAt: { [work.id]: '2030-01-01T00:00:00.000Z' },
      });
      useAppStore.getState().updateRoutine(routineId, {
        // @ts-expect-error `isActive` has a companion, `activeRoutineId`, that only setActiveRoutine maintains.
        isActive: false,
      });
      useAppStore.getState().updateRoutine(routineId, { name: 'Renamed' });

      expect(routineById(routineId).name).toBe('Renamed');
      expect(routineById(routineId).capacityChangedAt).toEqual(before.capacityChangedAt);
      expect(routineById(routineId).isActive).toBe(true);
      expect(useAppStore.getState().activeRoutineId).toBe(routineId);
    });
  });

  describe('duplicateRoutine', () => {
    it('carries the source routine\'s capacity timestamps into the copy', () => {
      const [work, fitness] = useAppStore.getState().activityTypes;
      const sourceId = useAppStore.getState().addRoutine('Source');
      addBlock(sourceId, work.id, 1, 10);
      vi.advanceTimersByTime(60_000);
      addBlock(sourceId, fitness.id, 2, 11);
      const sourceMap = { ...routineById(sourceId).capacityChangedAt };
      expect(sourceMap).toEqual({
        [work.id]: frozenTime,
        [fitness.id]: '2026-03-02T09:01:00.000Z',
      });

      vi.advanceTimersByTime(60_000);
      const copyId = useAppStore.getState().duplicateRoutine(sourceId, 'Copy');
      expect(copyId).not.toBeNull();

      // The copy has the source's schedule, so it has the source's evidence.
      expect(routineById(copyId!).capacityChangedAt).toEqual(sourceMap);
      expect(routineById(copyId!).updatedAt).toBe('2026-03-02T09:02:00.000Z');
    });

    it('pins an activity type the source never stamped to the source\'s timestamp', () => {
      const [work] = useAppStore.getState().activityTypes;
      const legacyUpdatedAt = '2026-02-01T00:00:00.000Z';
      useAppStore.setState({
        routines: [{ ...legacyRoutine('legacy', work.id, legacyUpdatedAt), isActive: true }],
        activeRoutineId: 'legacy',
      });

      const copyId = useAppStore.getState().duplicateRoutine('legacy', 'Copy');
      expect(copyId).not.toBeNull();

      // Without seeding, the copy's fresh `updatedAt` becomes the cutoff and
      // the copy is born with no evidence for a schedule it did not change.
      expect(getCapacityChangedAt(routineById(copyId!), work.id)).toBe(legacyUpdatedAt);
    });
  });
});

describe('persisted state', () => {
  it('rehydrates application data from the configured AsyncStorage key', async () => {
    const activityType = useAppStore.getState().activityTypes[0];
    const persistedGoal: PreV7Goal = {
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
    const persistedState: PreV5AppState = {
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

    const { priority: _priority, ...restoredGoal } = persistedGoal;
    expect(useAppStore.getState().goals).toEqual([{ ...restoredGoal, order: 0 }]);
    expect(useAppStore.getState()).toMatchObject({
      hasCompletedOnboarding: true,
      preferences: { weekStartsOn: 1 },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    expect(await AsyncStorage.getItem(storageKey)).not.toBeNull();
  });

  it('preserves per-activity capacity timestamps through a rehydrate', async () => {
    const activityType = useAppStore.getState().activityTypes[0];
    const capacityChangedAt = { [activityType.id]: '2026-02-01T00:00:00.000Z' };
    const persistedState: PreV5AppState = {
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
