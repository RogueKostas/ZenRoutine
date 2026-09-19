import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deleteAccount,
  resetPasswordWithCode,
  sendSignInCode,
  signInWithPassword,
  signOut,
  signUp,
  verifySignInCode,
} from '../../src/cloud/account';
import { describeAuthError, INVITE_ONLY_MESSAGE, OFFLINE_MESSAGE } from '../../src/cloud/authErrors';
import { describeAuthRedirect } from '../../src/cloud/authRedirect';

function fakeClient(auth: Record<string, (...args: never[]) => unknown>) {
  const spies = Object.fromEntries(Object.entries(auth).map(([k, fn]) => [k, vi.fn(fn)]));
  return { client: { auth: spies } as unknown as SupabaseClient, spies };
}

describe('describeAuthError', () => {
  it('says what to do for each failure a person can meet', () => {
    expect(describeAuthError({ message: "This email isn't on the ZenRoutine invite list yet.", status: 403 })).toBe(INVITE_ONLY_MESSAGE);
    expect(describeAuthError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 })).toBe(OFFLINE_MESSAGE);
    expect(describeAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toMatch(/don't match/);
    expect(describeAuthError({ code: 'email_not_confirmed' })).toMatch(/link in the email/);
    expect(describeAuthError({ code: 'weak_password' })).toMatch(/at least 8/);
    expect(describeAuthError({ code: 'otp_expired' })).toMatch(/expired or is wrong/);
    expect(describeAuthError({ status: 429, message: 'email rate limit exceeded' })).toMatch(/Wait a few minutes/);
    expect(describeAuthError({ message: 'Error sending confirmation email' })).toMatch(/approved addresses/);
    expect(describeAuthError({ code: 'user_already_exists' })).toMatch(/Sign in instead/);
    expect(describeAuthError({ code: 'email_address_invalid', message: 'Email address "x@example.com" is invalid' })).toMatch(/can't send email/);
  });

  it('never shows an empty message', () => {
    expect(describeAuthError(null)).toMatch(/Something went wrong/);
    expect(describeAuthError({})).toMatch(/Something went wrong/);
    expect(describeAuthError({ message: 'Weird new failure' })).toBe('Something went wrong: Weird new failure');
  });
});

describe('account actions', () => {
  it('checks the email and password before calling the server', async () => {
    const { client, spies } = fakeClient({ signUp: async () => ({ data: {}, error: null }) });
    expect(await signUp(client, 'not-an-email', 'longenough')).toEqual({ ok: false, message: expect.stringMatching(/email address/) });
    expect(await signUp(client, 'me@example.com', 'short')).toEqual({ ok: false, message: expect.stringMatching(/at least 8/) });
    expect(spies.signUp).not.toHaveBeenCalled();
  });

  it('sign-up: lower-cases the email and reports that confirmation is needed', async () => {
    const { client, spies } = fakeClient({
      signUp: async () => ({ data: { user: { id: 'u', identities: [{}] }, session: null }, error: null }),
    });
    expect(await signUp(client, '  Me@Example.COM ', 'longenough')).toEqual({ ok: true, value: { needsConfirmation: true } });
    expect(spies.signUp).toHaveBeenCalledWith({ email: 'me@example.com', password: 'longenough' });
  });

  it('sign-up: an existing account (no identities returned) says so', async () => {
    const { client } = fakeClient({ signUp: async () => ({ data: { user: { id: 'u', identities: [] }, session: null }, error: null }) });
    expect(await signUp(client, 'me@example.com', 'longenough')).toEqual({ ok: false, message: expect.stringMatching(/already an account/) });
  });

  it('sign-up: the invite gate comes back as the invite message', async () => {
    const { client } = fakeClient({
      signUp: async () => ({ data: { user: null, session: null }, error: { status: 403, message: "This email isn't on the ZenRoutine invite list yet." } }),
    });
    expect(await signUp(client, 'me@example.com', 'longenough')).toEqual({ ok: false, message: INVITE_ONLY_MESSAGE });
  });

  it('a thrown network error becomes the offline message', async () => {
    const { client } = fakeClient({
      signInWithPassword: async () => {
        throw Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError' });
      },
    });
    expect(await signInWithPassword(client, 'me@example.com', 'pw')).toEqual({ ok: false, message: OFFLINE_MESSAGE });
  });

  it('a sign-in code never creates an account', async () => {
    const { client, spies } = fakeClient({ signInWithOtp: async () => ({ data: {}, error: null }) });
    expect(await sendSignInCode(client, 'me@example.com')).toEqual({ ok: true, value: undefined });
    expect(spies.signInWithOtp).toHaveBeenCalledWith({ email: 'me@example.com', options: { shouldCreateUser: false } });
  });

  it('codes must be six digits, and verify as an email code', async () => {
    const { client, spies } = fakeClient({ verifyOtp: async () => ({ data: {}, error: null }) });
    expect((await verifySignInCode(client, 'me@example.com', '12345')).ok).toBe(false);
    expect(spies.verifyOtp).not.toHaveBeenCalled();
    expect((await verifySignInCode(client, 'me@example.com', ' 123456 ')).ok).toBe(true);
    expect(spies.verifyOtp).toHaveBeenCalledWith({ email: 'me@example.com', token: '123456', type: 'email' });
  });

  it('password reset verifies as a recovery code, then sets the password; a bad code sets nothing', async () => {
    const good = fakeClient({ verifyOtp: async () => ({ data: {}, error: null }), updateUser: async () => ({ data: {}, error: null }) });
    expect((await resetPasswordWithCode(good.client, 'me@example.com', '123456', 'newpassword')).ok).toBe(true);
    expect(good.spies.verifyOtp).toHaveBeenCalledWith({ email: 'me@example.com', token: '123456', type: 'recovery' });
    expect(good.spies.updateUser).toHaveBeenCalledWith({ password: 'newpassword' });

    const bad = fakeClient({
      verifyOtp: async () => ({ data: {}, error: { code: 'otp_expired' } }),
      updateUser: async () => ({ data: {}, error: null }),
    });
    expect((await resetPasswordWithCode(bad.client, 'me@example.com', '123456', 'newpassword')).ok).toBe(false);
    expect(bad.spies.updateUser).not.toHaveBeenCalled();
  });

  it('signs out this device only', async () => {
    const { client, spies } = fakeClient({ signOut: async () => ({ error: null }) });
    await signOut(client);
    expect(spies.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('describeAuthRedirect', () => {
  it('recognises a confirmation link', () => {
    expect(describeAuthRedirect('#access_token=x&refresh_token=y&type=signup')?.title).toBe('Email confirmed');
  });

  it('explains an expired link', () => {
    expect(describeAuthRedirect('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')?.title).toBe(
      "That link didn't work"
    );
  });

  it('ignores anything else, including an ordinary page anchor', () => {
    expect(describeAuthRedirect('')).toBeNull();
    expect(describeAuthRedirect('#section')).toBeNull();
    expect(describeAuthRedirect('#access_token=x&type=recovery')).toBeNull();
  });
});

describe('deleteAccount', () => {
  it('calls delete_my_account, then drops the local session', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const signOutFn = vi.fn(async () => ({ error: { message: 'User not found' } }));
    const client = { rpc, auth: { signOut: signOutFn } } as unknown as SupabaseClient;
    expect(await deleteAccount(client)).toEqual({ ok: true, value: undefined });
    expect(rpc).toHaveBeenCalledWith('delete_my_account');
    expect(signOutFn).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('reports a failure and keeps the session when the server refuses', async () => {
    const signOutFn = vi.fn();
    const client = {
      rpc: vi.fn(async () => ({ data: null, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 } })),
      auth: { signOut: signOutFn },
    } as unknown as SupabaseClient;
    expect(await deleteAccount(client)).toEqual({ ok: false, message: OFFLINE_MESSAGE });
    expect(signOutFn).not.toHaveBeenCalled();
  });
});
