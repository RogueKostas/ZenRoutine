# Supabase

The ZenRoutine project: `qiugipbxrttmanygalvu` (London, `eu-west-2`), in RogueKostas's Org. Plan: `docs/ITERATION-2-PLAN.md`.

## What is here

| Migration | What it does |
|---|---|
| `20260918120000_snapshots.sql` | One snapshot per user. Users read only their own row. Writes go only through `push_snapshot()`, which is compare-and-swap on `revision`. |
| `20260918120100_delete_my_account.sql` | `delete_my_account()`: deletes the caller's own account; the snapshot goes with it. |
| `20260918120200_invites.sql` | The invite list and the before-user-created hook that refuses any email not on it. |

## Tests

`tests/cloud/` runs these migrations in PGlite, on top of a stand-in for Supabase's `auth` schema **and its default grants** (every new table and function in `public` is granted to `anon` and `authenticated`, so a missing `revoke` shows up). Each protection has a negative control that weakens it in the migration text and proves the test would catch it. Tests never touch the real project.

`node scripts/cloud-smoke.mjs` checks the **live** project with only the public key. Every check expects a refusal, and it creates nothing. Run it by hand after applying a migration.

## Applying a migration

Migrations are applied through the Supabase Management API (`POST /v1/projects/{ref}/database/migrations`) using Kostas's access token, which lives outside the repo. Supabase stamps each migration with the current second, so apply them **at least a second apart**: on 18 Sep two applied in the same second collided, and the second was refused and re-applied.

## Auth settings changed from the defaults

- `hook_before_user_created` → `pg-functions://postgres/public/hook_before_user_created` (invite-only sign-up)
- `site_url` → `https://zenroutine-web.onrender.com`

## Inviting someone

In the Supabase dashboard's Table Editor, add a row to `public.invites` with their email in **lower case**. They can then sign up.
