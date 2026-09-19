-- The daily server backup (.github/workflows/backup.yml), as one JSON document.
-- Runs as zr_backup (supabase/migrations/…_backup_reader.sql): read-only, no credentials.
-- Restore notes: supabase/README.md, "Backups".
select json_build_object(
  'format', 'zenroutine-server-backup',
  'version', 1,
  'taken_at', now(),
  'users', (
    select coalesce(json_agg(json_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at) order by u.created_at), '[]'::json)
    from public.backup_users() u
  ),
  'snapshots', (select coalesce(json_agg(s order by s.user_id), '[]'::json) from public.snapshots s),
  'invites', (select coalesce(json_agg(i order by i.email), '[]'::json) from public.invites i)
);
