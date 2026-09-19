-- Follow-up to …_backup_reader.sql. On Supabase the `auth` schema belongs to a platform role, so
-- the direct grants there are silently ineffective ("no privileges were granted") and the backup
-- login got "permission denied for schema auth". Take them back out, and give the backup exactly
-- the three account columns a restore needs through one function that only zr_backup may call.

revoke select (id, email, created_at) on table auth.users from zr_backup;
revoke usage on schema auth from zr_backup;

create function public.backup_users()
returns table (id uuid, email text, created_at timestamptz)
language sql
security definer
set search_path = ''
stable
as $$
  select u.id, u.email::text, u.created_at from auth.users as u order by u.created_at
$$;

revoke execute on function public.backup_users() from public, anon, authenticated;
grant execute on function public.backup_users() to zr_backup;
