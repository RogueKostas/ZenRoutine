import { describe, expect, it } from 'vitest';

import type { AppState } from '../../src/core/types';
import type {
  QuarantinedTrackingEntry,
  RecoveredActivityType,
  RepairedTrackingEntry,
} from '../../src/store/persistence';
import {
  CURRENT_SCHEMA_VERSION,
  RECOVERED_ACTIVITY_NAME,
  STRICT_SCHEMA_VERSION,
  createDefaultPreferences,
  hydratePersistedState,
  migratePersistedState,
} from '../../src/store/persistence';
import {
  makeActivityType,
  makeAppState,
  makeGoal,
  makeLegacyGoal,
  makeRoutine,
  makeRoutineBlock,
  makeTrackingEntry,
} from '../helpers/builders';

/**
 * The invariant this file exists for (#38).
 *
 * A hydration makes up to two reads of the persisted blob. The first is versioned and may repair;
 * the second is strict, at CURRENT_SCHEMA_VERSION, and may quarantine. On the migrate path both
 * now happen inside zustand's `migrate` (`hydratePersistedState`), which is awaited before the
 * app blob is rewritten — but that is only worth anything because the strict read has nothing to
 * find. **Every lenient repair must emit output the strict read accepts unchanged.** It always
 * has; nothing said so, and nothing would have noticed it stopping. Now something does.
 *
 * Two traps this file is written around:
 *
 * 1. **Vacuous repair.** The repair gate is `version < STRICT_SCHEMA_VERSION` (4), *not*
 *    `< CURRENT_SCHEMA_VERSION`. A malformation chosen for a v3 blob is repaired rather than
 *    quarantined, so a test that merely asserts "hydration succeeded" passes while the branch it
 *    names never ran. Every case below therefore asserts the repair itself, on the state, before
 *    it asserts anything about strictness.
 * 2. **Vacuous strictness.** `toEqual` between the two reads is the assertion that matters: a
 *    strict read that silently altered the state would otherwise look like acceptance.
 */

const LEGACY = STRICT_SCHEMA_VERSION - 1;

function storedState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...makeAppState(), ...overrides };
}

interface ReadResult {
  state: AppState;
  quarantine: QuarantinedTrackingEntry[];
  repairs: RepairedTrackingEntry[];
  recovered: RecoveredActivityType[];
}

/** The versioned read, exactly as zustand's `migrate` stage performs it. */
function readAtVersion(stored: unknown, version: number): ReadResult {
  const quarantine: QuarantinedTrackingEntry[] = [];
  const repairs: RepairedTrackingEntry[] = [];
  const recovered: RecoveredActivityType[] = [];
  const state = migratePersistedState(
    stored,
    version,
    { quarantine, repairs, recoveredActivityTypes: recovered }
  );
  return { state, quarantine, repairs, recovered };
}

/**
 * One repair branch: a blob that triggers it, and what the branch is supposed to have done.
 *
 * `expectRepaired` is the anti-vacuity guard. It runs against the versioned read's own output, so
 * a case whose malformation turns out to be a no-op fails here rather than passing the strict
 * check for the wrong reason.
 */
interface RepairCase {
  name: string;
  version: number;
  stored: Record<string, unknown>;
  expectRepaired: (read: ReadResult) => void;
}

const REPAIR_CASES: RepairCase[] = [
  {
    name: 'a non-positive goal estimate becomes one minute',
    version: LEGACY,
    stored: storedState({ goals: [makeLegacyGoal({ estimatedMinutes: 0 })] }),
    expectRepaired: ({ state }) => {
      expect(state.goals[0].estimatedMinutes).toBe(1);
    },
  },
  {
    name: 'a completed goal with no completedAt takes its updatedAt',
    version: LEGACY,
    stored: storedState({
      goals: [makeLegacyGoal({
        status: 'completed',
        completedAt: undefined,
        updatedAt: '2026-03-02T10:00:00.000Z',
      })],
    }),
    expectRepaired: ({ state }) => {
      expect(state.goals[0].completedAt).toBe('2026-03-02T10:00:00.000Z');
    },
  },
  {
    name: "an active goal's stray completedAt is cleared",
    version: LEGACY,
    stored: storedState({
      goals: [makeLegacyGoal({ status: 'active', completedAt: '2026-03-02T10:00:00.000Z' })],
    }),
    expectRepaired: ({ state }) => {
      expect(state.goals[0].completedAt).toBeUndefined();
    },
  },
  {
    name: 'negative loggedMinutes becomes zero',
    version: LEGACY,
    stored: storedState({ goals: [makeLegacyGoal({ loggedMinutes: -30 })] }),
    expectRepaired: ({ state }) => {
      expect(state.goals[0].loggedMinutes).toBe(0);
    },
  },
  {
    name: 'a pre-v7 priority enum becomes a list order (#49)',
    version: 6,
    stored: storedState({
      goals: [
        makeLegacyGoal({ id: 'goal-last', priority: 5 }),
        makeLegacyGoal({ id: 'goal-first', priority: 1 }),
      ],
    }),
    expectRepaired: ({ state }) => {
      expect(state.goals.map((goal) => [goal.id, goal.order])).toEqual([
        ['goal-first', 0],
        ['goal-last', 1],
      ]);
    },
  },
  {
    name: 'a goal order with gaps is closed up',
    version: 8,
    stored: storedState({
      goals: [makeGoal({ id: 'goal-b', order: 9 }), makeGoal({ id: 'goal-a', order: 4 })],
    }),
    expectRepaired: ({ state }) => {
      expect(state.goals.map((goal) => [goal.id, goal.order])).toEqual([
        ['goal-a', 0],
        ['goal-b', 1],
      ]);
    },
  },
  {
    name: 'a pre-v8 goal may lose its type and estimate (#50)',
    version: 8,
    stored: storedState({
      goals: [(() => {
        const { activityTypeId: _type, estimatedMinutes: _estimate, ...goal } = makeGoal();
        return goal;
      })()],
    }),
    expectRepaired: ({ state }) => {
      expect('activityTypeId' in state.goals[0]).toBe(false);
      expect('estimatedMinutes' in state.goals[0]).toBe(false);
    },
  },
  {
    name: "a pre-v6 block's goalId is dropped unread (#60)",
    version: 5,
    stored: storedState({
      // Not through `makeRoutine`: `goalId` is no longer part of `RoutineBlock`, which is the
      // point — only a stored blob can still hold one.
      routines: [{
        ...makeRoutine(),
        blocks: [{ ...makeRoutineBlock(), goalId: 'goal-that-never-existed' }],
      }],
    }),
    expectRepaired: ({ state }) => {
      expect('goalId' in state.routines[0].blocks[0]).toBe(false);
    },
  },
  {
    name: 'a pre-v2 icon name becomes an emoji',
    version: 1,
    stored: storedState({
      activityTypes: [makeActivityType({ icon: 'briefcase' })],
      routines: [makeRoutine()],
    }),
    expectRepaired: ({ state }) => {
      expect(state.activityTypes[0].icon).toBe('💼');
    },
  },
  {
    name: 'an endTime before its startTime is pulled back to the startTime',
    version: LEGACY,
    stored: storedState({
      trackingEntries: [makeTrackingEntry({
        startTime: '2026-03-02T11:00:00.000Z',
        endTime: '2026-03-02T09:00:00.000Z',
      })],
    }),
    expectRepaired: ({ state }) => {
      expect(state.trackingEntries[0].endTime).toBe('2026-03-02T11:00:00.000Z');
    },
  },
  {
    name: "a tracking entry's stale goalId is cleared rather than quarantined",
    version: LEGACY,
    stored: storedState({
      goals: [],
      trackingEntries: [makeTrackingEntry({ goalId: 'goal-that-was-deleted' })],
    }),
    expectRepaired: ({ state, quarantine }) => {
      expect(state.trackingEntries).toHaveLength(1);
      expect(state.trackingEntries[0].goalId).toBeUndefined();
      expect(quarantine).toEqual([]);
    },
  },
  {
    name: "a tracking entry's stale routineBlockId is cleared rather than quarantined",
    version: LEGACY,
    stored: storedState({
      trackingEntries: [makeTrackingEntry({ routineBlockId: 'block-that-was-deleted' })],
    }),
    expectRepaired: ({ state, quarantine }) => {
      expect(state.trackingEntries).toHaveLength(1);
      expect(state.trackingEntries[0].routineBlockId).toBeUndefined();
      expect(quarantine).toEqual([]);
    },
  },
  {
    name: 'an activeRoutineId naming no routine is cleared',
    version: LEGACY,
    stored: storedState({ activeRoutineId: 'routine-that-was-deleted' }),
    expectRepaired: ({ state }) => {
      expect(state.activeRoutineId).toBeNull();
    },
  },
  {
    name: 'a stranded open entry closes at its last-updated time (#4)',
    version: LEGACY,
    stored: storedState({
      trackingEntries: [
        makeTrackingEntry({
          id: 'open-selected',
          startTime: '2026-03-02T14:00:00.000Z',
          updatedAt: '2026-03-02T14:00:00.000Z',
          endTime: undefined,
        }),
        makeTrackingEntry({
          id: 'open-stranded',
          startTime: '2026-03-02T11:00:00.000Z',
          updatedAt: '2026-03-02T12:30:00.000Z',
          endTime: undefined,
        }),
      ],
      currentTrackingEntryId: 'open-selected',
    }),
    expectRepaired: ({ state, repairs }) => {
      expect(repairs.map((repair) => [repair.id, repair.evidence, repair.closedAt])).toEqual([
        ['open-stranded', 'lastUpdated', '2026-03-02T12:30:00.000Z'],
      ]);
      expect(state.trackingEntries.filter((entry) => entry.endTime === undefined)).toHaveLength(1);
      expect(state.currentTrackingEntryId).toBe('open-selected');
    },
  },
  {
    name: "a stranded open entry is clamped back to the next entry's start (#4)",
    version: LEGACY,
    stored: storedState({
      trackingEntries: [
        makeTrackingEntry({
          id: 'open-selected',
          startTime: '2026-03-02T14:00:00.000Z',
          updatedAt: '2026-03-02T14:00:00.000Z',
          endTime: undefined,
        }),
        makeTrackingEntry({
          id: 'open-stranded',
          startTime: '2026-03-02T11:00:00.000Z',
          updatedAt: '2026-03-02T16:00:00.000Z',
          endTime: undefined,
        }),
      ],
      currentTrackingEntryId: 'open-selected',
    }),
    expectRepaired: ({ state, repairs }) => {
      expect(repairs.map((repair) => [repair.id, repair.evidence, repair.closedAt])).toEqual([
        ['open-stranded', 'nextEntryStart', '2026-03-02T14:00:00.000Z'],
      ]);
      expect(state.trackingEntries.filter((entry) => entry.endTime === undefined)).toHaveLength(1);
    },
  },
  {
    name: 'an unevidenced stranded open entry closes at its own start (#4)',
    version: LEGACY,
    stored: storedState({
      trackingEntries: [
        makeTrackingEntry({
          id: 'open-selected',
          startTime: '2026-03-02T14:00:00.000Z',
          updatedAt: '2026-03-02T14:00:00.000Z',
          endTime: undefined,
        }),
        makeTrackingEntry({
          id: 'open-stranded',
          startTime: '2026-03-02T11:00:00.000Z',
          updatedAt: '2026-03-02T11:00:00.000Z',
          endTime: undefined,
        }),
      ],
      currentTrackingEntryId: 'open-selected',
    }),
    expectRepaired: ({ state, repairs }) => {
      expect(repairs.map((repair) => [repair.id, repair.evidence, repair.closedAt])).toEqual([
        ['open-stranded', 'none', '2026-03-02T11:00:00.000Z'],
      ]);
      // A zero-duration entry is still an entry, and the strict read has to accept it: endTime
      // equal to startTime is exactly the boundary `parseTrackingEntry` rejects one side of.
      const stranded = state.trackingEntries.find((entry) => entry.id === 'open-stranded');
      expect(stranded?.endTime).toBe(stranded?.startTime);
    },
  },
  {
    name: 'a timer pointing at nothing is adopted by the surviving open entry',
    version: LEGACY,
    stored: storedState({
      trackingEntries: [makeTrackingEntry({ id: 'open-only', endTime: undefined })],
      currentTrackingEntryId: 'entry-that-was-deleted',
    }),
    expectRepaired: ({ state }) => {
      expect(state.currentTrackingEntryId).toBe('open-only');
    },
  },
  {
    name: 'a missing hasCompletedOnboarding becomes false',
    version: LEGACY,
    stored: (() => {
      const { hasCompletedOnboarding: _flag, ...rest } = makeAppState();
      return rest as unknown as Record<string, unknown>;
    })(),
    expectRepaired: ({ state }) => {
      expect(state.hasCompletedOnboarding).toBe(false);
    },
  },
  {
    name: 'an unreadable preference falls back to its default (#44)',
    version: LEGACY,
    stored: storedState({ preferences: { weekStartsOn: 7 } }),
    expectRepaired: ({ state }) => {
      expect(state.preferences).toEqual(createDefaultPreferences());
      // Anti-vacuity: 7 really is not a week start, so the fallback really did run.
      expect(state.preferences.weekStartsOn).not.toBe(7);
    },
  },
  {
    name: 'a malformed capacityChangedAt timestamp is dropped',
    version: LEGACY,
    stored: storedState({
      routines: [makeRoutine({
        capacityChangedAt: {
          'activity-focus': 'the day before yesterday',
          'activity-other': '2026-03-01T08:00:00.000Z',
        },
      })],
    }),
    expectRepaired: ({ state }) => {
      expect(state.routines[0].capacityChangedAt).toEqual({
        'activity-other': '2026-03-01T08:00:00.000Z',
      });
    },
  },
  {
    name: 'a pre-v9 entry\'s pauses are dropped unread, malformed or not (#54)',
    version: 8,
    stored: storedState({
      trackingEntries: [{
        ...makeTrackingEntry(),
        // Ends before it starts, and runs past the entry: refused outright at v9.
        pauses: [{ start: '2026-03-02T09:30:00.000Z', end: '2026-03-02T09:10:00.000Z' }],
      }],
    }),
    expectRepaired: ({ state, quarantine }) => {
      // The entry has to survive the versioned read at all: with the version gate gone it is the
      // *pauses* that make it unreadable, so it would be quarantined here instead.
      expect(quarantine).toEqual([]);
      expect(state.trackingEntries.map((entry) => entry.id)).toEqual(['entry-focus']);
      expect('pauses' in state.trackingEntries[0]).toBe(false);
      // Anti-vacuity, and the point of the version gate: the identical record stamped v9 is
      // refused. If `readTrackingPauses` ever stopped gating on the version, the strict read
      // below would start quarantining this entry — which is the window this file guards.
      expect(() => migratePersistedState(
        storedState({
          trackingEntries: [{
            ...makeTrackingEntry(),
            pauses: [{ start: '2026-03-02T09:30:00.000Z', end: '2026-03-02T09:10:00.000Z' }],
          }],
        }),
        CURRENT_SCHEMA_VERSION
      )).toThrow(/pauses/);
    },
  },
  {
    name: 'a goal and a block naming a missing activity type get a placeholder type (#34)',
    version: 8,
    stored: storedState({
      goals: [makeGoal({ activityTypeId: 'activity-vanished' })],
      routines: [makeRoutine({
        blocks: [makeRoutineBlock({ activityTypeId: 'activity-other-gone' })],
      })],
      trackingEntries: [makeTrackingEntry({ activityTypeId: 'activity-vanished' })],
    }),
    expectRepaired: ({ state, recovered, quarantine }) => {
      expect(recovered.map((entry) => [entry.id, entry.name])).toEqual([
        ['activity-vanished', RECOVERED_ACTIVITY_NAME],
        ['activity-other-gone', `${RECOVERED_ACTIVITY_NAME} 2`],
      ]);
      expect(state.activityTypes.map((activity) => activity.id)).toEqual([
        'activity-focus',
        'activity-vanished',
        'activity-other-gone',
      ]);
      // The entry on the recovered id resolves rather than being set aside.
      expect(state.trackingEntries.map((entry) => entry.id)).toEqual(['entry-focus']);
      expect(quarantine).toEqual([]);
    },
  },
  {
    name: 'a pre-v4 goal naming a missing activity type gets a placeholder type (#34)',
    version: LEGACY,
    stored: storedState({
      goals: [makeLegacyGoal({ activityTypeId: 'activity-vanished' })],
    }),
    expectRepaired: ({ state, recovered }) => {
      expect(recovered).toEqual([expect.objectContaining({ id: 'activity-vanished', goalCount: 1 })]);
      expect(state.activityTypes.some((activity) => activity.id === 'activity-vanished')).toBe(true);
    },
  },
  {
    name: 'every legacy repair at once still composes',
    version: 1,
    stored: (() => {
      const { hasCompletedOnboarding: _flag, ...rest } = makeAppState();
      return {
        ...rest,
        activityTypes: [makeActivityType({ icon: 'rocket' })],
        goals: [
          { ...makeLegacyGoal({ id: 'goal-a', estimatedMinutes: -5, loggedMinutes: -1 }) },
          makeLegacyGoal({
            id: 'goal-b',
            status: 'completed',
            completedAt: undefined,
            updatedAt: '2026-03-02T10:00:00.000Z',
          }),
        ],
        routines: [{
          ...makeRoutine(),
          blocks: [{ ...makeRoutineBlock(), goalId: 'goal-that-never-existed' }],
        }],
        trackingEntries: [
          makeTrackingEntry({
            id: 'entry-backwards',
            startTime: '2026-03-02T11:00:00.000Z',
            endTime: '2026-03-02T09:00:00.000Z',
            goalId: 'goal-that-was-deleted',
            routineBlockId: 'block-that-was-deleted',
          }),
          makeTrackingEntry({
            id: 'open-stranded',
            startTime: '2026-03-02T12:00:00.000Z',
            updatedAt: '2026-03-02T13:00:00.000Z',
            endTime: undefined,
          }),
          makeTrackingEntry({
            id: 'open-selected',
            startTime: '2026-03-02T15:00:00.000Z',
            updatedAt: '2026-03-02T15:00:00.000Z',
            endTime: undefined,
          }),
        ],
        activeRoutineId: 'routine-that-was-deleted',
        preferences: 'not an object',
      } as unknown as Record<string, unknown>;
    })(),
    expectRepaired: ({ state, repairs, quarantine }) => {
      expect(state.activityTypes[0].icon).toBe('🚀');
      expect(state.goals.map((goal) => goal.id)).toEqual(['goal-a', 'goal-b']);
      expect(state.goals[0].estimatedMinutes).toBe(1);
      expect(state.goals[0].loggedMinutes).toBe(0);
      expect(state.goals[1].completedAt).toBe('2026-03-02T10:00:00.000Z');
      expect('goalId' in state.routines[0].blocks[0]).toBe(false);
      const backwards = state.trackingEntries.find((entry) => entry.id === 'entry-backwards');
      expect(backwards?.endTime).toBe('2026-03-02T11:00:00.000Z');
      expect(backwards?.goalId).toBeUndefined();
      expect(backwards?.routineBlockId).toBeUndefined();
      expect(state.activeRoutineId).toBeNull();
      expect(state.preferences).toEqual(createDefaultPreferences());
      expect(state.hasCompletedOnboarding).toBe(false);
      expect(repairs.map((repair) => repair.id)).toEqual(['open-stranded']);
      expect(state.currentTrackingEntryId).toBe('open-selected');
      expect(quarantine).toEqual([]);
    },
  },
];

describe('every repair emits output the strict read accepts (#38)', () => {
  for (const { name, version, stored, expectRepaired } of REPAIR_CASES) {
    it(name, () => {
      const read = readAtVersion(stored, version);
      // Trap 1: the branch has to have actually run.
      expectRepaired(read);

      // The strict read `merge` performs, with the sinks hydration passes it. Anything it drops
      // here is a record whose only durable copy would have depended on the write in
      // `initializeAppStore` that is allowed to fail silently.
      const quarantine: QuarantinedTrackingEntry[] = [];
      const repairs: RepairedTrackingEntry[] = [];
      const recovered: RecoveredActivityType[] = [];
      const strict = migratePersistedState(
        read.state,
        CURRENT_SCHEMA_VERSION,
        { quarantine, repairs, recoveredActivityTypes: recovered }
      );
      expect(quarantine).toEqual([]);
      expect(repairs).toEqual([]);
      // A placeholder the versioned read created is already there, so nothing is recovered twice.
      expect(recovered).toEqual([]);
      // Trap 2: accepted *unchanged*, not merely accepted.
      expect(strict).toEqual(read.state);

      // And with no sinks at all, where a stale reference throws instead of being set aside.
      // A backup of this state would import; a merge-stage read of it drops nothing.
      expect(() => migratePersistedState(read.state, CURRENT_SCHEMA_VERSION)).not.toThrow();
    });
  }

  it('covers a repair gated below STRICT_SCHEMA_VERSION and one above it', () => {
    // Guards the table itself: a version typo that put every case at or above the repair gate
    // would leave the lenient branches untested while every case still passed.
    const versions = REPAIR_CASES.map((repairCase) => repairCase.version);
    expect(versions.some((version) => version < STRICT_SCHEMA_VERSION)).toBe(true);
    expect(versions.some(
      (version) => version >= STRICT_SCHEMA_VERSION && version < CURRENT_SCHEMA_VERSION
    )).toBe(true);
    // Every case must be a migrate-path version: at CURRENT_SCHEMA_VERSION zustand short-circuits
    // and no repair branch runs at all.
    expect(versions.every((version) => version < CURRENT_SCHEMA_VERSION)).toBe(true);
  });
});

describe('the strict read is idempotent', () => {
  // The other half of what makes `merge`'s re-read a no-op on the migrate path: `migrate` hands it
  // a state that already came out of the strict read, so reading it again must change nothing.
  const states: [string, Record<string, unknown>][] = [
    ['a store with history', storedState({
      goals: [makeGoal({ id: 'goal-a', order: 0 }), makeGoal({ id: 'goal-b', order: 1 })],
      routines: [makeRoutine({ blocks: [makeRoutineBlock()] })],
      trackingEntries: [
        makeTrackingEntry({ id: 'entry-done' }),
        makeTrackingEntry({
          id: 'entry-open',
          startTime: '2026-03-02T14:00:00.000Z',
          endTime: undefined,
          pauses: [{ start: '2026-03-02T14:10:00.000Z' }],
        }),
      ],
      currentTrackingEntryId: 'entry-open',
    })],
    ['a store with a repaired legacy history', readAtVersion(
      storedState({
        goals: [makeLegacyGoal({ estimatedMinutes: 0 })],
        trackingEntries: [makeTrackingEntry({
          startTime: '2026-03-02T11:00:00.000Z',
          endTime: '2026-03-02T09:00:00.000Z',
        })],
      }),
      LEGACY
    ).state as unknown as Record<string, unknown>],
    ['a store with a recovered activity type (#34)', readAtVersion(
      storedState({
        goals: [makeGoal({ activityTypeId: 'activity-vanished' })],
        routines: [makeRoutine({
          blocks: [makeRoutineBlock({ activityTypeId: 'activity-vanished' })],
        })],
      }),
      CURRENT_SCHEMA_VERSION
    ).state as unknown as Record<string, unknown>],
  ];

  for (const [name, state] of states) {
    it(name, () => {
      const once = migratePersistedState(state, CURRENT_SCHEMA_VERSION);
      const twice = migratePersistedState(once, CURRENT_SCHEMA_VERSION);
      expect(twice).toEqual(once);
    });
  }
});

describe('hydratePersistedState puts both reads behind one sink (#38)', () => {
  // An invalid `source` throws whatever the leniency flag says, so this is quarantined and not
  // repaired even on a pre-v4 blob — the trap the #4 lane recorded.
  const unreadable = { ...makeTrackingEntry({ id: 'entry-bad-source' }), source: 'telepathy' };

  it('reports the versioned read\'s drops to the caller', () => {
    const quarantine: QuarantinedTrackingEntry[] = [];
    const state = hydratePersistedState(
      storedState({ trackingEntries: [makeTrackingEntry({ id: 'entry-good' }), unreadable] }),
      LEGACY,
      { quarantine }
    );

    expect(state.trackingEntries.map((entry) => entry.id)).toEqual(['entry-good']);
    expect(quarantine).toEqual([
      expect.objectContaining({ index: 1, id: 'entry-bad-source', record: unreadable }),
    ]);
  });

  it('adds nothing of its own to the state or to the sink on a legacy blob', () => {
    // The composed read costs a second, strict read of the versioned read's output. The whole
    // claim of #38 is that that second read finds nothing — so the composed read and the
    // versioned read must agree on both the state and the quarantine. This is the invariant
    // above restated where `migrate` actually uses it: if a repair ever emits something the
    // strict read refuses, the two disagree here and this fails.
    const stored = storedState({
      goals: [makeLegacyGoal({ estimatedMinutes: 0 })],
      trackingEntries: [
        makeTrackingEntry({
          id: 'entry-backwards',
          startTime: '2026-03-02T11:00:00.000Z',
          endTime: '2026-03-02T09:00:00.000Z',
        }),
        unreadable,
      ],
    });

    const composedQuarantine: QuarantinedTrackingEntry[] = [];
    const composed = hydratePersistedState(stored, LEGACY, { quarantine: composedQuarantine });
    const versioned = readAtVersion(stored, LEGACY);

    expect(composed).toEqual(versioned.state);
    expect(composedQuarantine).toEqual(versioned.quarantine);
    // Anti-vacuity: there was something for both reads to find in the first place.
    expect(composedQuarantine).toHaveLength(1);
    expect(composed.goals[0].estimatedMinutes).toBe(1);
    expect(composed.trackingEntries[0].endTime).toBe('2026-03-02T11:00:00.000Z');
  });

  it('propagates a read that throws rather than swallowing it', () => {
    // Duplicate routine ids are blob-level corruption: no sink to fall into, so the versioned
    // read throws. Composing a second read must not turn that into a recovery — the throw has to
    // come back out of `migrate` as a rejection, which is what aborts zustand's chain at
    // middleware.mjs:431 before the blob is rewritten. (Only the versioned read can be made to
    // throw here; by the invariant above the strict read has nothing to throw over.)
    const quarantine: QuarantinedTrackingEntry[] = [];
    expect(() => hydratePersistedState(
      storedState({ routines: [makeRoutine({ id: 'routine-a' }), makeRoutine({ id: 'routine-a' })] }),
      LEGACY,
      { quarantine }
    )).toThrow(/duplicate ids/);
    expect(quarantine).toEqual([]);
  });
});
