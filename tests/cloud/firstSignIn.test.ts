import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../../src/core/types';
import { resolveFirstSignIn, type Ask, type LocalApp } from '../../src/cloud/firstSignIn';
import {
  classifyLocalData,
  contentHash,
  readSavedCopies,
  readSyncMeta,
  SAVED_COPIES_KEY,
  SYNC_META_KEY,
  writeSyncMeta,
} from '../../src/cloud/localSync';
import type { PushOutcome, RemoteSnapshot, SnapshotApi } from '../../src/cloud/remoteSnapshots';
import { CURRENT_SCHEMA_VERSION, decodeBackup, encodeBackup } from '../../src/store/persistence';
import { SAMPLE_ROUTINE_NAME } from '../../src/store/sampleData';
import { makeAppState, makeGoal, makeRoutine, makeRoutineBlock, makeTrackingEntry } from '../helpers/builders';

// docs/ITERATION-2-PLAN.md, decision 5: automatic when the answer is obvious, a question only when
// both sides hold data, and a saved copy before anything is replaced.

const USER = 'user-1';
const DEVICE = 'device-1';

const empty = () => makeAppState();
const mine = (name = 'Learn Spanish') =>
  makeAppState({ goals: [makeGoal({ id: `goal-${name}`, name })], trackingEntries: [makeTrackingEntry()] });
const exampleOnly = () =>
  makeAppState({
    routines: [makeRoutine({ name: SAMPLE_ROUTINE_NAME, blocks: [makeRoutineBlock()] })],
    goals: [makeGoal({ name: 'Ship the analytics dashboard' })],
  });

function fakeApp(initial: AppState) {
  let state = initial;
  const app: LocalApp & { current: () => AppState } = {
    current: () => state,
    getState: () => state,
    exportData: () => encodeBackup(state, '2026-09-19T08:00:00.000Z'),
    importData: vi.fn(async (serialized: string) => {
      try {
        state = decodeBackup(serialized);
        return { ok: true as const };
      } catch (error) {
        return { ok: false as const, error: (error as Error).message };
      }
    }),
    startFresh: vi.fn(async () => {
      state = { ...makeAppState(), preferences: state.preferences };
    }),
  };
  return app;
}

function fakeApi(remote: RemoteSnapshot | null, pushOutcome?: PushOutcome) {
  const pushes: { expected: number; data: unknown }[] = [];
  const api: SnapshotApi & { pushes: typeof pushes } = {
    pushes,
    fetch: vi.fn(async () => remote),
    push: vi.fn(async (expected: number, _schema: number, data: object): Promise<PushOutcome> => {
      pushes.push({ expected, data });
      return pushOutcome ?? { status: 'ok', revision: expected + 1, updatedAt: '2026-09-19T08:00:01.000Z' };
    }),
  };
  return api;
}

const remoteOf = (state: AppState, revision = 4): RemoteSnapshot => ({
  revision,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: JSON.parse(encodeBackup(state, '2026-09-18T20:00:00.000Z')),
  deviceId: 'other-device',
  updatedAt: '2026-09-18T20:00:00.000Z',
});

const never: Ask = vi.fn(async () => {
  throw new Error('should not ask');
});
const answer = (value: string | null): Ask => vi.fn(async () => value);

beforeEach(async () => {
  await AsyncStorage.removeItem(SYNC_META_KEY);
  await AsyncStorage.removeItem(SAVED_COPIES_KEY);
});

describe('first sign-in: account empty', () => {
  it('uploads this device without asking when it holds your data', async () => {
    const app = fakeApp(mine());
    const api = fakeApi(null);
    expect(await resolveFirstSignIn({ userId: USER, deviceId: DEVICE, api, app, ask: never })).toEqual({ kind: 'uploaded' });
    expect(api.pushes).toHaveLength(1);
    expect(api.pushes[0].expected).toBe(0);
    expect(decodeBackup(JSON.stringify(api.pushes[0].data)).goals.map((g) => g.name)).toEqual(['Learn Spanish']);
    expect(await readSyncMeta()).toMatchObject({ userId: USER, baseRevision: 1, syncedHash: contentHash(app.current()) });
  });

  it('uploads an empty device without asking', async () => {
    const api = fakeApi(null);
    expect(await resolveFirstSignIn({ userId: USER, deviceId: DEVICE, api, app: fakeApp(empty()), ask: never })).toEqual({ kind: 'uploaded' });
  });

  it('asks before uploading example data, and "start fresh" keeps the example data as a saved copy', async () => {
    const app = fakeApp(exampleOnly());
    const api = fakeApi(null);
    const ask = answer('fresh');
    expect(await resolveFirstSignIn({ userId: USER, deviceId: DEVICE, api, app, ask })).toEqual({ kind: 'uploaded' });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(app.startFresh).toHaveBeenCalled();
    expect(app.current().hasCompletedOnboarding).toBe(true);
    expect(classifyLocalData(decodeBackup(JSON.stringify(api.pushes[0].data)))).toBe('empty');
    const copies = await readSavedCopies();
    expect(copies).toHaveLength(1);
    expect(classifyLocalData(decodeBackup(copies[0].backup))).toBe('exampleOnly');
  });

  it('uploads the example data when that is the choice', async () => {
    const app = fakeApp(exampleOnly());
    const api = fakeApi(null);
    await resolveFirstSignIn({ userId: USER, deviceId: DEVICE, api, app, ask: answer('upload') });
    expect(classifyLocalData(decodeBackup(JSON.stringify(api.pushes[0].data)))).toBe('exampleOnly');
  });

  it('cancelling uploads nothing and changes nothing', async () => {
    const app = fakeApp(exampleOnly());
    const api = fakeApi(null);
    expect(await resolveFirstSignIn({ userId: USER, deviceId: DEVICE, api, app, ask: answer(null) })).toEqual({ kind: 'cancelled' });
    expect(api.pushes).toHaveLength(0);
    expect(classifyLocalData(app.current())).toBe('exampleOnly');
    expect(await readSyncMeta()).toBeNull();
  });

  it('reports a conflict instead of overwriting when another device got there first', async () => {
    const api = fakeApi(null, { status: 'conflict', revision: 1, updatedAt: '2026-09-19T08:00:00.000Z' });
    const result = await resolveFirstSignIn({ userId: USER, deviceId: DEVICE, api, app: fakeApp(mine()), ask: never });
    expect(result.kind).toBe('error');
    expect(await readSyncMeta()).toBeNull();
  });
});

describe('first sign-in: account has data', () => {
  it('downloads to an empty device without asking', async () => {
    const app = fakeApp(empty());
    const api = fakeApi(remoteOf(mine('From my iPhone'), 7));
    expect(await resolveFirstSignIn({ userId: USER, deviceId: DEVICE, api, app, ask: never })).toEqual({ kind: 'downloaded' });
    expect(app.current().goals.map((g) => g.name)).toEqual(['From my iPhone']);
    expect(api.pushes).toHaveLength(0);
    expect(await readSyncMeta()).toMatchObject({ baseRevision: 7 });
  });

  it('downloads over example data without asking, keeping the example data as a saved copy', async () => {
    const app = fakeApp(exampleOnly());
    const api = fakeApi(remoteOf(mine('Real goal')));
    expect(await resolveFirstSignIn({ userId: USER, deviceId: DEVICE, api, app, ask: never })).toEqual({ kind: 'downloaded' });
    expect(app.current().goals.map((g) => g.name)).toEqual(['Real goal']);
    expect(await readSavedCopies()).toHaveLength(1);
  });

  it('does nothing when both already hold the same data', async () => {
    const state = mine();
    const app = fakeApp(state);
    const api = fakeApi(remoteOf(state, 3));
    expect(await resolveFirstSignIn({ userId: USER, deviceId: DEVICE, api, app, ask: never })).toEqual({ kind: 'inSync' });
    expect(app.importData).not.toHaveBeenCalled();
    expect(api.pushes).toHaveLength(0);
    expect(await readSavedCopies()).toHaveLength(0);
  });

  it('does nothing when this device is known to be at the account revision already', async () => {
    const state = mine();
    const app = fakeApp(state);
    await writeSyncMeta({ userId: USER, baseRevision: 5, syncedHash: contentHash(state), syncedAt: 'x' });
    const api = fakeApi(remoteOf(mine('Different wording but same revision'), 5));
    expect(await resolveFirstSignIn({ userId: USER, deviceId: DEVICE, api, app, ask: never })).toEqual({ kind: 'inSync' });
  });

  it('asks when both hold different data; "use my account" keeps this device as a saved copy', async () => {
    const app = fakeApp(mine('On the iPad'));
    const api = fakeApi(remoteOf(mine('On the iPhone')));
    const ask = answer('account');
    expect(await resolveFirstSignIn({ userId: USER, deviceId: DEVICE, api, app, ask })).toEqual({ kind: 'downloaded' });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(app.current().goals.map((g) => g.name)).toEqual(['On the iPhone']);
    const copies = await readSavedCopies();
    expect(decodeBackup(copies[0].backup).goals.map((g) => g.name)).toEqual(['On the iPad']);
  });

  it('"replace my account" keeps the account\'s data as a saved copy and pushes against its revision', async () => {
    const app = fakeApp(mine('On the iPad'));
    const api = fakeApi(remoteOf(mine('On the iPhone'), 9));
    expect(await resolveFirstSignIn({ userId: USER, deviceId: DEVICE, api, app, ask: answer('device') })).toEqual({ kind: 'uploaded' });
    expect(api.pushes[0].expected).toBe(9);
    const copies = await readSavedCopies();
    expect(decodeBackup(copies[0].backup).goals.map((g) => g.name)).toEqual(['On the iPhone']);
    expect(await readSyncMeta()).toMatchObject({ baseRevision: 10 });
  });

  it('cancelling the question changes nothing on either side', async () => {
    const app = fakeApp(mine('On the iPad'));
    const api = fakeApi(remoteOf(mine('On the iPhone')));
    expect(await resolveFirstSignIn({ userId: USER, deviceId: DEVICE, api, app, ask: answer(null) })).toEqual({ kind: 'cancelled' });
    expect(app.importData).not.toHaveBeenCalled();
    expect(api.pushes).toHaveLength(0);
  });

  it('refuses account data written by a newer app version, changing nothing', async () => {
    const app = fakeApp(empty());
    const api = fakeApi({ ...remoteOf(mine()), schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
    const result = await resolveFirstSignIn({ userId: USER, deviceId: DEVICE, api, app, ask: never });
    expect(result).toMatchObject({ kind: 'error', message: expect.stringMatching(/newer version/) });
    expect(app.importData).not.toHaveBeenCalled();
  });

  it('refuses unreadable account data, changing nothing', async () => {
    const app = fakeApp(mine());
    const api = fakeApi({ ...remoteOf(mine()), data: { format: 'something else' } });
    const result = await resolveFirstSignIn({ userId: USER, deviceId: DEVICE, api, app, ask: never });
    expect(result).toMatchObject({ kind: 'error', message: expect.stringMatching(/couldn't be read/) });
    expect(app.current().goals.map((g) => g.name)).toEqual(['Learn Spanish']);
  });

  it('turns a network failure into an error, not a crash', async () => {
    const api: SnapshotApi = { fetch: async () => { throw new Error('Failed to fetch'); }, push: vi.fn() };
    const result = await resolveFirstSignIn({ userId: USER, deviceId: DEVICE, api, app: fakeApp(mine()), ask: never });
    expect(result.kind).toBe('error');
  });
});
