import type { AppState } from '../core/types';
import type { ChooseRequest } from '../components/common/dialogQueue';
import { CURRENT_SCHEMA_VERSION, decodeBackup } from '../store/persistence';
import {
  classifyLocalData,
  contentHash,
  describeData,
  readSyncMeta,
  saveCopy,
  writeSyncMeta,
} from './localSync';
import { CloudError, type RemoteSnapshot, type SnapshotApi } from './remoteSnapshots';

/**
 * What happens the moment you sign in on a device (docs/ITERATION-2-PLAN.md, decision 5):
 * automatic whenever the answer is obvious, a question only when it is not.
 *
 *   account empty + device empty or your data  -> upload
 *   account empty + device has example data   -> ask: upload it, or start fresh
 *   account has data + device empty            -> download
 *   account has data + device has example data -> keep the example data aside, download
 *   account has data + device has your data    -> same data: nothing; different: ask
 *
 * Nothing is ever replaced without a saved copy first (see localSync.saveCopy).
 */

/** The parts of the app store this needs. The real store satisfies it; tests pass a fake. */
export interface LocalApp {
  getState(): AppState;
  exportData(): string;
  importData(serialized: string): Promise<{ ok: true } | { ok: false; error: string }>;
  /** Replace the data with an empty set in one step, keeping preferences and skipping onboarding. */
  startFresh(): Promise<void>;
}

export type Ask = (request: Omit<ChooseRequest, 'kind'>) => Promise<string | null>;

export type FirstSignInResult =
  | { kind: 'uploaded' | 'downloaded' | 'inSync' }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

interface Deps {
  userId: string;
  deviceId: string;
  api: SnapshotApi;
  app: LocalApp;
  ask: Ask;
  now?: () => Date;
}

const formatWhen = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'earlier'
    : date.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/** Reads the account's data through the same strict validation and migration as a backup import. */
function readRemote(remote: RemoteSnapshot): { ok: true; state: AppState; serialized: string } | { ok: false; message: string } {
  if (remote.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      message:
        'Your account was saved by a newer version of ZenRoutine. Reload the app to update it, then sign in again.',
    };
  }
  const serialized = JSON.stringify(remote.data);
  try {
    return { ok: true, state: decodeBackup(serialized), serialized };
  } catch (error) {
    return {
      ok: false,
      message: `Your account's data couldn't be read (${error instanceof Error ? error.message : 'unknown problem'}). Nothing on this device was changed.`,
    };
  }
}

export async function resolveFirstSignIn(deps: Deps): Promise<FirstSignInResult> {
  const { userId, deviceId, api, app, ask } = deps;
  const now = deps.now ?? (() => new Date());

  const remember = async (revision: number) =>
    writeSyncMeta({ userId, baseRevision: revision, syncedHash: contentHash(app.getState()), syncedAt: now().toISOString() });

  const upload = async (expectedRevision: number): Promise<FirstSignInResult> => {
    const outcome = await api.push(expectedRevision, CURRENT_SCHEMA_VERSION, JSON.parse(app.exportData()) as object, deviceId);
    if (outcome.status === 'conflict') {
      return {
        kind: 'error',
        message: 'Your account changed on another device just now. Nothing was overwritten. Sign in again to pick it up.',
      };
    }
    await remember(outcome.revision);
    return { kind: 'uploaded' };
  };

  const download = async (remote: RemoteSnapshot, serialized: string): Promise<FirstSignInResult> => {
    const imported = await app.importData(serialized);
    if (!imported.ok) {
      return { kind: 'error', message: `Your account's data couldn't be applied: ${imported.error} Nothing on this device was changed.` };
    }
    await remember(remote.revision);
    return { kind: 'downloaded' };
  };

  try {
    const remote = await api.fetch();
    const local = app.getState();
    const localKind = classifyLocalData(local);

    if (!remote) {
      if (localKind !== 'exampleOnly') return await upload(0);
      const choice = await ask({
        title: 'Upload the example data?',
        message:
          'This device only has the example week. Upload it to your account, or start your account empty? The example data will be kept as a saved copy either way.',
        options: [
          { label: 'Start with an empty account', value: 'fresh' },
          { label: 'Upload the example data', value: 'upload' },
        ],
        cancelLabel: 'Cancel and sign out',
      });
      if (choice === null) return { kind: 'cancelled' };
      if (choice === 'fresh') {
        await saveCopy(app.exportData(), 'Example data on this device, before starting a fresh account');
        await app.startFresh();
      }
      return await upload(0);
    }

    const read = readRemote(remote);
    if (!read.ok) return { kind: 'error', message: read.message };

    const meta = await readSyncMeta();
    const localHash = contentHash(local);
    if (localHash === contentHash(read.state) || (meta?.userId === userId && meta.baseRevision === remote.revision && meta.syncedHash === localHash)) {
      await remember(remote.revision);
      return { kind: 'inSync' };
    }

    if (localKind === 'empty') return await download(remote, read.serialized);
    if (localKind === 'exampleOnly') {
      await saveCopy(app.exportData(), 'Example data on this device, before your account was downloaded');
      return await download(remote, read.serialized);
    }

    const choice = await ask({
      title: 'Your account already has data',
      message: `Your account: ${describeData(read.state)}, saved ${formatWhen(remote.updatedAt)}.\nThis device: ${describeData(local)}.\n\nWhich do you want to keep? The other one is kept as a saved copy on this device.`,
      options: [
        { label: "Use my account's data", value: 'account' },
        { label: "Replace my account with this device's data", value: 'device' },
      ],
      cancelLabel: 'Cancel and sign out',
    });
    if (choice === null) return { kind: 'cancelled' };
    if (choice === 'account') {
      await saveCopy(app.exportData(), "This device's data, before switching to your account's");
      return await download(remote, read.serialized);
    }
    await saveCopy(read.serialized, "Your account's data, before this device replaced it");
    return await upload(remote.revision);
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof CloudError ? error.message : `Something went wrong: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
