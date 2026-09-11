import { describe, expect, it } from 'vitest';

import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  CURRENT_SCHEMA_VERSION,
  decodeBackup,
  encodeBackup,
  migratePersistedState,
  selectPersistedAppState,
} from '../../src/store/persistence';
import {
  TEST_TIMESTAMP,
  makeActivityType,
  makeAppState,
  makeGoal,
  makeRoutine,
  makeRoutineBlock,
  makeTrackingEntry,
} from '../helpers/builders';

function makeLegacyState() {
  const activity = { ...makeActivityType(), icon: 'briefcase' };
  const goal = makeGoal();
  const { priority: _priority, ...goalWithoutPriority } = goal;
  return {
    activityTypes: [activity],
    goals: [goalWithoutPriority],
    routines: [makeRoutine({ blocks: [makeRoutineBlock()] })],
    trackingEntries: [makeTrackingEntry({ goalId: goal.id })],
    activeRoutineId: 'routine-main',
    currentTrackingEntryId: null,
    schemaVersion: 1,
  };
}

describe('persisted-state migrations', () => {
  it('migrates legacy icons, priority, and onboarding through schema 4', () => {
    const legacy = makeLegacyState();
    const original = structuredClone(legacy);

    const migrated = migratePersistedState(legacy, 1);

    expect(migrated).toMatchObject({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      hasCompletedOnboarding: false,
      activeRoutineId: 'routine-main',
    });
    expect(migrated.activityTypes[0].icon).toBe('💼');
    expect(migrated.goals[0].priority).toBe(3);
    expect(legacy).toEqual(original);
    expect(migratePersistedState(migrated, CURRENT_SCHEMA_VERSION)).toEqual(migrated);
  });

  it('repairs legacy negative progress and invalid current pointers without losing history', () => {
    const legacy = {
      ...makeAppState({
        goals: [makeGoal({ loggedMinutes: -15 })],
        trackingEntries: [makeTrackingEntry()],
      }),
      currentTrackingEntryId: 'entry-focus',
    };
    delete (legacy as Partial<typeof legacy>).hasCompletedOnboarding;

    const migrated = migratePersistedState(legacy, 3);

    expect(migrated.goals[0].loggedMinutes).toBe(0);
    expect(migrated.currentTrackingEntryId).toBeNull();
    expect(migrated.trackingEntries).toHaveLength(1);
  });

  it('repairs schema-3 values that the old public actions could persist', () => {
    const legacy = makeAppState({
      goals: [makeGoal({ estimatedMinutes: 0 })],
      routines: [makeRoutine({
        blocks: [makeRoutineBlock({ goalId: 'missing-goal' })],
      })],
      trackingEntries: [makeTrackingEntry({
        goalId: 'missing-goal',
        routineBlockId: 'missing-block',
      })],
    });
    delete (legacy as Partial<typeof legacy>).hasCompletedOnboarding;

    const migrated = migratePersistedState(legacy, 3);

    expect(migrated.goals[0].estimatedMinutes).toBe(1);
    expect(migrated.routines[0].blocks[0].goalId).toBeUndefined();
    expect(migrated.trackingEntries[0].goalId).toBeUndefined();
    expect(migrated.trackingEntries[0].routineBlockId).toBeUndefined();
  });

  it('repairs multiple legacy open entries to one resumable timer', () => {
    const openA = makeTrackingEntry({ id: 'open-a', endTime: undefined });
    const openB = makeTrackingEntry({
      id: 'open-b',
      startTime: '2026-03-02T11:00:00.000Z',
      endTime: undefined,
    });
    const legacy = makeAppState({
      trackingEntries: [openA, openB],
      currentTrackingEntryId: 'open-a',
    });
    delete (legacy as Partial<typeof legacy>).hasCompletedOnboarding;

    const migrated = migratePersistedState(legacy, 3);

    expect(migrated.currentTrackingEntryId).toBe('open-a');
    expect(migrated.trackingEntries.filter((entry) => !entry.endTime)).toEqual([
      expect.objectContaining({ id: 'open-a' }),
    ]);
    expect(migrated.trackingEntries.find((entry) => entry.id === 'open-b')?.endTime)
      .toBe(openB.startTime);
  });

  it.each([-1, 1.5, Number.NaN, CURRENT_SCHEMA_VERSION + 1])(
    'rejects unsupported schema version %s',
    (version) => {
      expect(() => migratePersistedState(makeAppState(), version)).toThrow(
        'Unsupported ZenRoutine schema version'
      );
    }
  );

  it('rejects malformed current data rather than partially accepting it', () => {
    expect(() => migratePersistedState({ ...makeAppState(), goals: 'nope' }, 4)).toThrow(
      'Invalid goals'
    );
    expect(() => migratePersistedState({
      ...makeAppState(),
      routines: [makeRoutine({ blocks: [makeRoutineBlock({ startMinutes: 900, endMinutes: 900 })] })],
    }, 4)).toThrow('start and end must differ');
    expect(() => migratePersistedState({
      ...makeAppState(),
      trackingEntries: [makeTrackingEntry({ date: '2026-02-30' })],
    }, 4)).toThrow('real calendar date');
    expect(() => migratePersistedState({
      ...makeAppState(),
      currentTrackingEntryId: 'missing-entry',
    }, 4)).toThrow('currentTrackingEntryId');
    expect(() => migratePersistedState({
      ...makeAppState(),
      trackingEntries: [makeTrackingEntry({ endTime: undefined })],
      currentTrackingEntryId: null,
    }, 4)).toThrow('currentTrackingEntryId');
    expect(() => migratePersistedState({
      ...makeAppState(),
      trackingEntries: [makeTrackingEntry({ routineBlockId: 'missing-block' })],
    }, 4)).toThrow('routineBlockId');
  });
});

describe('backup codec', () => {
  it('round-trips a complete current snapshot including Unicode and optional fields', () => {
    const state = makeAppState({
      goals: [makeGoal({ name: 'Write 日本語 notes', description: '🧘 Calm focus' })],
      trackingEntries: [makeTrackingEntry({ notes: 'Crème brûlée', goalId: 'goal-focus' })],
      lastSyncedAt: TEST_TIMESTAMP,
    });

    const serialized = encodeBackup(state, TEST_TIMESTAMP);
    const envelope = JSON.parse(serialized) as Record<string, unknown>;

    expect(envelope).toMatchObject({
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: TEST_TIMESTAMP,
    });
    expect(decodeBackup(serialized)).toEqual(selectPersistedAppState(state));
  });

  it('decodes a legacy backup through migrations', () => {
    const serialized = JSON.stringify({
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: 1,
      exportedAt: TEST_TIMESTAMP,
      state: makeLegacyState(),
    });

    expect(decodeBackup(serialized)).toMatchObject({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      hasCompletedOnboarding: false,
      goals: [expect.objectContaining({ priority: 3 })],
    });
  });

  it.each([
    ['not JSON', '{'],
    ['wrong format', JSON.stringify({ format: 'other', formatVersion: 1 })],
    ['future format', JSON.stringify({ format: BACKUP_FORMAT, formatVersion: 2 })],
    ['future schema', JSON.stringify({
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      exportedAt: TEST_TIMESTAMP,
      state: makeAppState(),
    })],
  ])('rejects %s', (_label, serialized) => {
    expect(() => decodeBackup(serialized)).toThrow();
  });
});
