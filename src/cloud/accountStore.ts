import { create } from 'zustand';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCloudClient } from './client';

/**
 * Who is signed in on this device. Not persisted here: Supabase keeps the session under
 * AUTH_STORAGE_KEY itself, and this store only mirrors it for the screens.
 */
export type AccountStatus = 'off' | 'starting' | 'signedOut' | 'signedIn';

interface AccountState {
  status: AccountStatus;
  userId: string | null;
  email: string | null;
}

export const useAccountStore = create<AccountState>(() => ({ status: 'off', userId: null, email: null }));

let started = false;

/** Starts following the session. Safe to call more than once; does nothing while accounts are off. */
export function startAccount(client: SupabaseClient | null = getCloudClient()): void {
  if (started || !client) return;
  started = true;
  useAccountStore.setState({ status: 'starting' });

  const apply = (session: { user: { id: string; email?: string | null } } | null) =>
    useAccountStore.setState(
      session
        ? { status: 'signedIn', userId: session.user.id, email: session.user.email ?? null }
        : { status: 'signedOut', userId: null, email: null }
    );

  client.auth.onAuthStateChange((_event, session) => apply(session));
  client.auth
    .getSession()
    .then(({ data }) => apply(data.session))
    .catch(() => apply(null));
}

/** Test seam. */
export function resetAccountForTests(): void {
  started = false;
  useAccountStore.setState({ status: 'off', userId: null, email: null });
}
