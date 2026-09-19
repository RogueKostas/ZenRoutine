-- A read-only login for the daily encrypted backup (.github/workflows/backup.yml; Kostas, 19 Sep:
-- stay on the Free plan and back up daily instead of paying for Pro).
--
-- Created without a password and unable to log in: the password is set on the live project out of
-- band (never in this repo) and stored only as a GitHub Actions secret. If that secret leaks, the
-- worst it allows is reading the backup's own tables; it can write nothing and call nothing.

create role zr_backup nologin;

grant usage on schema public to zr_backup;
grant select on table public.snapshots, public.invites to zr_backup;

-- Only what a restore needs from accounts: who they are, never credentials.
grant usage on schema auth to zr_backup;
grant select (id, email, created_at) on table auth.users to zr_backup;

-- Row-level security applies to this role like any other, so it needs its own read policies.
create policy snapshots_backup_read on public.snapshots for select to zr_backup using (true);
create policy invites_backup_read on public.invites for select to zr_backup using (true);
