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
    priority: 3,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    ...overrides,
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
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...overrides,
  };
}
