/**
 * The ZenRoutine Supabase project (docs/ITERATION-2-PLAN.md). The URL and publishable key are
 * public by design: the key only identifies the project, and row-level security plus the
 * functions in supabase/migrations decide what any caller can do. Never put a secret key or access
 * token here; tests/cloud/client.test.ts fails the build if one appears anywhere in the source.
 */

// Expo inlines EXPO_PUBLIC_* at build time, so a build can override either switch without a code change.
const envAccountsDisabled = process.env.EXPO_PUBLIC_ACCOUNTS_ENABLED === '0';

export const cloudConfig = {
  url: 'https://qiugipbxrttmanygalvu.supabase.co',
  publishableKey: 'sb_publishable_D9wNAm1M2HQEKIwra4_4Qw__g8tgcAT',
  /**
   * Accounts on or off (on since Wave B). While off, nothing in the app creates the cloud client
   * and Settings shows no Account section, so the app behaves exactly as it did before Iteration 2.
   */
  accountsEnabled: !envAccountsDisabled,
  /**
   * Sign-in and password reset by emailed 6-digit code (K1). Off until the project sends email
   * through its own provider (K2): Supabase's built-in email cannot use a custom template on the
   * Free plan, and its default templates carry a link, not a code. Sign-up works without it: the
   * confirmation link confirms the account wherever it opens, and you then sign in with a password.
   */
  emailCodesEnabled: process.env.EXPO_PUBLIC_EMAIL_CODES_ENABLED === '1',
};

export type CloudConfig = typeof cloudConfig;
