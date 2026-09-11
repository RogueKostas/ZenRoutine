import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getHydrationSnapshot,
  getQuarantinedTrackingEntries,
  initializeAppStore,
  subscribeHydration,
  useAppStore,
} from '../../src/store/useAppStore';
import {
  APP_STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  QUARANTINE_STORAGE_KEY,
  appendQuarantineGeneration,
  createInitialState,
  encodeBackup,
  parseQuarantineArchive,
  selectPersistedAppState,
} from '../../src/store/persistence';
import { makeAppState, makeGoal, makeRoutine, makeTrackingEntry } from '../helpers/builders';

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
