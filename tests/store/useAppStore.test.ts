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
});
