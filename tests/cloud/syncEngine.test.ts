import { describe, expect, it, vi } from 'vitest';
import type { AppState } from '../../src/core/types';
import { OFFLINE_MESSAGE } from '../../src/cloud/authErrors';
import type { Ask, LocalApp } from '../../src/cloud/firstSignIn';
import { contentHash, readSavedCopies, readSyncMeta, writeSyncMeta } from '../../src/cloud/localSync';
import { CloudError, type PushOutcome, type RemoteSnapshot, type SnapshotApi } from '../../src/cloud/remoteSnapshots';
import { describeSyncStatus, SyncEngine, type SyncStatus } from '../../src/cloud/syncEngine';
import { CURRENT_SCHEMA_VERSION, decodeBackup, encodeBackup } from '../../src/store/persistence';
import { makeAppState, makeGoal, makeTrackingEntry } from '../helpers/builders';

// docs/ITERATION-2-PLAN.md, decision 7: automatic, newest wins, and a question only when both
// sides changed since they last agreed. Two simulated devices share one account on a fake server
// with the real server's compare-and-swap rule (supabase/migrations/…_snapshots.sql).

const USER = 'user-1';

class FakeServer implements SnapshotApi {
  row: RemoteSnapshot | null = null;
  online = true;
  pushes = 0;
  private tick = 0;

  private stamp() {
    this.tick += 1;
    return new Date(Date.UTC(2026, 8, 19, 9, 0, this.tick)).toISOString();
  }

  async fetch() {
    if (!this.online) throw new CloudError(OFFLINE_MESSAGE);
    return this.row ? structuredClone(this.row) : null;
  }

  async push(expected: number, schemaVersion: number, data: object, deviceId: string): Promise<PushOutcome> {
    if (!this.online) throw new CloudError(OFFLINE_MESSAGE);
    const current = this.row?.revision ?? 0;
    if (expected !== current) return { status: 'conflict', revision: this.row?.revision ?? null, updatedAt: this.row?.updatedAt ?? null };
    this.pushes += 1;
    this.row = { revision: current + 1, schemaVersion, data: structuredClone(data), deviceId, updatedAt: this.stamp() };
    return { status: 'ok', revision: this.row.revision, updatedAt: this.row.updatedAt };
  }
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => void values.set(key, value),
    removeItem: async (key: string) => void values.delete(key),
  };
}

function device(server: FakeServer, name: string, initial: AppState, ask: Ask = vi.fn(async () => null)) {
  let state = initial;
  const storage = memoryStorage();
  const status: SyncStatus = { phase: 'off', lastSyncedAt: null, message: null, catchingUp: false };
  const app: LocalApp = {
    getState: () => state,
    exportData: () => encodeBackup(state, '2026-09-19T09:00:00.000Z'),
    importData: vi.fn(async (serialized: string) => {
      state = decodeBackup(serialized);
      return { ok: true as const };
    }),
    startFresh: async () => undefined,
  };
  const engine = new SyncEngine({
    userId: USER,
    deviceId: name,
    api: server,
    app,
    ask,
    storage: storage as never,
    setStatus: (patch) => Object.assign(status, patch),
  });
  return {
    engine,
    app,
    storage,
    status,
    ask,
    get state() {
      return state;
    },
    goals: () => state.goals.map((g) => g.name),
    edit: (change: (s: AppState) => AppState) => {
      state = change(state);
    },
    /** As if first sign-in had just finished at the account's current revision. */
    agreeWith: async () => {
      await writeSyncMeta(
        { userId: USER, baseRevision: server.row?.revision ?? 0, syncedHash: contentHash(state), syncedAt: '2026-09-19T08:00:00.000Z' },
        storage as never
      );
    },
  };
}

const addGoal = (name: string) => (s: AppState): AppState => ({
  ...s,
  goals: [...s.goals, makeGoal({ id: `goal-${name}`, name, order: s.goals.length })],
});

/** Account and both devices start in agreement on `initial`. */
async function pair(initial = makeAppState(), askA?: Ask, askB?: Ask) {
  const server = new FakeServer();
  await server.push(0, CURRENT_SCHEMA_VERSION, JSON.parse(encodeBackup(initial)), 'setup');
  const a = device(server, 'iphone', initial, askA);
  const b = device(server, 'ipad', initial, askB);
  await a.agreeWith();
  await b.agreeWith();
  return { server, a, b };
}

describe('the normal case never asks', () => {
  it('an edit on one device reaches the other on its next catch-up', async () => {
    const { server, a, b } = await pair();
    a.edit(addGoal('Learn Spanish'));
    await a.engine.push();
    expect(server.row?.revision).toBe(2);
    expect(a.status.phase).toBe('synced');

    await b.engine.catchUp();
    expect(b.goals()).toEqual(['Learn Spanish']);
    expect(b.status.phase).toBe('synced');
    expect(a.ask).not.toHaveBeenCalled();
    expect(b.ask).not.toHaveBeenCalled();
  });

  it('edits back and forth, catching up before each edit, never ask and never lose anything', async () => {
    const { a, b } = await pair();
    for (let i = 0; i < 6; i++) {
      const [writer, reader] = i % 2 === 0 ? [a, b] : [b, a];
      await writer.engine.catchUp();
      writer.edit(addGoal(`goal ${i}`));
      await writer.engine.push();
      await reader.engine.catchUp();
    }
    const expected = ['goal 0', 'goal 1', 'goal 2', 'goal 3', 'goal 4', 'goal 5'];
    expect(a.goals()).toEqual(expected);
    expect(b.goals()).toEqual(expected);
    expect(a.ask).not.toHaveBeenCalled();
    expect(b.ask).not.toHaveBeenCalled();
  });

  it('a timer started on one device is running on the other after it catches up', async () => {
    const { a, b } = await pair();
    const running = makeTrackingEntry({ id: 'running', endTime: undefined });
    a.edit((s) => ({ ...s, trackingEntries: [running], currentTrackingEntryId: 'running' }));
    await a.engine.push();
    await b.engine.catchUp();
    expect(b.state.currentTrackingEntryId).toBe('running');
    expect(b.state.trackingEntries[0].endTime).toBeUndefined();
  });

  it('nothing to send means nothing is sent', async () => {
    const { server, a } = await pair();
    await a.engine.push();
    await a.engine.catchUp();
    expect(server.pushes).toBe(1); // the setup push only
  });

  it('identical changes on both devices agree without asking', async () => {
    const { a, b } = await pair();
    a.edit(addGoal('Same'));
    b.edit(addGoal('Same'));
    await a.engine.push();
    await b.engine.catchUp();
    expect(b.ask).not.toHaveBeenCalled();
    expect((await readSyncMeta(b.storage as never))?.baseRevision).toBe(2);
  });
});

describe('offline', () => {
  it('keeps changes on the device, says so, and sends them when the connection returns', async () => {
    const { server, a, b } = await pair();
    server.online = false;
    a.edit(addGoal('Written on the train'));
    await a.engine.push();
    expect(a.status.phase).toBe('offline');
    expect(a.status.message).toMatch(/saved on this device/);

    server.online = true;
    await a.engine.catchUp();
    expect(a.status.phase).toBe('synced');
    await b.engine.catchUp();
    expect(b.goals()).toEqual(['Written on the train']);
  });
});

describe('the only question: both changed while apart', () => {
  async function bothEditedOffline(askB: Ask) {
    const ctx = await pair(makeAppState(), undefined, askB);
    ctx.server.online = false;
    ctx.a.edit(addGoal('iPhone goal'));
    ctx.b.edit(addGoal('iPad goal'));
    ctx.server.online = true;
    await ctx.a.engine.push(); // the iPhone reconnects first: nothing to argue with, so it just sends
    await ctx.b.engine.catchUp(); // the iPad reconnects: both changed
    return ctx;
  }

  it('asks once, and "use my other device\'s version" keeps this device\'s as a saved copy', async () => {
    const ask = vi.fn(async () => 'remote');
    const { a, b } = await bothEditedOffline(ask);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(a.ask).not.toHaveBeenCalled();
    expect(b.goals()).toEqual(['iPhone goal']);
    const copies = await readSavedCopies(b.storage as never);
    expect(decodeBackup(copies[0].backup).goals.map((g) => g.name)).toEqual(['iPad goal']);
    expect(b.status.phase).toBe('synced');
  });

  it('"keep this device\'s version" wins on the account, and the other device then follows silently', async () => {
    const ask = vi.fn(async () => 'local');
    const { server, a, b } = await bothEditedOffline(ask);
    expect(decodeBackup(JSON.stringify(server.row?.data)).goals.map((g) => g.name)).toEqual(['iPad goal']);
    const copies = await readSavedCopies(b.storage as never);
    expect(decodeBackup(copies[0].backup).goals.map((g) => g.name)).toEqual(['iPhone goal']);

    await a.engine.catchUp();
    expect(a.goals()).toEqual(['iPad goal']);
    expect(a.ask).not.toHaveBeenCalled();
  });

  it('"decide later" changes nothing on either side and waits, then asks again on request', async () => {
    const later = vi.fn(async () => null);
    const { server, b } = await bothEditedOffline(later);
    expect(b.goals()).toEqual(['iPad goal']);
    expect(decodeBackup(JSON.stringify(server.row?.data)).goals.map((g) => g.name)).toEqual(['iPhone goal']);
    expect(b.status.phase).toBe('conflict');

    (later as ReturnType<typeof vi.fn>).mockResolvedValueOnce('remote');
    await b.engine.resolveConflict();
    expect(b.goals()).toEqual(['iPhone goal']);
  });

  it('a push refused because the account moved on meanwhile leads to the same single question', async () => {
    const ask = vi.fn(async () => 'remote');
    const { a, b } = await pair(makeAppState(), undefined, ask);
    a.edit(addGoal('first'));
    b.edit(addGoal('second'));
    await a.engine.push();
    await b.engine.push(); // refused by compare-and-swap -> catch up -> both changed -> ask
    expect(ask).toHaveBeenCalledTimes(1);
    expect(b.goals()).toEqual(['first']);
  });
});

describe('what sync refuses to do', () => {
  it('never applies account data written by a newer app version, and never pushes over it', async () => {
    const { server, b } = await pair();
    server.row = { ...server.row!, revision: 5, schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    const before = b.state;
    await b.engine.catchUp();
    expect(b.status.phase).toBe('error');
    expect(b.status.message).toMatch(/newer version/);
    expect(b.state).toBe(before);
    expect(server.row.revision).toBe(5);
  });

  it('never applies unreadable account data', async () => {
    const { server, b } = await pair();
    server.row = { ...server.row!, revision: 2, data: { format: 'not a backup' } };
    await b.engine.catchUp();
    expect(b.status.phase).toBe('error');
    expect(b.app.importData).not.toHaveBeenCalled();
  });

  it('does nothing until first sign-in has recorded which account this device follows', async () => {
    const server = new FakeServer();
    const d = device(server, 'fresh', makeAppState({ goals: [makeGoal()] }));
    await d.engine.catchUp();
    await d.engine.push();
    expect(d.status.phase).toBe('waiting');
    expect(server.pushes).toBe(0);
  });

  it('stops completely once stopped (signed out)', async () => {
    const { server, a } = await pair();
    a.engine.stop();
    a.edit(addGoal('after sign-out'));
    await a.engine.push();
    expect(server.row?.revision).toBe(1);
  });
});

describe('describeSyncStatus', () => {
  const at = (iso: string | null, phase: SyncStatus['phase'] = 'synced', message: string | null = null): SyncStatus => ({
    phase,
    lastSyncedAt: iso,
    message,
    catchingUp: false,
  });
  const now = new Date('2026-09-19T10:00:00.000Z');

  it('reads naturally', () => {
    expect(describeSyncStatus(at('2026-09-19T09:59:40.000Z'), now)).toBe('Synced just now.');
    expect(describeSyncStatus(at('2026-09-19T09:48:00.000Z'), now)).toBe('Synced 12 min ago.');
    expect(describeSyncStatus(at('2026-09-19T07:00:00.000Z'), now)).toMatch(/^Synced at /);
    expect(describeSyncStatus(at(null, 'offline', 'Offline. Changes are saved on this device.'), now)).toMatch(/Offline/);
    expect(describeSyncStatus(at(null, 'syncing'), now)).toBe('Syncing…');
  });
});
