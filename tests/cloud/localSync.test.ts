import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  canonicalStringify,
  classifyLocalData,
  contentHash,
  describeData,
  DEVICE_ID_KEY,
  getDeviceId,
  MAX_SAVED_COPIES,
  readSavedCopies,
  readSyncMeta,
  SAVED_COPIES_KEY,
  saveCopy,
  SYNC_META_KEY,
  writeSyncMeta,
} from '../../src/cloud/localSync';
import { SAMPLE_ROUTINE_NAME } from '../../src/store/sampleData';
import { makeAppState, makeGoal, makeRoutine, makeRoutineBlock, makeTrackingEntry } from '../helpers/builders';

beforeEach(async () => {
  for (const key of [DEVICE_ID_KEY, SYNC_META_KEY, SAVED_COPIES_KEY]) await AsyncStorage.removeItem(key);
});

describe('contentHash', () => {
  it('ignores key order at every level', () => {
    expect(canonicalStringify({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: 2 } })).toBe(
      canonicalStringify({ a: { c: 2, d: [1, { y: 2, z: 1 }] }, b: 1 })
    );
  });

  it('is equal for equal data and different when anything changes', () => {
    const a = makeAppState({ goals: [makeGoal()] });
    expect(contentHash(a)).toBe(contentHash(JSON.parse(JSON.stringify(a))));
    expect(contentHash(a)).not.toBe(contentHash({ ...a, goals: [makeGoal({ name: 'Renamed' })] }));
    expect(contentHash(a)).not.toBe(contentHash({ ...a, preferences: { weekStartsOn: 0 } }));
  });

  it('ignores lastSyncedAt, which is bookkeeping rather than data', () => {
    const a = makeAppState();
    expect(contentHash({ ...a, lastSyncedAt: '2026-09-19T08:00:00.000Z' })).toBe(contentHash(a));
  });
});

describe('classifyLocalData', () => {
  it('empty: nothing of the user\'s, even with default activity types and an empty routine', () => {
    expect(classifyLocalData(makeAppState())).toBe('empty');
  });

  it('exampleOnly: the example week and example goals only', () => {
    expect(
      classifyLocalData(
        makeAppState({
          routines: [makeRoutine({ name: SAMPLE_ROUTINE_NAME, blocks: [makeRoutineBlock()] })],
          goals: [makeGoal({ name: 'Renew passport' })],
          trackingEntries: [makeTrackingEntry()],
        })
      )
    ).toBe('exampleOnly');
  });

  it('userData: one goal of your own among the examples is enough', () => {
    expect(
      classifyLocalData(
        makeAppState({
          routines: [makeRoutine({ name: SAMPLE_ROUTINE_NAME, blocks: [makeRoutineBlock()] })],
          goals: [makeGoal({ name: 'Renew passport' }), makeGoal({ id: 'mine', name: 'Learn Spanish' })],
        })
      )
    ).toBe('userData');
  });

  it('userData: your own routine blocks, with no goals at all', () => {
    expect(classifyLocalData(makeAppState({ routines: [makeRoutine({ blocks: [makeRoutineBlock()] })] }))).toBe('userData');
  });
});

describe('describeData', () => {
  it('counts goals and time entries in plain words', () => {
    expect(describeData({ goals: [makeGoal()], trackingEntries: [] })).toBe('1 goal, 0 time entries');
    expect(describeData({ goals: [], trackingEntries: [makeTrackingEntry(), makeTrackingEntry({ id: 'b' })] })).toBe(
      '0 goals, 2 time entries'
    );
  });
});

describe('device id and sync bookkeeping', () => {
  it('creates one device id and keeps it', async () => {
    const first = await getDeviceId();
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(await getDeviceId()).toBe(first);
  });

  it('round-trips sync bookkeeping, and reads anything unreadable as "never synced"', async () => {
    const meta = { userId: 'u', baseRevision: 3, syncedHash: 'abc', syncedAt: '2026-09-19T08:00:00.000Z' };
    await writeSyncMeta(meta);
    expect(await readSyncMeta()).toEqual(meta);
    await AsyncStorage.setItem(SYNC_META_KEY, '{not json');
    expect(await readSyncMeta()).toBeNull();
    await AsyncStorage.setItem(SYNC_META_KEY, JSON.stringify({ ...meta, baseRevision: -1 }));
    expect(await readSyncMeta()).toBeNull();
  });
});

describe('saved copies', () => {
  it('keeps the newest first and at most MAX_SAVED_COPIES', async () => {
    for (let i = 0; i < MAX_SAVED_COPIES + 3; i++) {
      await saveCopy(`backup-${i}`, `reason ${i}`, AsyncStorage, new Date(Date.UTC(2026, 8, 19, 8, i)));
    }
    const copies = await readSavedCopies();
    expect(copies).toHaveLength(MAX_SAVED_COPIES);
    expect(copies[0].backup).toBe(`backup-${MAX_SAVED_COPIES + 2}`);
    expect(copies.at(-1)?.backup).toBe('backup-3');
  });

  it('reads a damaged list as empty rather than failing', async () => {
    await AsyncStorage.setItem(SAVED_COPIES_KEY, 'nope');
    expect(await readSavedCopies()).toEqual([]);
  });

  it('refuses to report success when the copy could not be written', async () => {
    const failing = { getItem: async () => null, setItem: async () => { throw new Error('quota'); }, removeItem: async () => undefined };
    await expect(saveCopy('b', 'r', failing)).rejects.toThrow('quota');
  });
});
