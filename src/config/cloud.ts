/**
 * The ZenRoutine Supabase project (docs/ITERATION-2-PLAN.md). Both values are public by design:
 * the publishable key only identifies the project, and row-level security plus the functions in
 * supabase/migrations decide what any caller can do. Never put a secret key or access token here;
 * tests/cloud/secrets.test.ts fails the build if one appears anywhere in the source.
 */
export const cloudConfig = {
  url: 'https://qiugipbxrttmanygalvu.supabase.co',
  publishableKey: 'sb_publishable_D9wNAm1M2HQEKIwra4_4Qw__g8tgcAT',
  /**
   * Off until Wave B ships sign-in. While false nothing in the app imports the cloud client, so
   * the build behaves exactly as it did before Iteration 2.
   */
  accountsEnabled: false,
} as const;
