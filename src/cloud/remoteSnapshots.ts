import type { SupabaseClient } from '@supabase/supabase-js';
import { describeAuthError } from './authErrors';

/** The account's copy of the user's data: one row per user (supabase/migrations/…_snapshots.sql). */
export interface RemoteSnapshot {
  revision: number;
  schemaVersion: number;
  /** An encodeBackup() object: { format, formatVersion, schemaVersion, exportedAt, state }. */
  data: unknown;
  deviceId: string;
  updatedAt: string;
}

export type PushOutcome =
  | { status: 'ok'; revision: number; updatedAt: string }
  | { status: 'conflict'; revision: number | null; updatedAt: string | null };

/** The two calls sync needs. Tests pass a fake; the app passes supabaseSnapshotApi(). */
export interface SnapshotApi {
  fetch(): Promise<RemoteSnapshot | null>;
  /** Compare-and-swap: expectedRevision 0 means "I believe the account is empty". */
  push(expectedRevision: number, schemaVersion: number, data: object, deviceId: string): Promise<PushOutcome>;
}

export class CloudError extends Error {}

export function supabaseSnapshotApi(client: SupabaseClient, userId: string): SnapshotApi {
  return {
    async fetch() {
      const { data, error } = await client
        .from('snapshots')
        .select('revision, schema_version, data, device_id, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new CloudError(describeAuthError(error));
      if (!data) return null;
      return {
        revision: Number(data.revision),
        schemaVersion: Number(data.schema_version),
        data: data.data,
        deviceId: String(data.device_id),
        updatedAt: String(data.updated_at),
      };
    },
    async push(expectedRevision, schemaVersion, snapshot, deviceId) {
      const { data, error } = await client.rpc('push_snapshot', {
        expected_revision: expectedRevision,
        new_schema_version: schemaVersion,
        new_data: snapshot,
        new_device_id: deviceId,
      });
      if (error) throw new CloudError(describeAuthError(error));
      const result = data as { status?: string; revision?: number | null; updated_at?: string | null } | null;
      if (result?.status === 'ok' && typeof result.revision === 'number' && result.updated_at) {
        return { status: 'ok', revision: result.revision, updatedAt: result.updated_at };
      }
      if (result?.status === 'conflict') {
        return { status: 'conflict', revision: result.revision ?? null, updatedAt: result.updated_at ?? null };
      }
      throw new CloudError('The server gave an answer ZenRoutine did not understand. Please try again.');
    },
  };
}
