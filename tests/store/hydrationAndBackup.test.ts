import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getHydrationSnapshot,
  initializeAppStore,
  subscribeHydration,
  useAppStore,
} from '../../src/store/useAppStore';
import {
  APP_STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  createInitialState,
  encodeBackup,
  selectPersistedAppState,
} from '../../src/store/persistence';
import { makeAppState, makeGoal, makeRoutine } from '../helpers/builders';

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
