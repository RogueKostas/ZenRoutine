import { create } from 'zustand';
import { CURRENT_SCHEMA_VERSION, decodeBackup } from '../store/persistence';
import type { AppState } from '../core/types';
import { OFFLINE_MESSAGE } from './authErrors';
import type { Ask, LocalApp } from './firstSignIn';
import { contentHash, describeDifference, readSyncMeta, saveCopy, writeSyncMeta, type SyncMeta } from './localSync';
import { CloudError, type RemoteSnapshot, type SnapshotApi } from './remoteSnapshots';

/**
 * Automatic sync (docs/ITERATION-2-PLAN.md, decision 7): the newest version wins, and you are
 * asked only when it is genuinely ambiguous.
 *
 *   Catch up first: on launch, foreground, reconnect and a gentle poll, fetch the account's copy.
 *     - the account moved on and this device has no unsynced changes -> apply it, silently
 *     - this device changed and the account did not                  -> push, silently
 *     - both changed since they last agreed                          -> the one question
 *   Push fast: a second or two after each change, compare-and-swap on the revision this device
 *   last agreed with. A refused push means the account moved on meanwhile: catch up, and only
 *   then, if both really changed, ask.
 *
 * "Newest" is the server's order (revisions), never a device clock. Whatever loses the question
 * is kept as a saved copy. Remote data goes through the same strict read as a backup import.
 */

export type SyncPhase = 'off' | 'waiting' | 'syncing' | 'synced' | 'offline' | 'conflict' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  /** When this device and the account last agreed. */
  lastSyncedAt: string | null;
  /** For offline, conflict and error: a sentence to show. */
  message: string | null;
  /** A catch-up is running: the app is making sure it has the latest before you edit. */
  catchingUp: boolean;
}

export const useSyncStore = create<SyncStatus>(() => ({
  phase: 'off',
  lastSyncedAt: null,
  message: null,
  catchingUp: false,
}));

type SyncStorage = Parameters<typeof readSyncMeta>[0];

export interface SyncDeps {
  userId: string;
  deviceId: string;
  api: SnapshotApi;
  app: LocalApp;
  ask: Ask;
  now?: () => Date;
  /** Where this device keeps its sync bookkeeping and saved copies; defaults to AsyncStorage. */
  storage?: SyncStorage;
  /** Status sink; defaults to the shared store. Tests give each device its own. */
  setStatus?: (patch: Partial<SyncStatus>) => void;
}

const formatWhen = (iso: string | null | undefined) => {
  if (!iso) return 'earlier';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'earlier'
    : date.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export class SyncEngine {
  private queue: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private readonly now: () => Date;
  private readonly setStatus: (patch: Partial<SyncStatus>) => void;

  constructor(private readonly deps: SyncDeps) {
    this.now = deps.now ?? (() => new Date());
    this.setStatus = deps.setStatus ?? ((patch) => useSyncStore.setState(patch));
  }

  stop(): void {
    this.stopped = true;
  }

  /** Fetch the account's copy and reconcile. Serialised with every other sync step. */
  catchUp(): Promise<void> {
    return this.enqueue(async () => {
      this.setStatus({ catchingUp: true });
      try {
        await this.reconcile();
      } finally {
        this.setStatus({ catchingUp: false });
      }
    });
  }

  /** Push this device's changes, if it has any. */
  push(): Promise<void> {
    return this.enqueue(() => this.pushChanges());
  }

  /** Ask again about a conflict the user postponed. */
  resolveConflict(): Promise<void> {
    return this.catchUp();
  }

  // -------------------------------------------------------------------------------------------

  private enqueue(step: () => Promise<void>): Promise<void> {
    const run = this.queue.then(async () => {
      if (this.stopped) return;
      try {
        await step();
      } catch (error) {
        this.fail(error);
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (message === OFFLINE_MESSAGE) {
      this.setStatus({ phase: 'offline', message: 'Offline. Changes are saved on this device and will sync when you reconnect.' });
    } else {
      this.setStatus({ phase: 'error', message: error instanceof CloudError ? message : `Sync stopped: ${message}` });
    }
  }

  /** This device's bookkeeping, if it belongs to the signed-in account. Otherwise first sign-in hasn't finished. */
  private async meta(): Promise<SyncMeta | null> {
    const meta = await readSyncMeta(this.deps.storage);
    if (!meta || meta.userId !== this.deps.userId) {
      this.setStatus({ phase: 'waiting', message: null });
      return null;
    }
    return meta;
  }

  private async agree(revision: number, hash: string): Promise<void> {
    const syncedAt = this.now().toISOString();
    await writeSyncMeta({ userId: this.deps.userId, baseRevision: revision, syncedHash: hash, syncedAt }, this.deps.storage);
    this.setStatus({ phase: 'synced', lastSyncedAt: syncedAt, message: null });
  }

  private async pushChanges(): Promise<void> {
    const meta = await this.meta();
    if (!meta) return;
    const { app, api, deviceId } = this.deps;
    // Export and fingerprint the same moment's state, so edits made while the push is in flight
    // stay unsynced rather than being marked as sent.
    const state = app.getState();
    const hash = contentHash(state);
    if (hash === meta.syncedHash) return;
    this.setStatus({ phase: 'syncing' });
    const outcome = await api.push(meta.baseRevision, CURRENT_SCHEMA_VERSION, JSON.parse(app.exportData()) as object, deviceId);
    if (outcome.status === 'ok') {
      await this.agree(outcome.revision, hash);
      return;
    }
    // The account moved on since this device last agreed with it. Catch up; ask only if both changed.
    await this.reconcile();
  }

  private readRemote(remote: RemoteSnapshot): { state: AppState; serialized: string } {
    if (remote.schemaVersion > CURRENT_SCHEMA_VERSION) {
      throw new CloudError(
        'Your account was updated by a newer version of ZenRoutine. Reload the app to get the latest version; nothing on this device was changed.'
      );
    }
    const serialized = JSON.stringify(remote.data);
    try {
      return { state: decodeBackup(serialized), serialized };
    } catch (error) {
      throw new CloudError(
        `Your account's copy couldn't be read (${error instanceof Error ? error.message : 'unknown problem'}). Nothing on this device was changed.`
      );
    }
  }

  private async reconcile(): Promise<void> {
    const meta = await this.meta();
    if (!meta) return;
    const { app, api, deviceId } = this.deps;
    const remote = await api.fetch();
    const local = app.getState();
    const localHash = contentHash(local);
    const dirty = localHash !== meta.syncedHash;

    if (!remote) {
      // The account's copy is gone (deleted elsewhere): this device still has the data, so it
      // becomes the account's copy again.
      this.setStatus({ phase: 'syncing' });
      const outcome = await api.push(0, CURRENT_SCHEMA_VERSION, JSON.parse(app.exportData()) as object, deviceId);
      if (outcome.status === 'ok') await this.agree(outcome.revision, localHash);
      return;
    }

    if (remote.revision === meta.baseRevision) {
      if (dirty) {
        await this.pushChanges();
      } else {
        this.setStatus({ phase: 'synced', lastSyncedAt: meta.syncedAt, message: null });
      }
      return;
    }

    // The account has moved on.
    const read = this.readRemote(remote);
    if (contentHash(read.state) === localHash) {
      await this.agree(remote.revision, localHash);
      return;
    }
    if (!dirty) {
      await this.apply(read.serialized, remote.revision);
      return;
    }
    await this.askWhichToKeep(meta, remote, read, local);
  }

  private async apply(serialized: string, revision: number): Promise<void> {
    const imported = await this.deps.app.importData(serialized);
    if (!imported.ok) {
      throw new CloudError(`Your account's copy couldn't be applied: ${imported.error} Nothing on this device was changed.`);
    }
    await this.agree(revision, contentHash(this.deps.app.getState()));
  }

  private async askWhichToKeep(
    meta: SyncMeta,
    remote: RemoteSnapshot,
    read: { state: AppState; serialized: string },
    local: AppState
  ): Promise<void> {
    const { app, api, deviceId, ask } = this.deps;
    this.setStatus({ phase: 'conflict', message: 'Both this device and another one changed while apart. Choose which version to keep.' });
    const diff = describeDifference(local, read.state);
    const choice = await ask({
      title: 'Which version do you want to keep?',
      message:
        `This device and another one both changed while they couldn't reach each other.\n\n` +
        `This device ${diff.mine} (changed since ${formatWhen(meta.syncedAt)}).\n` +
        `Your other device ${diff.theirs} (saved ${formatWhen(remote.updatedAt)}).\n\n` +
        `The version you don't choose is kept as a saved copy on this device (Settings → Account).`,
      options: [
        { label: "Use my other device's version", value: 'remote' },
        { label: "Keep this device's version", value: 'local' },
      ],
      cancelLabel: 'Decide later',
    });
    if (choice === null) return; // stays in 'conflict'; nothing changed on either side
    if (choice === 'remote') {
      await saveCopy(app.exportData(), "This device's version, replaced by your other device's", this.deps.storage);
      await this.apply(read.serialized, remote.revision);
      return;
    }
    await saveCopy(read.serialized, "Your other device's version, replaced by this device's", this.deps.storage);
    const state = app.getState();
    const hash = contentHash(state);
    this.setStatus({ phase: 'syncing' });
    const outcome = await api.push(remote.revision, CURRENT_SCHEMA_VERSION, JSON.parse(app.exportData()) as object, deviceId);
    if (outcome.status === 'ok') {
      await this.agree(outcome.revision, hash);
      return;
    }
    // Moved again while you were choosing: start over from the newest copy.
    await this.reconcile();
  }
}

/** The one line shown in Settings and on the Account screen. */
export function describeSyncStatus(status: SyncStatus, now: Date): string {
  switch (status.phase) {
    case 'off':
      return 'Sync is off.';
    case 'waiting':
      return 'Getting ready to sync…';
    case 'syncing':
      return 'Syncing…';
    case 'offline':
    case 'conflict':
    case 'error':
      return status.message ?? 'Sync needs attention.';
    case 'synced': {
      if (!status.lastSyncedAt) return 'Synced.';
      const at = new Date(status.lastSyncedAt);
      const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
      if (Number.isNaN(minutes) || minutes < 1) return 'Synced just now.';
      if (minutes < 60) return `Synced ${minutes} min ago.`;
      return `Synced at ${at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.`;
    }
  }
}
