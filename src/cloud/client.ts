import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cloudConfig } from '../config/cloud';

/**
 * The session lives under its own key, beside the app's data (APP_STORAGE_KEY) and never inside
 * it, so signing out can drop the session without touching planning data, and a backup or a
 * snapshot never carries credentials.
 */
export const AUTH_STORAGE_KEY = 'zenroutine-auth';

let client: SupabaseClient | null = null;

/**
 * The Supabase client, or null while accounts are switched off. Created on first use so a build
 * with accounts off never opens a connection or refreshes a token.
 *
 * Sign-in is by emailed code, never by link (docs/ITERATION-2-PLAN.md, K1): on iPhone and iPad a
 * link opens Safari rather than the Home Screen app, so the client ignores sessions in the URL.
 */
export function getCloudClient(config: typeof cloudConfig = cloudConfig): SupabaseClient | null {
  if (!config.accountsEnabled) return null;
  client ??= createClient(config.url, config.publishableKey, {
    auth: {
      storage: AsyncStorage,
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

/** Test seam: forget the cached client. */
export function resetCloudClientForTests(): void {
  client = null;
}
