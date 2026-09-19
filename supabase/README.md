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
- `mailer_otp_length` → 6, `mailer_otp_exp` → 900 (15 minutes), `password_min_length` → 8

**Email templates cannot be changed yet.** On the Free plan with Supabase's built-in email, the API refuses: *"Email template modification is not available for free tier projects using the default email provider."* The default templates carry a link, not a code, so sign-in and reset by code stay off (`cloudConfig.emailCodesEnabled`) until the project has its own email provider (K2) or is on Pro (K3). Sign-up still works: the confirmation link confirms the account wherever it opens. Built-in email also only reaches members of the Supabase org (today, kostas@roguesun.com), about 2 an hour.

## Inviting someone

In the Supabase dashboard's Table Editor, add a row to `public.invites` with their email in **lower case**. They can then sign up.

## Backups

The project is on the Free plan, which keeps no backups (Kostas, 19 Sep). Instead, `.github/workflows/backup.yml` runs every day at 03:17 UTC (and on demand from the Actions tab). It:

1. Connects as `zr_backup`, a read-only login (`…_backup_reader.sql`, `…_backup_users.sql`). It can read `snapshots`, `invites`, and each user's id, email and sign-up date through `backup_users()`, and nothing else: no password hashes, no writes, no app functions.
2. Runs `scripts/backup-export.sql`, one JSON document: `{ format: "zenroutine-server-backup", taken_at, users, snapshots, invites }`.
3. Encrypts it with AES-256 (`openssl enc -pbkdf2`, 200,000 iterations) before it leaves the runner, and keeps it as a workflow artifact for 30 days. **The repository is public, so this encryption is what keeps the data private.**

It needs two repository secrets:

| Secret | Holds | Kept in |
|---|---|---|
| `SUPABASE_BACKUP_DB_URL` | The `zr_backup` connection string, via the London session pooler | `OneDrive\Zen Routine\Secrets\zenroutine-backup-db-url.txt` |
| `BACKUP_PASSPHRASE` | The encryption passphrase. **Without it, no backup can be opened.** Keep a copy in a password manager too | `OneDrive\Zen Routine\Secrets\zenroutine-backup-passphrase.txt` |

The daily read also counts as activity, so the Free project isn't paused in a quiet week.

**Opening a backup.** Download the artifact from the workflow run, unzip it, then (Git Bash):

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:C:/Users/kzari/OneDrive/Zen Routine/Secrets/zenroutine-backup-passphrase.txt" -in zenroutine-backup-<stamp>.json.enc -out backup.json
```

**Restoring one person's data.** Each entry in `snapshots` has a `data` field that is an ordinary ZenRoutine backup (`"format": "zenroutine-backup"`). Paste it into Settings → Import Data on their device. If they are signed in, sync then uploads it to their account like any other change.

**Restoring the whole database** (the project was lost): recreate the project, apply `supabase/migrations/` in order, let each person sign up again, then import their snapshot as above. User ids change on a new project, so rows can't be copied back directly. Matching is by the email in `users`.
