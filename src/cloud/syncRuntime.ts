import { AppState as RNAppState, type AppStateStatus } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAppStore } from '../store';
import { createInitialState, encodeBackup } from '../store/persistence';
import type { Ask, LocalApp } from './firstSignIn';
import { getDeviceId } from './localSync';
import { supabaseSnapshotApi } from './remoteSnapshots';
import { SyncEngine, useSyncStore } from './syncEngine';

/**
 * When sync runs (docs/ITERATION-2-PLAN.md, "How data will sync"):
 * - catch up on start, whenever the app comes back to the foreground, when the network returns,
 *   and every POLL_MS while it is open, so another device's changes arrive without asking;
 * - push PUSH_DELAY_MS after the last local change.
 */
export const PUSH_DELAY_MS = 1500;
export const POLL_MS = 30_000;

/** The app store as the sync code sees it. Shared with the Account screen's first sign-in. */
export const storeApp: LocalApp = {
  getState: () => useAppStore.getState(),
  exportData: () => useAppStore.getState().exportData(),
  importData: (serialized) => useAppStore.getState().importData(serialized),
  startFresh: async () => {
    const current = useAppStore.getState();
    const fresh = { ...createInitialState(), hasCompletedOnboarding: true, preferences: current.preferences };
    const result = await current.importData(encodeBackup(fresh));
    if (!result.ok) throw new Error(result.error);
  },
};

let engine: SyncEngine | null = null;
let teardown: (() => void) | null = null;
let runningFor: string | null = null;

export async function startSync(options: { userId: string; client: SupabaseClient; ask: Ask }): Promise<void> {
  if (runningFor === options.userId && engine) return;
  stopSync();
  runningFor = options.userId;
  const deviceId = await getDeviceId();
  if (runningFor !== options.userId) return; // stopped or restarted while waiting

  const current = new SyncEngine({
    userId: options.userId,
    deviceId,
    api: supabaseSnapshotApi(options.client, options.userId),
    app: storeApp,
    ask: options.ask,
  });
  engine = current;

  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribeStore = useAppStore.subscribe(() => {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void current.push(), PUSH_DELAY_MS);
  });

  let appState: AppStateStatus = RNAppState.currentState;
  const appStateSub = RNAppState.addEventListener('change', (next) => {
    const cameBack = appState !== 'active' && next === 'active';
    appState = next;
    if (cameBack) void current.catchUp();
  });

  const onOnline = () => void current.catchUp();
  const win = (globalThis as { addEventListener?: Window['addEventListener']; removeEventListener?: Window['removeEventListener'] });
  win.addEventListener?.('online', onOnline);

  const poll = setInterval(() => {
    const phase = useSyncStore.getState().phase;
    if (appState === 'active' && phase !== 'conflict' && phase !== 'error') void current.catchUp();
  }, POLL_MS);

  teardown = () => {
    current.stop();
    unsubscribeStore();
    appStateSub.remove();
    win.removeEventListener?.('online', onOnline);
    clearInterval(poll);
    if (pushTimer) clearTimeout(pushTimer);
  };

  await current.catchUp();
}

export function stopSync(): void {
  teardown?.();
  teardown = null;
  engine = null;
  runningFor = null;
  useSyncStore.setState({ phase: 'off', message: null, catchingUp: false, lastSyncedAt: null });
}

/** Catch up now: after first sign-in finishes, or when the user taps "Sync now" / "Resolve". */
export function syncNow(): Promise<void> {
  return engine ? engine.catchUp() : Promise.resolve();
}

/** Push anything unsynced right away (before signing out). */
export function flushSync(): Promise<void> {
  return engine ? engine.push() : Promise.resolve();
}
