import { describe, expect, it } from 'vitest';

import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  CURRENT_SCHEMA_VERSION,
  RECOVERED_ACTIVITY_COLOR,
  RECOVERED_ACTIVITY_ICON,
  RECOVERED_ACTIVITY_NAME,
  STRICT_SCHEMA_VERSION,
  decodeBackup,
  encodeBackup,
  migratePersistedState,
  selectPersistedAppState,
} from '../../src/store/persistence';
import type {
  QuarantinedTrackingEntry,
  RecoveredActivityType,
  RepairedTrackingEntry,
} from '../../src/store/persistence';
import {
  TEST_TIMESTAMP,
  makeActivityType,
  makeAppState,
  makeGoal,
  makeRoutine,
  makeRoutineBlock,
  makeTrackingEntry,
  makeLegacyGoal,
  withListOrder,
} from '../helpers/builders';
import type { RoutineBlock } from '../../src/core/types';
import { v4PersistedState } from '../fixtures/v4Store';

function makeLegacyState() {
  const activity = { ...makeActivityType(), icon: 'briefcase' };
  const goal = makeGoal();
  // A schema-1 goal has neither the priority v3 added nor the order v7 replaced it with.
  const { order: _order, ...legacyGoal } = goal;
  return {
    activityTypes: [activity],
    goals: [legacyGoal],
    routines: [makeRoutine({ blocks: [makeRoutineBlock()] })],
    trackingEntries: [makeTrackingEntry({ goalId: goal.id })],
    activeRoutineId: 'routine-main',
    currentTrackingEntryId: null,
    schemaVersion: 1,
  };
}

describe('persisted-state migrations', () => {
  it('migrates legacy icons, priority (now list order), and onboarding through schema 4', () => {
    const legacy = makeLegacyState();
    const original = structuredClone(legacy);

    const migrated = migratePersistedState(legacy, 1);

    expect(migrated).toMatchObject({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      hasCompletedOnboarding: false,
      activeRoutineId: 'routine-main',
    });
    expect(migrated.activityTypes[0].icon).toBe('💼');
    expect(migrated.goals[0].order).toBe(0);
    expect(migrated.goals[0]).not.toHaveProperty('priority');
    expect(legacy).toEqual(original);
    expect(migratePersistedState(migrated, CURRENT_SCHEMA_VERSION)).toEqual(migrated);
  });

  it('repairs legacy negative progress and invalid current pointers without losing history', () => {
    const legacy = {
      ...makeAppState({ trackingEntries: [makeTrackingEntry()] }),
      goals: [makeLegacyGoal({ loggedMinutes: -15 })],
      currentTrackingEntryId: 'entry-focus',
    };
    delete (legacy as Partial<typeof legacy>).hasCompletedOnboarding;

    const migrated = migratePersistedState(legacy, 3);

    expect(migrated.goals[0].loggedMinutes).toBe(0);
    expect(migrated.currentTrackingEntryId).toBeNull();
    expect(migrated.trackingEntries).toHaveLength(1);
  });

  it('repairs schema-3 values that the old public actions could persist', () => {
    const legacy = {
      ...makeAppState({
        routines: [makeRoutine({
          // A pre-v6 block could name a goal; this one names a goal that is gone.
          blocks: [{ ...makeRoutineBlock(), goalId: 'missing-goal' } as RoutineBlock],
        })],
        trackingEntries: [makeTrackingEntry({
          goalId: 'missing-goal',
          routineBlockId: 'missing-block',
        })],
      }),
      goals: [makeLegacyGoal({ estimatedMinutes: 0 })],
    };
    delete (legacy as Partial<typeof legacy>).hasCompletedOnboarding;

    const migrated = migratePersistedState(legacy, 3);

    expect(migrated.goals[0].estimatedMinutes).toBe(1);
    expect(migrated.routines[0].blocks[0]).not.toHaveProperty('goalId');
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
    // open-b's own updatedAt (10:00) predates its startTime (11:00), so there is genuinely no
    // evidence it ran at all and it closes at zero. Asserted with `evidence: 'none'` alongside,
    // because the *reason* is the contract here — an unevidenced zero, not a discarded duration.
    expect(migrated.trackingEntries.find((entry) => entry.id === 'open-b')?.endTime)
      .toBe(openB.startTime);
  });
});

/**
 * Issue #4. Closing every non-selected open entry at its own `startTime` recorded a zero duration
 * for time the user really worked, and said nothing about it. These pin the replacement contract:
 * close at the last moment there is evidence for, never invent time that was not evidenced, and
 * report every entry altered this way.
 */
describe('legacy open timers that have to be closed', () => {
  const migrateOpenEntries = (
    entries: readonly ReturnType<typeof makeTrackingEntry>[],
    currentTrackingEntryId: string | null,
    repairs?: RepairedTrackingEntry[]
  ) => migratePersistedState(
    makeAppState({ trackingEntries: [...entries], currentTrackingEntryId }),
    STRICT_SCHEMA_VERSION - 1,
    repairs ? { repairs } : undefined
  );

  const openSelected = makeTrackingEntry({ id: 'open-selected', endTime: undefined });

  it('closes a stranded open timer at its last-updated time rather than zeroing it', () => {
    // 90 minutes of real work: started 11:00, and the record was still being written at 12:30.
    const stranded = makeTrackingEntry({
      id: 'open-stranded',
      startTime: '2026-03-02T11:00:00.000Z',
      updatedAt: '2026-03-02T12:30:00.000Z',
      endTime: undefined,
    });

    const migrated = migrateOpenEntries([openSelected, stranded], 'open-selected');

    const closed = migrated.trackingEntries.find((entry) => entry.id === 'open-stranded');
    expect(closed?.endTime).toBe('2026-03-02T12:30:00.000Z');
    expect(closed?.endTime).not.toBe(stranded.startTime);
    // The point of the whole issue, stated as a duration rather than a timestamp.
    expect(
      Date.parse(closed!.endTime!) - Date.parse(closed!.startTime)
    ).toBe(90 * 60 * 1000);
  });

  it('clamps to the next entry\'s start rather than inventing duration past it', () => {
    // updatedAt says 18:00, but the user demonstrably started something else at 12:00. The entry
    // was over by then, so 12:00 is an upper bound the repair is not allowed to run past.
    const stranded = makeTrackingEntry({
      id: 'open-stranded',
      startTime: '2026-03-02T11:00:00.000Z',
      updatedAt: '2026-03-02T18:00:00.000Z',
      endTime: undefined,
    });
    const nextActivity = makeTrackingEntry({
      id: 'entry-next',
      startTime: '2026-03-02T12:00:00.000Z',
      endTime: '2026-03-02T13:00:00.000Z',
    });

    const migrated = migrateOpenEntries(
      [openSelected, stranded, nextActivity],
      'open-selected'
    );

    expect(migrated.trackingEntries.find((entry) => entry.id === 'open-stranded')?.endTime)
      .toBe('2026-03-02T12:00:00.000Z');
  });

  it('closes at startTime only when nothing at all outlived it', () => {
    const stranded = makeTrackingEntry({
      id: 'open-stranded',
      startTime: '2026-03-02T11:00:00.000Z',
      updatedAt: '2026-03-02T11:00:00.000Z',
      endTime: undefined,
    });
    const repairs: RepairedTrackingEntry[] = [];

    const migrated = migrateOpenEntries([openSelected, stranded], 'open-selected', repairs);

    expect(migrated.trackingEntries.find((entry) => entry.id === 'open-stranded')?.endTime)
      .toBe('2026-03-02T11:00:00.000Z');
    // A zero duration is acceptable here, but only because it is honest — and it is still reported,
    // so an unevidenced zero is never indistinguishable from a discarded one.
    expect(repairs).toEqual([
      expect.objectContaining({ id: 'open-stranded', evidence: 'none' }),
    ]);
  });

  it('reports every repaired entry with its original record and position', () => {
    const stranded = makeTrackingEntry({
      id: 'open-stranded',
      startTime: '2026-03-02T11:00:00.000Z',
      updatedAt: '2026-03-02T12:30:00.000Z',
      endTime: undefined,
    });
    const repairs: RepairedTrackingEntry[] = [];

    migrateOpenEntries([openSelected, stranded], 'open-selected', repairs);

    expect(repairs).toEqual([{
      index: 1,
      id: 'open-stranded',
      reason: 'Open tracking entry closed at its last-updated time: only one entry can be open',
      closedAt: '2026-03-02T12:30:00.000Z',
      evidence: 'lastUpdated',
      // Verbatim, so the reconstruction can always be checked against what the device held.
      record: stranded,
    }]);
  });

  it('repairs without a sink too, so a legacy backup still imports', () => {
    // decodeBackup passes no options at all. Unlike quarantining, a missing repair sink must not
    // turn the repair into a throw — a v1 blob has no other route into the app.
    const stranded = makeTrackingEntry({
      id: 'open-stranded',
      startTime: '2026-03-02T11:00:00.000Z',
      updatedAt: '2026-03-02T12:30:00.000Z',
      endTime: undefined,
    });

    const migrated = migrateOpenEntries([openSelected, stranded], 'open-selected');

    expect(migrated.trackingEntries.find((entry) => entry.id === 'open-stranded')?.endTime)
      .toBe('2026-03-02T12:30:00.000Z');
  });

  it('reports nothing when the blob has only the one open timer', () => {
    const repairs: RepairedTrackingEntry[] = [];

    const migrated = migrateOpenEntries([openSelected], 'open-selected', repairs);

    expect(migrated.trackingEntries.filter((entry) => !entry.endTime)).toHaveLength(1);
    expect(repairs).toEqual([]);
  });
});

describe('persisted-state migrations, continued', () => {

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
    // A goal naming a missing activity type used to be the second example here. Since #34 a
    // hydration recovers that with a placeholder type (see "recovering a missing activity type"),
    // so the skeleton-level corruption that is still refused is a malformed goals list itself.
    expect(() => migratePersistedState(
      { ...makeAppState(), goals: 'nope' },
      CURRENT_SCHEMA_VERSION,
      { quarantine: [] }
    )).toThrow('Invalid goals');
    expect(() => migratePersistedState(
      { ...makeAppState(), goals: [makeGoal(), makeGoal({ order: 1 })] },
      CURRENT_SCHEMA_VERSION,
      { quarantine: [] }
    )).toThrow('Invalid goals: duplicate ids');
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
    const state = {
      ...makeAppState({
        trackingEntries: [makeTrackingEntry({ id: 'entry-good' }), orphan],
      }),
      // Readable at v3 (priority) and at the current version (order, with priority ignored).
      goals: [{ ...makeGoal(), priority: 3 }],
    };

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

  it('still rejects a goal or routine block whose activity type went missing when there is no sink', () => {
    // The negative control for #34. Without a quarantine sink — backup import, and account copies,
    // which go through import — nothing is recovered: the user chose that file and can choose
    // another, so it refuses loudly and leaves local data untouched.
    expect(() => migratePersistedState(
      { ...makeAppState(), goals: [makeGoal({ activityTypeId: 'activity-vanished' })] },
      CURRENT_SCHEMA_VERSION
    )).toThrow('Invalid goals: referenced activity type does not exist');

    expect(() => migratePersistedState(
      {
        ...makeAppState(),
        routines: [makeRoutine({
          blocks: [makeRoutineBlock({ activityTypeId: 'activity-vanished' })],
        })],
      },
      CURRENT_SCHEMA_VERSION
    )).toThrow('Invalid routines: referenced activity type does not exist');

    // A repairs or recovered sink alone does not switch recovery on either: only quarantine does.
    const recovered: RecoveredActivityType[] = [];
    expect(() => migratePersistedState(
      { ...makeAppState(), goals: [makeGoal({ activityTypeId: 'activity-vanished' })] },
      CURRENT_SCHEMA_VERSION,
      { repairs: [], recoveredActivityTypes: recovered }
    )).toThrow('Invalid goals: referenced activity type does not exist');
    expect(recovered).toEqual([]);
  });

  it('still rejects a backup whose goal or block names a missing activity type', () => {
    const goalBackup = encodeBackup(
      makeAppState({ goals: [makeGoal({ activityTypeId: 'activity-vanished' })] })
    );
    expect(() => decodeBackup(goalBackup))
      .toThrow('Invalid goals: referenced activity type does not exist');

    const blockBackup = encodeBackup(makeAppState({
      routines: [makeRoutine({
        blocks: [makeRoutineBlock({ activityTypeId: 'activity-vanished' })],
      })],
    }));
    expect(() => decodeBackup(blockBackup))
      .toThrow('Invalid routines: referenced activity type does not exist');
  });
});

describe('recovering a missing activity type on hydration (#34)', () => {
  function hydrate(stored: unknown, version = CURRENT_SCHEMA_VERSION) {
    const quarantine: QuarantinedTrackingEntry[] = [];
    const recovered: RecoveredActivityType[] = [];
    const state = migratePersistedState(stored, version, {
      quarantine,
      recoveredActivityTypes: recovered,
    });
    return { state, quarantine, recovered };
  }

  it('puts back the type a goal and a routine block both name, under the same id', () => {
    const goal = makeGoal({ activityTypeId: 'activity-vanished' });
    const block = makeRoutineBlock({ activityTypeId: 'activity-vanished' });

    const { state, quarantine, recovered } = hydrate(makeAppState({
      goals: [goal],
      routines: [makeRoutine({ blocks: [block] })],
    }));

    const placeholder = state.activityTypes.find((activity) => activity.id === 'activity-vanished');
    expect(placeholder).toEqual({
      id: 'activity-vanished',
      name: RECOVERED_ACTIVITY_NAME,
      color: RECOVERED_ACTIVITY_COLOR,
      icon: RECOVERED_ACTIVITY_ICON,
      isDefault: false,
      sortOrder: 1,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(Number.isFinite(Date.parse(placeholder!.createdAt))).toBe(true);
    expect(placeholder!.createdAt).toContain('T');
    // Nothing rewritten: the goal and block are exactly as stored, and still name the old id.
    expect(state.goals).toEqual([goal]);
    expect(state.routines[0].blocks).toEqual([block]);
    // The existing type is untouched and comes first.
    expect(state.activityTypes.map((activity) => activity.id))
      .toEqual(['activity-focus', 'activity-vanished']);
    expect(recovered).toEqual([{
      id: 'activity-vanished',
      name: RECOVERED_ACTIVITY_NAME,
      goalCount: 1,
      routineBlockCount: 1,
    }]);
    expect(quarantine).toEqual([]);
  });

  it('recovers a goal-only and a block-only gap, at a legacy version too', () => {
    const goalOnly = hydrate(makeAppState({
      goals: [makeGoal({ activityTypeId: 'activity-vanished' })],
    }));
    expect(goalOnly.recovered).toEqual([
      expect.objectContaining({ id: 'activity-vanished', goalCount: 1, routineBlockCount: 0 }),
    ]);

    const blockOnly = hydrate({
      ...makeAppState(),
      goals: [],
      routines: [makeRoutine({
        blocks: [
          makeRoutineBlock({ id: 'block-a', activityTypeId: 'activity-vanished' }),
          makeRoutineBlock({ id: 'block-b', dayOfWeek: 2, activityTypeId: 'activity-vanished' }),
        ],
      })],
    }, STRICT_SCHEMA_VERSION - 1);
    expect(blockOnly.recovered).toEqual([
      expect.objectContaining({ id: 'activity-vanished', goalCount: 0, routineBlockCount: 2 }),
    ]);
    expect(blockOnly.state.activityTypes.map((activity) => activity.id))
      .toContain('activity-vanished');
  });

  it('gives two missing ids two placeholders with distinct names that clash with nothing', () => {
    const { state, recovered } = hydrate(makeAppState({
      // A type the user already called "Recovered activity" keeps its name; the placeholders
      // step around it, case-insensitively.
      activityTypes: [
        makeActivityType(),
        makeActivityType({ id: 'activity-mine', name: 'recovered Activity ', sortOrder: 7 }),
      ],
      goals: [makeGoal({ activityTypeId: 'activity-gone-a' })],
      routines: [makeRoutine({
        blocks: [makeRoutineBlock({ activityTypeId: 'activity-gone-b' })],
      })],
    }));

    expect(recovered.map((entry) => [entry.id, entry.name])).toEqual([
      ['activity-gone-a', 'Recovered activity 2'],
      ['activity-gone-b', 'Recovered activity 3'],
    ]);
    const placeholders = state.activityTypes.filter((activity) => activity.id.startsWith('activity-gone'));
    expect(placeholders.map((activity) => [activity.name, activity.sortOrder])).toEqual([
      ['Recovered activity 2', 8],
      ['Recovered activity 3', 9],
    ]);
    expect(new Set(state.activityTypes.map((activity) => activity.name.trim().toLowerCase())).size)
      .toBe(state.activityTypes.length);
  });

  it('keeps a tracking entry on the recovered type and quarantines one on another missing type', () => {
    const onRecovered = makeTrackingEntry({
      id: 'entry-recovered',
      activityTypeId: 'activity-vanished',
      goalId: 'goal-focus',
    });
    const onOther = makeTrackingEntry({
      id: 'entry-elsewhere',
      activityTypeId: 'activity-never-referenced',
    });

    const { state, quarantine, recovered } = hydrate(makeAppState({
      goals: [makeGoal({ activityTypeId: 'activity-vanished' })],
      trackingEntries: [onRecovered, onOther],
    }));

    // Only goals and blocks earn a placeholder; an entry's missing type is still a stale entry.
    expect(recovered.map((entry) => entry.id)).toEqual(['activity-vanished']);
    expect(state.activityTypes.map((activity) => activity.id))
      .not.toContain('activity-never-referenced');
    expect(state.trackingEntries).toEqual([onRecovered]);
    expect(quarantine).toEqual([{
      index: 1,
      id: 'entry-elsewhere',
      reason: 'Invalid tracking entry: referenced activity type does not exist',
      record: onOther,
    }]);
  });

  it('creates nothing new when the recovered state is hydrated again', () => {
    const first = hydrate(makeAppState({
      goals: [makeGoal({ activityTypeId: 'activity-vanished' })],
      routines: [makeRoutine({
        blocks: [makeRoutineBlock({ activityTypeId: 'activity-other-gone' })],
      })],
    }));
    expect(first.recovered).toHaveLength(2);

    // Through JSON, as the store would write and read it back.
    const again = hydrate(JSON.parse(JSON.stringify(first.state)) as unknown);
    expect(again.recovered).toEqual([]);
    expect(again.quarantine).toEqual([]);
    expect(again.state).toEqual(first.state);
    // And the result is a store the strict, sinkless read (a backup of it) accepts.
    expect(migratePersistedState(first.state, CURRENT_SCHEMA_VERSION)).toEqual(first.state);
  });

  it('recovers nothing when every reference resolves', () => {
    const { state, recovered } = hydrate(makeAppState({
      goals: [makeGoal()],
      routines: [makeRoutine({ blocks: [makeRoutineBlock()] })],
    }));
    expect(recovered).toEqual([]);
    expect(state.activityTypes.map((activity) => activity.id)).toEqual(['activity-focus']);
  });
});
describe('schema 5: the week-start preference (#44)', () => {
  it('carries a real v4 store forward untouched and gives it a Monday week', () => {
    const v4 = v4PersistedState();
    const original = structuredClone(v4);

    const migrated = migratePersistedState(v4, 4);

    // Everything the v4 store held, byte for byte, plus the new default and the new stamp — and,
    // since v7 (#49), its one goal's priority turned into the top list position.
    const { schemaVersion: _stamp, ...v4Data } = original;
    expect(migrated).toEqual({
      ...withListOrder(v4Data, ['goal-report']),
      preferences: { weekStartsOn: 1 },
      lastSyncedAt: undefined,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    expect(migrated.preferences.weekStartsOn).toBe(1);
    // Stored day numbers are not renumbered by the preference: Sunday is still 0.
    expect(migrated.routines[0].blocks.map((block) => block.dayOfWeek)).toEqual([0, 1, 6]);
    expect(migrated.currentTrackingEntryId).toBe('entry-running');
    expect(v4).toEqual(original);
    // And the result is a valid current store.
    expect(migratePersistedState(migrated, CURRENT_SCHEMA_VERSION)).toEqual(migrated);
  });

  it('keeps a v4 store on the strict path instead of silently repairing it', () => {
    // v4 was written by the strict store, so the lenient pre-v4 repairs must not start applying
    // to it just because the schema number moved on. Two open timers is corruption at v4.
    const v4 = v4PersistedState();
    const entries = v4.trackingEntries as Record<string, unknown>[];
    v4.trackingEntries = [...entries, { ...entries[1], id: 'entry-second-open' }];

    expect(() => migratePersistedState(v4, 4)).toThrow('only one entry can be open');
    expect(() => migratePersistedState(v4, 3)).not.toThrow();
  });

  it('round-trips a Sunday preference', () => {
    const state = makeAppState({ preferences: { weekStartsOn: 0 } });
    expect(migratePersistedState(state, CURRENT_SCHEMA_VERSION).preferences).toEqual({
      weekStartsOn: 0,
    });
  });

  it.each([
    ['missing', undefined],
    ['not an object', 'monday'],
    ['an out-of-range day', { weekStartsOn: 3 }],
    ['a stringly day', { weekStartsOn: '0' }],
  ])('falls back to Monday when the stored preference is %s', (_label, preferences) => {
    const state = { ...makeAppState(), preferences };
    expect(migratePersistedState(state, CURRENT_SCHEMA_VERSION).preferences).toEqual({
      weekStartsOn: 1,
    });
  });

  it('drops unknown preference keys', () => {
    const state = { ...makeAppState(), preferences: { weekStartsOn: 0, colour: 'teal' } };
    expect(migratePersistedState(state, CURRENT_SCHEMA_VERSION).preferences).toEqual({
      weekStartsOn: 0,
    });
  });
});

describe('backup codec', () => {
  it('exports the week-start preference and restores it', () => {
    const state = makeAppState({ preferences: { weekStartsOn: 0 } });
    const serialized = encodeBackup(state, TEST_TIMESTAMP);

    expect(JSON.parse(serialized).state.preferences).toEqual({ weekStartsOn: 0 });
    expect(decodeBackup(serialized).preferences).toEqual({ weekStartsOn: 0 });
  });

  it('imports a v4 backup, which has no preferences, with a Monday week', () => {
    const serialized = JSON.stringify({
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: 4,
      exportedAt: TEST_TIMESTAMP,
      state: v4PersistedState(),
    });

    const decoded = decodeBackup(serialized);
    expect(decoded.preferences).toEqual({ weekStartsOn: 1 });
    expect(decoded.trackingEntries.map((entry) => entry.id)).toEqual([
      'entry-monday',
      'entry-running',
    ]);
    expect(decoded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

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
      goals: [expect.objectContaining({ order: 0 })],
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
