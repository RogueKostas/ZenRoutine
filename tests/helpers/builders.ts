import { expect } from 'vitest';

import type {
  ActivityType,
  AppState,
  Goal,
  Routine,
  RoutineBlock,
  TrackingEntry,
} from '../../src/core/types';
import { CURRENT_SCHEMA_VERSION } from '../../src/store/persistence';

export const TEST_TIMESTAMP = '2026-03-02T09:00:00.000Z';

export function makeActivityType(
  overrides: Partial<ActivityType> = {}
): ActivityType {
  return {
    id: 'activity-focus',
    name: 'Focus',
    color: '#336699',
    icon: '🎯',
    isDefault: false,
    sortOrder: 0,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    ...overrides,
  };
}

export function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-focus',
    name: 'Focused outcome',
    description: 'A deterministic test goal',
    estimatedMinutes: 120,
    loggedMinutes: 0,
    activityTypeId: 'activity-focus',
    status: 'active',
    order: 0,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    ...overrides,
  };
}

/** A goal as a store before v7 (#49) held it: a 1–5 `priority` and no `order`. */
export function makeLegacyGoal(
  overrides: Partial<Omit<Goal, 'order'>> & { priority?: number } = {}
): Omit<Goal, 'order'> & { priority: number } {
  const { order: _order, ...goal } = makeGoal();
  return { ...goal, priority: 3, ...overrides };
}

/**
 * A stored pre-v7 state as the v7 store holds it (#49): goals rearranged into the list order
 * `ids` gives, each with `order` in place of `priority`, and nothing else changed.
 */
export function withListOrder<S extends Record<string, unknown>>(
  state: S,
  ids: readonly string[]
): S {
  const goals = (state.goals as Record<string, unknown>[])
    .map(({ priority: _priority, ...goal }) => goal);
  expect(goals.map((goal) => goal.id).sort()).toEqual([...ids].sort());
  return {
    ...state,
    goals: ids.map((id, order) => ({ ...goals.find((goal) => goal.id === id), order })),
  };
}

export function makeRoutineBlock(
  overrides: Partial<RoutineBlock> = {}
): RoutineBlock {
  return {
    id: 'block-focus',
    dayOfWeek: 1,
    startMinutes: 9 * 60,
    endMinutes: 10 * 60,
    activityTypeId: 'activity-focus',
    ...overrides,
  };
}

export function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 'routine-main',
    name: 'Main week',
    isActive: true,
    blocks: [],
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    ...overrides,
  };
}

export function makeTrackingEntry(
  overrides: Partial<TrackingEntry> = {}
): TrackingEntry {
  return {
    id: 'entry-focus',
    date: '2026-03-02',
    startTime: TEST_TIMESTAMP,
    endTime: '2026-03-02T10:00:00.000Z',
    activityTypeId: 'activity-focus',
    source: 'manual',
    createdAt: TEST_TIMESTAMP,
    updatedAt: '2026-03-02T10:00:00.000Z',
    ...overrides,
  };
}

export function makeAppState(overrides: Partial<AppState> = {}): AppState {
  const activityType = makeActivityType();
  const routine = makeRoutine();
  return {
    activityTypes: [activityType],
    goals: [],
    routines: [routine],
    trackingEntries: [],
    activeRoutineId: routine.id,
    currentTrackingEntryId: null,
    hasCompletedOnboarding: true,
    preferences: { weekStartsOn: 1 },
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...overrides,
  };
}
