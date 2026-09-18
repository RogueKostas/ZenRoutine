import type { SupabaseClient, User } from '@supabase/supabase-js';
import { describeAuthError, isValidEmail, MIN_PASSWORD_LENGTH, normaliseEmail } from './authErrors';

/**
 * Every account action the screens can take, as one call each returning either success or a
 * sentence to show. Sign-in by code verifies with `type: 'email'`; sign-up confirmation and
 * password reset use their own types, as Supabase requires.
 */

export type AccountResult<T = undefined> = { ok: true; value: T } | { ok: false; message: string };

const ok = <T,>(value: T): AccountResult<T> => ({ ok: true, value });
const fail = (message: string): AccountResult<never> => ({ ok: false, message });

function checkEmail(email: string): string | null {
  return isValidEmail(email) ? null : "That doesn't look like an email address.";
}

function checkPassword(password: string): string | null {
  return password.length >= MIN_PASSWORD_LENGTH ? null : `Choose a longer password: at least ${MIN_PASSWORD_LENGTH} characters.`;
}

function checkCode(code: string): string | null {
  return /^\d{6}$/.test(code.trim()) ? null : 'Enter the 6-digit code from the email.';
}

async function attempt<T>(run: () => Promise<{ error: unknown } & T>): Promise<({ error: null } & T) | { error: string }> {
  try {
    const result = await run();
    if (result.error) return { error: describeAuthError(result.error as never) };
    return result as { error: null } & T;
  } catch (error) {
    return { error: describeAuthError(error as never) };
  }
}

/**
 * Creates the account. Supabase emails a confirmation; until it is confirmed there is no session.
 * `needsConfirmation` tells the screen to say so rather than pretend you are signed in.
 */
export async function signUp(
  client: SupabaseClient,
  email: string,
  password: string
): Promise<AccountResult<{ needsConfirmation: boolean }>> {
  const invalid = checkEmail(email) ?? checkPassword(password);
  if (invalid) return fail(invalid);
  const r = await attempt(() => client.auth.signUp({ email: normaliseEmail(email), password }));
  if (typeof r.error === 'string') return fail(r.error);
  const { data } = r as unknown as { data: { user: User | null; session: unknown } };
  // Supabase answers an existing, confirmed email with a user that has no identities rather than
  // an error, so that sign-up cannot be used to find out who has an account.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return fail('There is already an account with this email. Sign in instead.');
  }
  return ok({ needsConfirmation: !data.session });
}

export async function signInWithPassword(client: SupabaseClient, email: string, password: string): Promise<AccountResult> {
  const invalid = checkEmail(email) ?? (password ? null : 'Enter your password.');
  if (invalid) return fail(invalid);
  const r = await attempt(() => client.auth.signInWithPassword({ email: normaliseEmail(email), password }));
  return typeof r.error === 'string' ? fail(r.error) : ok(undefined);
}

/** Emails a 6-digit sign-in code. Never creates an account: sign-up is a separate, invited step. */
export async function sendSignInCode(client: SupabaseClient, email: string): Promise<AccountResult> {
  const invalid = checkEmail(email);
  if (invalid) return fail(invalid);
  const r = await attempt(() =>
    client.auth.signInWithOtp({ email: normaliseEmail(email), options: { shouldCreateUser: false } })
  );
  return typeof r.error === 'string' ? fail(r.error) : ok(undefined);
}

export async function verifySignInCode(client: SupabaseClient, email: string, code: string): Promise<AccountResult> {
  const invalid = checkEmail(email) ?? checkCode(code);
  if (invalid) return fail(invalid);
  const r = await attempt(() => client.auth.verifyOtp({ email: normaliseEmail(email), token: code.trim(), type: 'email' }));
  return typeof r.error === 'string' ? fail(r.error) : ok(undefined);
}

export async function sendPasswordResetCode(client: SupabaseClient, email: string): Promise<AccountResult> {
  const invalid = checkEmail(email);
  if (invalid) return fail(invalid);
  const r = await attempt(() => client.auth.resetPasswordForEmail(normaliseEmail(email)));
  return typeof r.error === 'string' ? fail(r.error) : ok(undefined);
}

/** Verifies the reset code (which signs you in) and then sets the new password. */
export async function resetPasswordWithCode(
  client: SupabaseClient,
  email: string,
  code: string,
  newPassword: string
): Promise<AccountResult> {
  const invalid = checkEmail(email) ?? checkCode(code) ?? checkPassword(newPassword);
  if (invalid) return fail(invalid);
  const verified = await attempt(() => client.auth.verifyOtp({ email: normaliseEmail(email), token: code.trim(), type: 'recovery' }));
  if (typeof verified.error === 'string') return fail(verified.error);
  const updated = await attempt(() => client.auth.updateUser({ password: newPassword }));
  return typeof updated.error === 'string' ? fail(updated.error) : ok(undefined);
}

/** Signs out this device only: other devices stay signed in. */
export async function signOut(client: SupabaseClient): Promise<AccountResult> {
  const r = await attempt(() => client.auth.signOut({ scope: 'local' }));
  return typeof r.error === 'string' ? fail(r.error) : ok(undefined);
}
