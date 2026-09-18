import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppState } from '../core/types';
import { selectPersistedAppState } from '../store/persistence';
import { SAMPLE_GOAL_NAMES, SAMPLE_ROUTINE_NAME } from '../store/sampleData';

/**
 * What this device remembers about syncing, kept apart from the app's own data so that a backup,
 * an import or a snapshot never carries it (docs/ITERATION-2-PLAN.md, "How data will sync").
 */
export const DEVICE_ID_KEY = 'zenroutine-device-id';
export const SYNC_META_KEY = 'zenroutine-sync';
export const SAVED_COPIES_KEY = 'zenroutine-saved-copies';

/** How many replaced versions are kept. Each is a whole backup, so the list is capped. */
export const MAX_SAVED_COPIES = 10;

export interface SyncMeta {
  /** The account this device last agreed with. */
  userId: string;
  /** The account revision this device's data was last equal to. */
  baseRevision: number;
  /** contentHash() of the data at that moment: anything different is an unsynced change. */
  syncedHash: string;
  syncedAt: string;
}

export interface SavedCopy {
  id: string;
  savedAt: string;
  /** Why it was kept, in words shown to the user. */
  reason: string;
  /** An encodeBackup() string, restorable with the existing Import. */
  backup: string;
}

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;

// ---------------------------------------------------------------------------------------------
// Content identity

/** JSON with object keys sorted at every level, so equal data always serialises identically. */
export function canonicalStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(',')}}`;
}

/**
 * A fingerprint of the user's data: equal data, equal hash, whatever the key order. `lastSyncedAt`
 * is left out because it is bookkeeping, not data. FNV-1a over UTF-16 code units, twice with
 * different seeds, is plenty for "has this changed?" and needs no crypto library.
 */
export function contentHash(state: AppState): string {
  const { lastSyncedAt: _ignored, ...data } = selectPersistedAppState(state);
  const text = canonicalStringify(data);
  const fnv = (seed: number) => {
    let hash = seed >>> 0;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  };
  return `${fnv(0x811c9dc5)}${fnv(0x01000193)}`;
}

// ---------------------------------------------------------------------------------------------
// What is on this device

export type LocalDataKind = 'empty' | 'exampleOnly' | 'userData';

/**
 * - empty: nothing of the user's (no goals, no scheduled blocks, no tracking).
 * - exampleOnly: only the example week and its example goals.
 * - userData: anything else, including example data mixed with the user's own.
 */
export function classifyLocalData(state: Pick<AppState, 'goals' | 'routines' | 'trackingEntries'>): LocalDataKind {
  const hasBlocks = state.routines.some((routine) => routine.blocks.length > 0);
  if (state.goals.length === 0 && state.trackingEntries.length === 0 && !hasBlocks) return 'empty';
  const sampleGoals = new Set(SAMPLE_GOAL_NAMES);
  const onlySampleRoutines = state.routines.every(
    (routine) => routine.name === SAMPLE_ROUTINE_NAME || routine.blocks.length === 0
  );
  const hasSampleRoutine = state.routines.some((routine) => routine.name === SAMPLE_ROUTINE_NAME);
  const onlySampleGoals = state.goals.every((goal) => sampleGoals.has(goal.name));
  return hasSampleRoutine && onlySampleRoutines && onlySampleGoals ? 'exampleOnly' : 'userData';
}

/** "3 goals, 41 time entries": what a version holds, for the choice dialogs. */
export function describeData(state: Pick<AppState, 'goals' | 'trackingEntries'>): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return `${plural(state.goals.length, 'goal', 'goals')}, ${plural(state.trackingEntries.length, 'time entry', 'time entries')}`;
}

// ---------------------------------------------------------------------------------------------
// Device id and sync bookkeeping

function randomId(): string {
  const bytes = new Uint8Array(16);
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getDeviceId(storage: Storage = AsyncStorage): Promise<string> {
  const existing = await storage.getItem(DEVICE_ID_KEY);
  if (existing && /^[0-9a-f]{32}$/.test(existing)) return existing;
  const id = randomId();
  await storage.setItem(DEVICE_ID_KEY, id);
  return id;
}

function isSyncMeta(value: unknown): value is SyncMeta {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.userId === 'string' &&
    typeof v.baseRevision === 'number' &&
    Number.isInteger(v.baseRevision) &&
    v.baseRevision >= 0 &&
    typeof v.syncedHash === 'string' &&
    typeof v.syncedAt === 'string'
  );
}

/** Unreadable bookkeeping reads as "never synced", which is always the safe direction. */
export async function readSyncMeta(storage: Storage = AsyncStorage): Promise<SyncMeta | null> {
  try {
    const raw = await storage.getItem(SYNC_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isSyncMeta(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeSyncMeta(meta: SyncMeta, storage: Storage = AsyncStorage): Promise<void> {
  await storage.setItem(SYNC_META_KEY, JSON.stringify(meta));
}

export async function clearSyncMeta(storage: Storage = AsyncStorage): Promise<void> {
  await storage.removeItem(SYNC_META_KEY);
}

// ---------------------------------------------------------------------------------------------
// Saved copies: every version that gets replaced is kept first

function isSavedCopy(value: unknown): value is SavedCopy {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.savedAt === 'string' && typeof v.reason === 'string' && typeof v.backup === 'string';
}

export async function readSavedCopies(storage: Storage = AsyncStorage): Promise<SavedCopy[]> {
  try {
    const raw = await storage.getItem(SAVED_COPIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isSavedCopy) : [];
  } catch {
    return [];
  }
}

/**
 * Keeps `backup` before it is replaced. Newest first; the oldest drop off past MAX_SAVED_COPIES.
 * Throws if the copy cannot be written, so a caller never replaces data it failed to keep.
 */
export async function saveCopy(
  backup: string,
  reason: string,
  storage: Storage = AsyncStorage,
  now: Date = new Date()
): Promise<SavedCopy> {
  const copy: SavedCopy = { id: randomId(), savedAt: now.toISOString(), reason, backup };
  const copies = [copy, ...(await readSavedCopies(storage))].slice(0, MAX_SAVED_COPIES);
  await storage.setItem(SAVED_COPIES_KEY, JSON.stringify(copies));
  return copy;
}
