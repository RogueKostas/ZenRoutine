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
import type { QuarantinedTrackingEntry } from '../../src/store/persistence';
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

  it('quarantines an unreadable tracking entry only when a sink is supplied', () => {
    const corrupt = makeTrackingEntry({
      id: 'entry-corrupt',
      endTime: '2026-03-02T08:00:00.000Z',
    });
    const state = makeAppState({
      goals: [makeGoal()],
      trackingEntries: [makeTrackingEntry({ id: 'entry-good' }), corrupt],
    });

    // Without a sink the behaviour is unchanged: strict, all-or-nothing.
    expect(() => migratePersistedState(state, CURRENT_SCHEMA_VERSION)).toThrow(
      'endTime is before startTime'
    );

    const quarantine: QuarantinedTrackingEntry[] = [];
    const migrated = migratePersistedState(state, CURRENT_SCHEMA_VERSION, { quarantine });

    expect(migrated.trackingEntries.map((entry) => entry.id)).toEqual(['entry-good']);
    expect(migrated.goals.map((goal) => goal.id)).toEqual(['goal-focus']);
    expect(quarantine).toEqual([{
      index: 1,
      id: 'entry-corrupt',
      reason: 'Invalid tracking entry: endTime is before startTime',
      record: corrupt,
    }]);
  });

  it('still rejects blob-level corruption even with a quarantine sink', () => {
    expect(() => migratePersistedState(
      { ...makeAppState(), trackingEntries: 'nope' },
      CURRENT_SCHEMA_VERSION,
      { quarantine: [] }
    )).toThrow('Invalid trackingEntries');
    expect(() => migratePersistedState(
      { ...makeAppState(), goals: [makeGoal({ activityTypeId: 'missing-activity' })] },
      CURRENT_SCHEMA_VERSION,
      { quarantine: [] }
    )).toThrow('Invalid goals');
  });

  it('clears a dangling timer pointer when the open entry it names had an unreadable id', () => {
    // The quarantined record cannot be matched against the pointer by id, because its own id is
    // the field that failed to parse and it is quarantined as `id: null`. The pointer therefore
    // has to be cleared by asking whether it still resolves, not by searching the dropped list.
    const quarantine: QuarantinedTrackingEntry[] = [];
    const migrated = migratePersistedState(
      {
        ...makeAppState(),
        trackingEntries: [{ ...makeTrackingEntry({ endTime: undefined }), id: 99 }],
        currentTrackingEntryId: 'entry-focus',
      },
      CURRENT_SCHEMA_VERSION,
      { quarantine }
    );

    expect(migrated.trackingEntries).toEqual([]);
    expect(migrated.currentTrackingEntryId).toBeNull();
    expect(quarantine).toEqual([
      expect.objectContaining({ index: 0, id: null, reason: 'Invalid id: expected a string' }),
    ]);
  });

  it('clears a dangling timer pointer when the quarantined record is the one it names', () => {
    // The running timer's own record is unreadable for a reason other than its id, so it is
    // dropped with its id intact. That id is what makes it answerable for the dangling pointer.
    const quarantine: QuarantinedTrackingEntry[] = [];
    const migrated = migratePersistedState(
      {
        ...makeAppState(),
        trackingEntries: [
          makeTrackingEntry({ id: 'entry-good' }),
          { ...makeTrackingEntry({ id: 'entry-running', endTime: undefined }), source: 'bogus' },
        ],
        currentTrackingEntryId: 'entry-running',
      },
      CURRENT_SCHEMA_VERSION,
      { quarantine }
    );

    expect(migrated.trackingEntries.map((entry) => entry.id)).toEqual(['entry-good']);
    expect(migrated.currentTrackingEntryId).toBeNull();
    expect(quarantine).toEqual([
      expect.objectContaining({ index: 1, id: 'entry-running' }),
    ]);
  });

  it('keeps the dangling-pointer check strict when the quarantined record is unrelated', () => {
    // Something was quarantined, but it is a different, readable-id entry that has nothing to do
    // with where the pointer points. An unrelated dangling pointer is still real corruption, and
    // an unrelated bad record must not buy it a silent clear.
    const quarantine: QuarantinedTrackingEntry[] = [];

    expect(() => migratePersistedState(
      {
        ...makeAppState(),
        trackingEntries: [
          makeTrackingEntry({ id: 'entry-good' }),
          { ...makeTrackingEntry({ id: 'entry-unrelated' }), source: 'bogus' },
        ],
        currentTrackingEntryId: 'entry-that-never-existed',
      },
      CURRENT_SCHEMA_VERSION,
      { quarantine }
    )).toThrow('Invalid currentTrackingEntryId');
    expect(quarantine).toEqual([
      expect.objectContaining({ index: 1, id: 'entry-unrelated' }),
    ]);
  });

  it('does not let an earlier stage\'s dropped record excuse this stage\'s dangling pointer', () => {
    // One hydration attempt shares a single sink across persist's `migrate` and `merge` stages,
    // and it is reset per attempt rather than per stage. An id-less drop is the wildcard that
    // excuses any pointer, so a `migrate`-stage drop must not answer for a `merge`-stage pointer:
    // the two stages are looking at different data.
    const quarantine: QuarantinedTrackingEntry[] = [
      { index: 0, id: null, reason: 'Invalid id: expected a string', record: { id: 99 } },
    ];

    expect(() => migratePersistedState(
      { ...makeAppState(), currentTrackingEntryId: 'entry-that-never-existed' },
      CURRENT_SCHEMA_VERSION,
      { quarantine }
    )).toThrow('Invalid currentTrackingEntryId');
    // Scoped by reading, not by clearing: the accumulated report the user is shown survives.
    expect(quarantine).toHaveLength(1);
  });

  it('keeps the dangling-pointer check strict when nothing was quarantined', () => {
    // A pointer that resolves to nothing with no bad record to blame is real corruption, and the
    // quarantine sink being present must not soften that.
    expect(() => migratePersistedState(
      { ...makeAppState(), currentTrackingEntryId: 'entry-that-never-existed' },
      CURRENT_SCHEMA_VERSION,
      { quarantine: [] }
    )).toThrow('Invalid currentTrackingEntryId');
  });
});

describe('stale reference linkage', () => {
  // Each of these entries parses perfectly — valid dates, valid source, readable id. What is
  // wrong is the store around it: the record it points at is no longer in the blob, the shape a
  // torn write during a delete, a hand-edited blob or a bad restore leaves behind. Throwing on
  // that bricks every future launch and leaves the destructive reset as the only exit.

  it('quarantines an entry whose activity type went missing, at every version', () => {
    // activityTypeId is required on a TrackingEntry, so unlike its two siblings there is no
    // clearing it on a legacy blob. Quarantining is the repair, which is why this one behaves
    // the same either side of the version gate.
    const orphan = makeTrackingEntry({ id: 'entry-orphan', activityTypeId: 'activity-vanished' });
    const state = makeAppState({
      goals: [makeGoal()],
      trackingEntries: [makeTrackingEntry({ id: 'entry-good' }), orphan],
    });

    for (const version of [3, CURRENT_SCHEMA_VERSION]) {
      const quarantine: QuarantinedTrackingEntry[] = [];
      const migrated = migratePersistedState(state, version, { quarantine });

      expect(migrated.trackingEntries.map((entry) => entry.id)).toEqual(['entry-good']);
      expect(migrated.goals.map((goal) => goal.id)).toEqual(['goal-focus']);
      expect(quarantine).toEqual([{
        index: 1,
        id: 'entry-orphan',
        reason: 'Invalid tracking entry: referenced activity type does not exist',
        record: orphan,
      }]);
    }

    // No sink still means strict and all-or-nothing, which is what backup import relies on.
    expect(() => migratePersistedState(state, CURRENT_SCHEMA_VERSION)).toThrow(
      'referenced activity type does not exist'
    );
  });

  it('repairs a dangling entry goal on a legacy blob and quarantines it at current version', () => {
    const orphan = makeTrackingEntry({ id: 'entry-orphan', goalId: 'goal-vanished' });
    const state = makeAppState({
      trackingEntries: [makeTrackingEntry({ id: 'entry-good' }), orphan],
    });

    // Legacy: clear the optional reference and keep the entry, minutes and all.
    const legacyQuarantine: QuarantinedTrackingEntry[] = [];
    const legacy = migratePersistedState(state, 3, { quarantine: legacyQuarantine });
    expect(legacy.trackingEntries.map((entry) => entry.id)).toEqual([
      'entry-good',
      'entry-orphan',
    ]);
    expect(legacy.trackingEntries[1].goalId).toBeUndefined();
    expect(legacyQuarantine).toEqual([]);

    // Current version: set it aside instead of throwing, and leave everything else alone.
    const quarantine: QuarantinedTrackingEntry[] = [];
    const migrated = migratePersistedState(state, CURRENT_SCHEMA_VERSION, { quarantine });
    expect(migrated.trackingEntries.map((entry) => entry.id)).toEqual(['entry-good']);
    expect(quarantine).toEqual([{
      index: 1,
      id: 'entry-orphan',
      reason: 'Invalid tracking entry goal: goal is missing or uses another activity type',
      record: orphan,
    }]);

    expect(() => migratePersistedState(state, CURRENT_SCHEMA_VERSION)).toThrow(
      'Invalid tracking entry goal'
    );
  });

  it('repairs a dangling entry routine block on a legacy blob and quarantines it at current version', () => {
    const orphan = makeTrackingEntry({ id: 'entry-orphan', routineBlockId: 'block-vanished' });
    const state = makeAppState({
      routines: [makeRoutine({ blocks: [makeRoutineBlock()] })],
      trackingEntries: [
        makeTrackingEntry({ id: 'entry-good', routineBlockId: 'block-focus' }),
        orphan,
      ],
    });

    const legacyQuarantine: QuarantinedTrackingEntry[] = [];
    const legacy = migratePersistedState(state, 3, { quarantine: legacyQuarantine });
    expect(legacy.trackingEntries.map((entry) => entry.id)).toEqual([
      'entry-good',
      'entry-orphan',
    ]);
    expect(legacy.trackingEntries[1].routineBlockId).toBeUndefined();
    expect(legacy.trackingEntries[0].routineBlockId).toBe('block-focus');
    expect(legacyQuarantine).toEqual([]);

    const quarantine: QuarantinedTrackingEntry[] = [];
    const migrated = migratePersistedState(state, CURRENT_SCHEMA_VERSION, { quarantine });
    expect(migrated.trackingEntries.map((entry) => entry.id)).toEqual(['entry-good']);
    expect(quarantine).toEqual([{
      index: 1,
      id: 'entry-orphan',
      reason:
        'Invalid tracking entry routineBlockId: block is missing or does not match the entry',
      record: orphan,
    }]);
  });

  it('sets aside both stale-reference shapes at once and keeps the rest of the store intact', () => {
    const goalOrphan = makeTrackingEntry({ id: 'entry-no-goal', goalId: 'goal-vanished' });
    const blockOrphan = makeTrackingEntry({
      id: 'entry-no-block',
      routineBlockId: 'block-vanished',
    });
    const quarantine: QuarantinedTrackingEntry[] = [];

    const migrated = migratePersistedState(
      makeAppState({
        goals: [makeGoal()],
        routines: [makeRoutine({ blocks: [makeRoutineBlock()] })],
        trackingEntries: [
          goalOrphan,
          makeTrackingEntry({ id: 'entry-good', goalId: 'goal-focus' }),
          blockOrphan,
        ],
      }),
      CURRENT_SCHEMA_VERSION,
      { quarantine }
    );

    expect(migrated.trackingEntries.map((entry) => entry.id)).toEqual(['entry-good']);
    expect(migrated.goals.map((goal) => goal.id)).toEqual(['goal-focus']);
    expect(migrated.routines[0].blocks.map((block) => block.id)).toEqual(['block-focus']);
    expect(quarantine).toEqual([
      expect.objectContaining({ index: 0, id: 'entry-no-goal', record: goalOrphan }),
      expect.objectContaining({ index: 2, id: 'entry-no-block', record: blockOrphan }),
    ]);
  });

  it('clears the running timer when the entry it names is quarantined for a stale reference', () => {
    // The pointer's own record is what left live state, so it is answerable for the pointer no
    // longer resolving. Without this the strict pointer check would brick the launch anyway.
    const quarantine: QuarantinedTrackingEntry[] = [];

    const migrated = migratePersistedState(
      {
        ...makeAppState(),
        trackingEntries: [makeTrackingEntry({
          id: 'entry-running',
          endTime: undefined,
          goalId: 'goal-vanished',
        })],
        currentTrackingEntryId: 'entry-running',
      },
      CURRENT_SCHEMA_VERSION,
      { quarantine }
    );

    expect(migrated.trackingEntries).toEqual([]);
    expect(migrated.currentTrackingEntryId).toBeNull();
    expect(quarantine).toEqual([
      expect.objectContaining({ id: 'entry-running' }),
    ]);
  });

  it('still rejects a goal or routine block whose activity type went missing', () => {
    // Not softened here, and deliberately so: goals and routines are the skeleton the rest of
    // the state hangs off, their activityTypeId cannot be cleared either, and there is no
    // side-car for those record types to be set aside into. Still a live brick route.
    expect(() => migratePersistedState(
      { ...makeAppState(), goals: [makeGoal({ activityTypeId: 'activity-vanished' })] },
      CURRENT_SCHEMA_VERSION,
      { quarantine: [] }
    )).toThrow('Invalid goals: referenced activity type does not exist');

    expect(() => migratePersistedState(
      {
        ...makeAppState(),
        routines: [makeRoutine({
          blocks: [makeRoutineBlock({ activityTypeId: 'activity-vanished' })],
        })],
      },
      CURRENT_SCHEMA_VERSION,
      { quarantine: [] }
    )).toThrow('Invalid routines: referenced activity type does not exist');
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
