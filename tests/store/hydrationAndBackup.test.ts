import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getHydrationSnapshot,
  getQuarantinedTrackingEntries,
  getRecoveredActivityTypes,
  getRepairedTrackingEntries,
  initializeAppStore,
  subscribeHydration,
  useAppStore,
} from '../../src/store/useAppStore';
import {
  APP_STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  MAX_QUARANTINE_GENERATIONS,
  QUARANTINE_STORAGE_KEY,
  STRICT_SCHEMA_VERSION,
  appendQuarantineGeneration,
  createInitialState,
  encodeBackup,
  parseQuarantineArchive,
  selectPersistedAppState,
} from '../../src/store/persistence';
import {
  makeAppState,
  makeGoal,
  makeRoutine,
  makeRoutineBlock,
  makeTrackingEntry,
  withListOrder,
} from '../helpers/builders';
import { V4_STORE_BLOB, v4PersistedState } from '../fixtures/v4Store';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  useAppStore.setState(createInitialState());
  await AsyncStorage.clear();
  vi.clearAllMocks();
});

describe('explicit hydration lifecycle', () => {
  it('does not render-ready or persist defaults while the storage read is pending', async () => {
    const pending = deferred<string | null>();
    vi.mocked(AsyncStorage.getItem).mockImplementationOnce(() => pending.promise);
    const observed: string[] = [];
    const unsubscribe = subscribeHydration(() => {
      observed.push(getHydrationSnapshot().status);
    });

    const run = initializeAppStore({ force: true });
    expect(getHydrationSnapshot()).toEqual({ status: 'loading', error: null });
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(useAppStore.getState().routines).toEqual([]);

    pending.resolve(null);
    await run;
    unsubscribe();

    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    expect(useAppStore.getState().routines).toHaveLength(1);
    expect(useAppStore.getState().routines[0]).toMatchObject({
      name: 'My Week',
      isActive: true,
    });
    expect(observed).toEqual(['loading', 'ready']);
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2);
  });

  it('lets returning-user data win and does not duplicate its routine', async () => {
    const persisted = makeAppState({
      goals: [makeGoal({ id: 'persisted-goal' })],
      routines: [makeRoutine({ id: 'persisted-routine', name: 'Saved week' })],
      activeRoutineId: 'persisted-routine',
    });
    await AsyncStorage.setItem(APP_STORAGE_KEY, JSON.stringify({
      state: persisted,
      version: CURRENT_SCHEMA_VERSION,
    }));
    vi.clearAllMocks();

    await initializeAppStore({ force: true });

    expect(getHydrationSnapshot().status).toBe('ready');
    expect(useAppStore.getState()).toMatchObject({
      goals: [expect.objectContaining({ id: 'persisted-goal' })],
      routines: [expect.objectContaining({ id: 'persisted-routine', name: 'Saved week' })],
      activeRoutineId: 'persisted-routine',
    });
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('surfaces a read failure without writes and succeeds on retry', async () => {
    vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('storage unavailable'));

    await initializeAppStore({ force: true });
    expect(getHydrationSnapshot()).toEqual({
      status: 'error',
      error: 'storage unavailable',
    });
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(useAppStore.getState().routines).toEqual([]);

    const persisted = makeAppState({ routines: [makeRoutine({ name: 'Recovered week' })] });
    await AsyncStorage.setItem(APP_STORAGE_KEY, JSON.stringify({
      state: persisted,
      version: CURRENT_SCHEMA_VERSION,
    }));
    vi.clearAllMocks();
    await initializeAppStore({ force: true });

    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    expect(useAppStore.getState().routines[0].name).toBe('Recovered week');
  });

  it('does not expose generated defaults when their first durable write fails', async () => {
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));

    await initializeAppStore({ force: true });

    expect(getHydrationSnapshot()).toEqual({ status: 'error', error: 'disk full' });
    expect(useAppStore.getState().routines).toEqual([]);
  });

  it('treats malformed persisted JSON as an error and never overwrites it', async () => {
    await AsyncStorage.setItem(APP_STORAGE_KEY, '{invalid');
    vi.clearAllMocks();

    await initializeAppStore({ force: true });

    expect(getHydrationSnapshot().status).toBe('error');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(APP_STORAGE_KEY)).toBe('{invalid');
  });
});

describe('hydration of a store that already holds an unreadable entry', () => {
  // This is the state a device in the field can already be in: stopTracking used to write
  // endTime < startTime whenever the clock moved backwards, and every launch re-reads it.
  const corruptEntry = makeTrackingEntry({
    id: 'entry-corrupt',
    startTime: '2026-03-02T12:00:00.000Z',
    endTime: '2026-03-02T11:00:00.000Z',
  });

  it('loads everything else and reports what it set aside', async () => {
    const persisted = makeAppState({
      goals: [makeGoal({ id: 'persisted-goal' })],
      trackingEntries: [makeTrackingEntry({ id: 'entry-good' }), corruptEntry],
    });
    const raw = JSON.stringify({ state: persisted, version: CURRENT_SCHEMA_VERSION });
    await AsyncStorage.setItem(APP_STORAGE_KEY, raw);
    vi.clearAllMocks();

    await initializeAppStore({ force: true });

    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    expect(useAppStore.getState().trackingEntries.map((entry) => entry.id)).toEqual([
      'entry-good',
    ]);
    expect(useAppStore.getState().goals.map((goal) => goal.id)).toEqual(['persisted-goal']);

    expect(getQuarantinedTrackingEntries()).toEqual([{
      index: 1,
      id: 'entry-corrupt',
      reason: 'Invalid tracking entry: endTime is before startTime',
      record: corruptEntry,
    }]);

    // Quarantine must set the record aside, not destroy it: a durable copy exists and the
    // store's own blob is left exactly as it was.
    const archive = parseQuarantineArchive(
      await AsyncStorage.getItem(QUARANTINE_STORAGE_KEY)
    );
    expect(archive.generations).toHaveLength(1);
    expect(archive.generations[0].entries).toEqual([
      expect.objectContaining({ id: 'entry-corrupt', record: corruptEntry }),
    ]);
    expect(await AsyncStorage.getItem(APP_STORAGE_KEY)).toBe(raw);
  });

  it('appends a generation instead of overwriting what an earlier quarantine saved', async () => {
    // By the time a second quarantine happens, the first generation's records are already gone
    // from the store's own blob. Overwriting the side-car would destroy the only copy left.
    const earlier = appendQuarantineGeneration(
      parseQuarantineArchive(null),
      [{ index: 0, id: 'entry-from-last-time', reason: 'whatever', record: { id: 'old' } }],
      '2026-03-01T00:00:00.000Z'
    );
    await AsyncStorage.setItem(QUARANTINE_STORAGE_KEY, JSON.stringify(earlier));
    await AsyncStorage.setItem(APP_STORAGE_KEY, JSON.stringify({
      state: makeAppState({ trackingEntries: [corruptEntry] }),
      version: CURRENT_SCHEMA_VERSION,
    }));
    vi.clearAllMocks();

    await initializeAppStore({ force: true });

    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    const archive = parseQuarantineArchive(
      await AsyncStorage.getItem(QUARANTINE_STORAGE_KEY)
    );
    expect(archive.generations.map((generation) => generation.entries[0].id)).toEqual([
      'entry-from-last-time',
      'entry-corrupt',
    ]);
  });

  it('keeps an unreadable side-car verbatim rather than discarding it', async () => {
    await AsyncStorage.setItem(QUARANTINE_STORAGE_KEY, 'not json at all');
    await AsyncStorage.setItem(APP_STORAGE_KEY, JSON.stringify({
      state: makeAppState({ trackingEntries: [corruptEntry] }),
      version: CURRENT_SCHEMA_VERSION,
    }));
    vi.clearAllMocks();

    await initializeAppStore({ force: true });

    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    const archive = parseQuarantineArchive(
      await AsyncStorage.getItem(QUARANTINE_STORAGE_KEY)
    );
    expect(archive.unreadable).toBe('not json at all');
    expect(archive.generations).toHaveLength(1);
  });

  it('clears the running timer when the entry it points at cannot be read', async () => {
    const persisted = makeAppState({
      trackingEntries: [makeTrackingEntry({
        id: 'entry-open',
        date: '2026-02-30',
        endTime: undefined,
      })],
      currentTrackingEntryId: 'entry-open',
    });
    await AsyncStorage.setItem(APP_STORAGE_KEY, JSON.stringify({
      state: persisted,
      version: CURRENT_SCHEMA_VERSION,
    }));
    vi.clearAllMocks();

    await initializeAppStore({ force: true });

    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    expect(useAppStore.getState().trackingEntries).toEqual([]);
    expect(useAppStore.getState().currentTrackingEntryId).toBeNull();
    expect(getQuarantinedTrackingEntries()).toEqual([
      expect.objectContaining({ id: 'entry-open', reason: expect.stringContaining('date') }),
    ]);
  });

  it('keeps backup import strict, because the user can re-choose the file', async () => {
    const result = await useAppStore.getState().importData(
      encodeBackup(makeAppState({ trackingEntries: [corruptEntry] }))
    );

    expect(result).toEqual({
      ok: false,
      error: 'Invalid tracking entry: endTime is before startTime',
    });
    expect(useAppStore.getState().trackingEntries).toEqual([]);
  });
});

describe('hydration of a store whose references have gone stale', () => {
  // The other live route to the same permanent brick: the entry itself is perfectly readable,
  // but the goal it points at is gone from the blob — a torn AsyncStorage write during
  // deleteGoal, a hand-edited blob, a restore that dropped a record.
  const strandedEntry = makeTrackingEntry({
    id: 'entry-stranded',
    goalId: 'goal-that-was-deleted',
  });

  it('opens, sets the stranded entry aside, and gets it to the side-car', async () => {
    const raw = JSON.stringify({
      state: makeAppState({
        goals: [makeGoal({ id: 'persisted-goal' })],
        trackingEntries: [makeTrackingEntry({ id: 'entry-good' }), strandedEntry],
      }),
      version: CURRENT_SCHEMA_VERSION,
    });
    await AsyncStorage.setItem(APP_STORAGE_KEY, raw);
    vi.clearAllMocks();

    await initializeAppStore({ force: true });

    // Before the fix this was `status: 'error'` on this and every subsequent launch.
    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    expect(useAppStore.getState().trackingEntries.map((entry) => entry.id)).toEqual([
      'entry-good',
    ]);
    expect(useAppStore.getState().goals.map((goal) => goal.id)).toEqual(['persisted-goal']);

    // A linkage failure has to reach the side-car exactly as a parse failure does.
    const archive = parseQuarantineArchive(
      await AsyncStorage.getItem(QUARANTINE_STORAGE_KEY)
    );
    expect(archive.generations).toHaveLength(1);
    expect(archive.generations[0].entries).toEqual([{
      index: 1,
      id: 'entry-stranded',
      reason: 'Invalid tracking entry goal: goal is missing or uses another activity type',
      record: strandedEntry,
    }]);
    expect(getQuarantinedTrackingEntries()).toEqual(archive.generations[0].entries);
    expect(await AsyncStorage.getItem(APP_STORAGE_KEY)).toBe(raw);
  });
});

describe('hydration of a store whose goals or blocks name a missing activity type (#34)', () => {
  const orphaned = () => makeAppState({
    goals: [makeGoal({ id: 'goal-orphaned', activityTypeId: 'activity-vanished' })],
    routines: [makeRoutine({
      blocks: [makeRoutineBlock({ activityTypeId: 'activity-vanished' })],
    })],
  });

  async function hydrateOrphaned(version = CURRENT_SCHEMA_VERSION): Promise<void> {
    await AsyncStorage.setItem(APP_STORAGE_KEY, JSON.stringify({ state: orphaned(), version }));
    vi.clearAllMocks();
    await initializeAppStore({ force: true });
  }

  it('opens, keeps the goal and block, and reports the recovered type', async () => {
    const observed: number[] = [];
    const unsubscribe = subscribeHydration(() => {
      observed.push(getRecoveredActivityTypes().length);
    });
    await hydrateOrphaned();
    unsubscribe();

    // Before #34 this was `status: 'error'` on this and every later launch.
    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    const state = useAppStore.getState();
    expect(state.goals.map((goal) => [goal.id, goal.activityTypeId]))
      .toEqual([['goal-orphaned', 'activity-vanished']]);
    expect(state.routines[0].blocks.map((block) => block.activityTypeId))
      .toEqual(['activity-vanished']);
    expect(state.activityTypes.find((activity) => activity.id === 'activity-vanished'))
      .toMatchObject({ name: 'Recovered activity', isDefault: false });

    expect(getRecoveredActivityTypes()).toEqual([{
      id: 'activity-vanished',
      name: 'Recovered activity',
      goalCount: 1,
      routineBlockCount: 1,
    }]);
    // A listener was told while the report was published.
    expect(observed.at(-1)).toBe(1);
    // Its own channel: nothing was set aside or altered, and nothing goes to the side-car.
    expect(getQuarantinedTrackingEntries()).toEqual([]);
    expect(getRepairedTrackingEntries()).toEqual([]);
    expect(await AsyncStorage.getItem(QUARANTINE_STORAGE_KEY)).toBeNull();
  });

  it('reports each recovered type once on the migrate path, where two reads run', async () => {
    await hydrateOrphaned(CURRENT_SCHEMA_VERSION - 1);

    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    expect(getRecoveredActivityTypes().map((recovered) => recovered.id))
      .toEqual(['activity-vanished']);
    // The migrate path rewrites the blob, so the placeholder is now durable and the next launch
    // has nothing to recover.
    const rewritten = JSON.parse((await AsyncStorage.getItem(APP_STORAGE_KEY))!) as {
      state: { activityTypes: { id: string }[] };
    };
    expect(rewritten.state.activityTypes.map((activity) => activity.id))
      .toContain('activity-vanished');
    await initializeAppStore({ force: true });
    expect(getRecoveredActivityTypes()).toEqual([]);
  });

  it('clears the report on reset', async () => {
    await hydrateOrphaned();
    expect(getRecoveredActivityTypes()).toHaveLength(1);

    await useAppStore.getState().resetState();

    expect(getRecoveredActivityTypes()).toEqual([]);
  });

  it('clears the report on a successful import, and refuses a backup with the same gap', async () => {
    await hydrateOrphaned();
    expect(getRecoveredActivityTypes()).toHaveLength(1);

    // Import stays strict: a backup whose goal names a missing type is refused, not recovered,
    // and a refused import leaves the report (and live state) alone.
    const refused = await useAppStore.getState().importData(encodeBackup(orphaned()));
    expect(refused).toEqual({
      ok: false,
      error: 'Invalid goals: referenced activity type does not exist',
    });
    expect(getRecoveredActivityTypes()).toHaveLength(1);

    const accepted = await useAppStore.getState().importData(encodeBackup(makeAppState()));
    expect(accepted).toEqual({ ok: true });
    expect(getRecoveredActivityTypes()).toEqual([]);
  });
});

describe('hydration of a legacy store that was left with two timers running', () => {
  const LEGACY = STRICT_SCHEMA_VERSION - 1;
  // The one that stays resumable, and the one that used to be silently zeroed (issue #4).
  const openSelected = makeTrackingEntry({ id: 'open-selected', endTime: undefined });
  const openStranded = makeTrackingEntry({
    id: 'open-stranded',
    startTime: '2026-03-02T11:00:00.000Z',
    updatedAt: '2026-03-02T12:30:00.000Z',
    endTime: undefined,
  });

  async function hydrateLegacyWithTwoOpenTimers(): Promise<void> {
    await AsyncStorage.setItem(APP_STORAGE_KEY, JSON.stringify({
      state: makeAppState({
        trackingEntries: [openSelected, openStranded],
        currentTrackingEntryId: 'open-selected',
      }),
      version: LEGACY,
    }));
    vi.clearAllMocks();
    await initializeAppStore({ force: true });
  }

  it('keeps the worked duration and tells the user it changed the entry', async () => {
    await hydrateLegacyWithTwoOpenTimers();

    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    const closed = useAppStore.getState().trackingEntries
      .find((entry) => entry.id === 'open-stranded');
    expect(closed?.endTime).toBe('2026-03-02T12:30:00.000Z');
    expect(useAppStore.getState().currentTrackingEntryId).toBe('open-selected');

    // The repair has to reach the screen. Without this the migration is still silent, which is
    // half of what issue #4 was about.
    expect(getRepairedTrackingEntries()).toEqual([
      expect.objectContaining({
        id: 'open-stranded',
        closedAt: '2026-03-02T12:30:00.000Z',
        evidence: 'lastUpdated',
        record: openStranded,
      }),
    ]);
    // Repairs are their own channel: nothing was set aside, so the quarantine notice stays silent.
    expect(getQuarantinedTrackingEntries()).toEqual([]);
  });

  it('copies the unrepaired original to the side-car before the blob is rewritten', async () => {
    await hydrateLegacyWithTwoOpenTimers();

    // migrate rewrites the app blob at v4 with endTime already filled in, so this side-car copy is
    // the only remaining evidence of what the device actually held.
    const archive = parseQuarantineArchive(
      await AsyncStorage.getItem(QUARANTINE_STORAGE_KEY)
    );
    expect(archive.generations).toHaveLength(1);
    expect(archive.generations[0].entries).toEqual([]);
    expect(archive.generations[0].repairs).toEqual([
      expect.objectContaining({ id: 'open-stranded', record: openStranded }),
    ]);

    const rewritten = JSON.parse(
      (await AsyncStorage.getItem(APP_STORAGE_KEY))!
    ) as { state: { trackingEntries: { id: string; endTime?: string }[] } };
    expect(rewritten.state.trackingEntries.find((entry) => entry.id === 'open-stranded')?.endTime)
      .toBe('2026-03-02T12:30:00.000Z');
  });

  it('writes one generation, not one per hydration stage', async () => {
    // migrate writes the side-car and initializeAppStore writes it again; the content fingerprint
    // has to recognise the second as the same event, exactly as it does for quarantined records.
    await hydrateLegacyWithTwoOpenTimers();

    const archive = parseQuarantineArchive(
      await AsyncStorage.getItem(QUARANTINE_STORAGE_KEY)
    );
    expect(archive.generations).toHaveLength(1);
  });
});

describe('durability of the quarantine side-car', () => {
  const LEGACY_SCHEMA_VERSION = STRICT_SCHEMA_VERSION - 1;

  // Two tests below need a write that fails for one key and succeeds for every other, which means
  // replacing the base implementation rather than using a `...Once` variant. `restoreMocks` does
  // not put back the base implementation of a `vi.fn(impl)`, so it is captured and restored here;
  // without this the rejecting write leaks into every test that follows.
  let storeItem: (key: string, value: string) => Promise<void>;

  beforeAll(() => {
    storeItem = vi.mocked(AsyncStorage.setItem).getMockImplementation()!;
  });

  afterEach(() => {
    vi.mocked(AsyncStorage.setItem).mockImplementation(storeItem);
  });

  /** Make the side-car key, and only that key, unwritable. */
  function failSidecarWrites(): void {
    vi.mocked(AsyncStorage.setItem).mockImplementation(async (key: string, value: string) => {
      if (key === QUARANTINE_STORAGE_KEY) throw new Error('disk full');
      return storeItem(key, value);
    });
  }

  // An invalid `source` throws in parseTrackingEntry whatever the leniency flag says. That
  // matters: on a pre-v4 blob parseTrackingEntry runs with repairLegacyValues=true, so the
  // endTime < startTime malformation used by the tests above is *repaired* rather than
  // quarantined, and a migrate-path test built on it would pass while quarantining nothing.
  const unreadableEntry = {
    ...makeTrackingEntry({ id: 'entry-bad-source' }),
    source: 'telepathy',
  };

  function blobHolding(version: number): string {
    return JSON.stringify({
      state: { ...makeAppState(), trackingEntries: [unreadableEntry] },
      version,
    });
  }

  /** Every AsyncStorage read and write of this hydration, in the order they were issued. */
  function storageOperations(): string[] {
    const getItem = vi.mocked(AsyncStorage.getItem);
    const setItem = vi.mocked(AsyncStorage.setItem);
    return [
      ...getItem.mock.calls.map((call, index) => ({
        order: getItem.mock.invocationCallOrder[index],
        label: `READ ${String(call[0])}`,
      })),
      ...setItem.mock.calls.map((call, index) => ({
        order: setItem.mock.invocationCallOrder[index],
        label: `WRITE ${String(call[0])}`,
      })),
    ]
      .sort((left, right) => left.order - right.order)
      .map((operation) => operation.label);
  }

  it('writes the side-car before the migrate path rewrites the app blob', async () => {
    // The migrate path is the exposed one: zustand rewrites the blob with the bad record already
    // stripped out, so until the side-car holds it the record is in no durable location.
    await AsyncStorage.setItem(APP_STORAGE_KEY, blobHolding(LEGACY_SCHEMA_VERSION));
    vi.clearAllMocks();

    await initializeAppStore({ force: true });

    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    const operations = storageOperations();
    const sidecarWrite = operations.indexOf(`WRITE ${QUARANTINE_STORAGE_KEY}`);
    const blobWrite = operations.indexOf(`WRITE ${APP_STORAGE_KEY}`);
    // The blob really is rewritten on this path -- if it ever stops being, this guard says so
    // rather than letting the ordering assertion below pass vacuously.
    expect(blobWrite).toBeGreaterThanOrEqual(0);
    expect(sidecarWrite).toBeGreaterThanOrEqual(0);
    expect(sidecarWrite).toBeLessThan(blobWrite);

    // One hydration still produces exactly one generation: the migrate path has already written
    // the side-car by the time initializeAppStore reaches its own append, which recognises the
    // identical generation and writes nothing.
    const archive = parseQuarantineArchive(
      await AsyncStorage.getItem(QUARANTINE_STORAGE_KEY)
    );
    expect(archive.generations).toHaveLength(1);
    expect(archive.generations[0].entries).toEqual([
      expect.objectContaining({ id: 'entry-bad-source', record: unreadableEntry }),
    ]);
  });

  it('leaves the record in the app blob when the side-car write fails on a pre-v4 blob', async () => {
    const raw = blobHolding(LEGACY_SCHEMA_VERSION);
    await AsyncStorage.setItem(APP_STORAGE_KEY, raw);
    vi.clearAllMocks();
    // Reject the side-car write specifically, whenever it is issued. Failing the *first* write
    // instead would be satisfied by the broken ordering too, since there the first write is the
    // app blob's.
    failSidecarWrites();

    await initializeAppStore({ force: true });

    // The record must never be in neither key. With the side-car unwritable the app blob is the
    // only place left for it, so hydration must refuse rather than report success over a record
    // it just destroyed.
    const blobAfter = await AsyncStorage.getItem(APP_STORAGE_KEY);
    expect(blobAfter).toBe(raw);
    expect(blobAfter).toContain('telepathy');
    expect(getHydrationSnapshot()).toEqual({ status: 'error', error: 'disk full' });
  });

  it('still opens when the side-car write fails on a current-version blob', async () => {
    // The merge path deliberately keeps the old behaviour: zustand writes nothing there, so the
    // record stays in the app blob and refusing to open would cost the user their app for no
    // gain. This pins that the asymmetry with `migrate` is intended, not an oversight.
    await AsyncStorage.setItem(APP_STORAGE_KEY, blobHolding(CURRENT_SCHEMA_VERSION));
    vi.clearAllMocks();
    failSidecarWrites();

    await initializeAppStore({ force: true });

    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    expect(await AsyncStorage.getItem(APP_STORAGE_KEY)).toContain('telepathy');
  });

  it('does not let repeated launches over one bad record discard an earlier generation', async () => {
    // Generation 1 holds record A, whose only copy this is -- it was quarantined long ago and is
    // in no app blob any more. Record B then goes bad and is never cleaned out of the blob, so
    // every cold start re-reads and re-quarantines it.
    const earlier = appendQuarantineGeneration(
      parseQuarantineArchive(null),
      [{ index: 0, id: 'entry-record-a', reason: 'whatever', record: { id: 'record-a' } }],
      '2026-03-01T00:00:00.000Z'
    );
    await AsyncStorage.setItem(QUARANTINE_STORAGE_KEY, JSON.stringify(earlier));
    // A current-version blob, so nothing ever rewrites it and record B stays uncleaned.
    await AsyncStorage.setItem(APP_STORAGE_KEY, blobHolding(CURRENT_SCHEMA_VERSION));

    for (let launch = 0; launch < MAX_QUARANTINE_GENERATIONS + 5; launch += 1) {
      await initializeAppStore({ force: true });
      expect(getHydrationSnapshot().status).toBe('ready');
    }

    const archive = parseQuarantineArchive(
      await AsyncStorage.getItem(QUARANTINE_STORAGE_KEY)
    );
    // Re-seeing the identical record consumes no generation, so record A -- whose only copy this
    // is -- has not been rotated off the end of the cap by a record unrelated to it.
    expect(archive.generations.map((generation) => generation.entries[0].id)).toEqual([
      'entry-record-a',
      'entry-bad-source',
    ]);
  });

  it('still records a genuinely new set of bad records as its own generation', async () => {
    // Suppressing the repeat must not suppress new damage: a second record going bad is a new
    // event and has to be archived, even though the first record is in the set both times.
    await AsyncStorage.setItem(APP_STORAGE_KEY, blobHolding(CURRENT_SCHEMA_VERSION));
    await initializeAppStore({ force: true });

    await AsyncStorage.setItem(APP_STORAGE_KEY, JSON.stringify({
      state: {
        ...makeAppState(),
        trackingEntries: [
          unreadableEntry,
          { ...makeTrackingEntry({ id: 'entry-bad-date' }), date: 'not-a-date' },
        ],
      },
      version: CURRENT_SCHEMA_VERSION,
    }));
    await initializeAppStore({ force: true });

    const archive = parseQuarantineArchive(
      await AsyncStorage.getItem(QUARANTINE_STORAGE_KEY)
    );
    expect(archive.generations).toHaveLength(2);
    expect(archive.generations[1].entries.map((entry) => entry.id)).toEqual([
      'entry-bad-source',
      'entry-bad-date',
    ]);
  });
});

describe('reset and backup actions', () => {
  it('resets atomically to one active default routine and preserves unrelated storage', async () => {
    const activityTypeId = useAppStore.getState().activityTypes[0].id;
    useAppStore.getState().addGoal({
      name: 'Remove me',
      description: '',
      estimatedMinutes: 60,
      activityTypeId,
    });
    await AsyncStorage.setItem('unrelated-key', 'keep');

    await useAppStore.getState().resetState();

    const state = useAppStore.getState();
    expect(state.goals).toEqual([]);
    expect(state.trackingEntries).toEqual([]);
    expect(state.routines).toHaveLength(1);
    expect(state.routines[0].isActive).toBe(true);
    expect(state.activeRoutineId).toBe(state.routines[0].id);
    expect(state.hasCompletedOnboarding).toBe(false);
    expect(await AsyncStorage.getItem('unrelated-key')).toBe('keep');
  });

  it('leaves live state unchanged when durable reset storage fails', async () => {
    const before = selectPersistedAppState(useAppStore.getState());
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));

    await expect(useAppStore.getState().resetState()).rejects.toThrow('disk full');
    expect(selectPersistedAppState(useAppStore.getState())).toEqual(before);
  });

  it('imports by replacement, persists first, and retains callable actions', async () => {
    const imported = makeAppState({
      goals: [makeGoal({ id: 'imported-goal', name: 'Imported 🎯' })],
    });
    const result = await useAppStore.getState().importData(encodeBackup(imported));

    expect(result).toEqual({ ok: true });
    expect(useAppStore.getState().goals.map((goal) => goal.id)).toEqual(['imported-goal']);
    expect(typeof useAppStore.getState().addGoal).toBe('function');
    const raw = await AsyncStorage.getItem(APP_STORAGE_KEY);
    expect(JSON.parse(raw!).version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('rejects invalid or unwritable imports without changing live state', async () => {
    const before = selectPersistedAppState(useAppStore.getState());
    expect(await useAppStore.getState().importData('{bad')).toMatchObject({ ok: false });
    expect(selectPersistedAppState(useAppStore.getState())).toEqual(before);

    const imported = makeAppState({ goals: [makeGoal({ id: 'never-applied' })] });
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));
    expect(await useAppStore.getState().importData(encodeBackup(imported))).toEqual({
      ok: false,
      error: 'disk full',
    });
    expect(selectPersistedAppState(useAppStore.getState())).toEqual(before);
  });
});

describe('the week-start preference across launches (#44)', () => {
  it('opens a real v4 store with everything intact and a Monday week', async () => {
    await AsyncStorage.setItem(APP_STORAGE_KEY, V4_STORE_BLOB);
    const v4 = v4PersistedState();

    await initializeAppStore({ force: true });

    expect(getHydrationSnapshot()).toEqual({ status: 'ready', error: null });
    const state = useAppStore.getState();
    expect(state.preferences).toEqual({ weekStartsOn: 1 });
    const { schemaVersion: _stamp, ...v4Data } = v4;
    expect(selectPersistedAppState(state)).toEqual({
      // v7 (#49): the one goal's priority became the top list position.
      ...withListOrder(v4Data, ['goal-report']),
      preferences: { weekStartsOn: 1 },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    // Nothing was set aside or altered on the way.
    expect(getQuarantinedTrackingEntries()).toEqual([]);
    expect(getRepairedTrackingEntries()).toEqual([]);
    expect(await AsyncStorage.getItem(QUARANTINE_STORAGE_KEY)).toBeNull();

    // The store rewrote itself at v5 with the default filled in.
    const rewritten = JSON.parse((await AsyncStorage.getItem(APP_STORAGE_KEY))!) as {
      version: number;
      state: { preferences: unknown; trackingEntries: unknown[] };
    };
    expect(rewritten.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(rewritten.state.preferences).toEqual({ weekStartsOn: 1 });
    expect(rewritten.state.trackingEntries).toEqual(v4.trackingEntries);
  });

  it('persists a change of week start and reads it back on the next launch', async () => {
    useAppStore.getState().setWeekStartsOn(0);
    expect(useAppStore.getState().preferences.weekStartsOn).toBe(0);

    // The store's own write-through is what persists it.
    const raw = await AsyncStorage.getItem(APP_STORAGE_KEY);
    expect(JSON.parse(raw!).state.preferences).toEqual({ weekStartsOn: 0 });

    // A cold start: forget the in-memory choice (that write is persisted too, so put the blob
    // back afterwards), then hydrate from storage.
    useAppStore.setState(createInitialState());
    expect(useAppStore.getState().preferences.weekStartsOn).toBe(1);
    await AsyncStorage.setItem(APP_STORAGE_KEY, raw!);
    await initializeAppStore({ force: true });

    expect(useAppStore.getState().preferences).toEqual({ weekStartsOn: 0 });
  });

  it('ignores a week start that is not Sunday or Monday', () => {
    useAppStore.getState().setWeekStartsOn(3 as never);
    expect(useAppStore.getState().preferences).toEqual({ weekStartsOn: 1 });
  });

  it('keeps the preference through Reset All Data', async () => {
    useAppStore.getState().setWeekStartsOn(0);
    await useAppStore.getState().resetState();
    expect(useAppStore.getState().preferences).toEqual({ weekStartsOn: 0 });
  });

  it('takes the backup\'s preference on import, and Monday from a backup that has none', async () => {
    useAppStore.getState().setWeekStartsOn(0);
    const sundayBackup = useAppStore.getState().exportData();

    useAppStore.getState().setWeekStartsOn(1);
    expect(await useAppStore.getState().importData(sundayBackup)).toEqual({ ok: true });
    expect(useAppStore.getState().preferences).toEqual({ weekStartsOn: 0 });

    const v4Backup = JSON.stringify({
      format: 'zenroutine-backup',
      formatVersion: 1,
      schemaVersion: 4,
      exportedAt: '2026-09-17T09:00:00.000Z',
      state: v4PersistedState(),
    });
    expect(await useAppStore.getState().importData(v4Backup)).toEqual({ ok: true });
    expect(useAppStore.getState().preferences).toEqual({ weekStartsOn: 1 });
    expect(useAppStore.getState().goals.map((goal) => goal.id)).toEqual(['goal-report']);
  });
});
