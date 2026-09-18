/**
 * Supabase Auth errors, in words a person can act on. Every failure the account screens can show
 * goes through here, so none of them surfaces as a raw code or an empty message.
 */

export interface AuthErrorLike {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
}

export const INVITE_ONLY_MESSAGE =
  "This email isn't on the ZenRoutine invite list yet. Ask whoever invited you to add it, then try again.";

export const OFFLINE_MESSAGE =
  "Couldn't reach ZenRoutine's servers. Check your connection and try again. Everything on this device still works.";

export function describeAuthError(error: AuthErrorLike | null | undefined): string {
  if (!error) return 'Something went wrong. Please try again.';
  const message = (error.message ?? '').trim();
  const code = error.code ?? '';
  const lower = message.toLowerCase();

  // Our own before-user-created hook (supabase/migrations/…_invites.sql).
  if (lower.includes('invite list')) return INVITE_ONLY_MESSAGE;

  if (
    error.name === 'AuthRetryableFetchError' ||
    lower.includes('failed to fetch') ||
    lower.includes('network request failed') ||
    lower.includes('load failed') ||
    error.status === 0
  ) {
    return OFFLINE_MESSAGE;
  }

  if (code === 'invalid_credentials' || lower.includes('invalid login credentials')) {
    return "That email and password don't match. Check them and try again.";
  }
  if (code === 'email_not_confirmed' || lower.includes('email not confirmed')) {
    return "This email hasn't been confirmed yet. Tap the link in the email we sent you, then sign in.";
  }
  if (code === 'user_already_exists' || code === 'email_exists' || lower.includes('already registered')) {
    return 'There is already an account with this email. Sign in instead.';
  }
  if (code === 'weak_password' || lower.includes('password should be')) {
    return 'Choose a longer password: at least 8 characters.';
  }
  if (code === 'otp_expired' || lower.includes('token has expired') || lower.includes('otp has expired')) {
    return 'That code has expired or is wrong. Ask for a new one and try again.';
  }
  if (code === 'otp_disabled' || lower.includes('signups not allowed for otp')) {
    return 'There is no account with this email yet. Create one first.';
  }
  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    error.status === 429 ||
    lower.includes('rate limit')
  ) {
    return 'Too many attempts for now. Wait a few minutes and try again.';
  }
  if (lower.includes('error sending') || code === 'email_address_not_authorized') {
    return "We couldn't send the email. During the beta, email only reaches approved addresses.";
  }
  if (lower.includes('invalid format') || lower.includes('unable to validate email')) {
    return "That doesn't look like an email address.";
  }
  // Well-formed, but the server won't send to it (an unreachable domain, or a typo in one).
  if (code === 'email_address_invalid' || /email address .* is invalid/.test(lower)) {
    return "We can't send email to that address. Check it for typos.";
  }
  if (code === 'same_password') return 'Choose a password different from your current one.';

  return message ? `Something went wrong: ${message}` : 'Something went wrong. Please try again.';
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const MIN_PASSWORD_LENGTH = 8;
