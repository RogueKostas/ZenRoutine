-- Iteration 2, Wave A (docs/ITERATION-2-PLAN.md): one whole-app snapshot per user.
--
-- Reads: a signed-in user can select only their own row (row-level security).
-- Writes: only through push_snapshot(), which is compare-and-swap on `revision`, so a save based
-- on an out-of-date revision is refused as a conflict instead of overwriting another device's
-- work. "Newest" is the server's order of arrival, never a device clock.

create table public.snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  revision bigint not null check (revision >= 1),
  schema_version integer not null check (schema_version >= 1),
  data jsonb not null,
  device_id text not null check (char_length(device_id) between 1 and 100),
  updated_at timestamptz not null default now()
);

alter table public.snapshots enable row level security;

-- Supabase grants every table in `public` to anon and authenticated by default. Take it all back,
-- then hand out only what the policies below need.
revoke all on table public.snapshots from public, anon, authenticated;
grant select on table public.snapshots to authenticated;

create policy snapshots_select_own on public.snapshots
  for select to authenticated
  using (user_id = auth.uid());

-- No insert, update or delete policies: direct writes are refused. push_snapshot() is the only
-- way in, and account deletion removes the row through the auth.users cascade.

-- Returns {"status":"ok"|"conflict", "revision":n|null, "updated_at":ts|null}.
--   expected_revision 0 = "I believe the account is empty": inserts revision 1, or conflicts if a
--   snapshot already exists. Otherwise the update succeeds only if the stored revision still
--   equals expected_revision. On conflict the current revision is returned (null if none exists).
create function public.push_snapshot(
  expected_revision bigint,
  new_schema_version integer,
  new_data jsonb,
  new_device_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  saved_revision bigint;
  saved_at timestamptz;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if expected_revision is null or expected_revision < 0 then
    raise exception 'expected_revision must be 0 or a positive revision' using errcode = '22023';
  end if;
  if new_data is null or jsonb_typeof(new_data) <> 'object' then
    raise exception 'snapshot data must be a JSON object' using errcode = '22023';
  end if;
  -- 5 MB is far above a real user's data and far below anything that would hurt the database.
  if octet_length(new_data::text) > 5 * 1024 * 1024 then
    raise exception 'snapshot too large' using errcode = '54000';
  end if;

  if expected_revision = 0 then
    insert into public.snapshots as s (user_id, revision, schema_version, data, device_id)
    values (uid, 1, new_schema_version, new_data, new_device_id)
    on conflict (user_id) do nothing
    returning s.revision, s.updated_at into saved_revision, saved_at;
  else
    update public.snapshots as s
    set revision = s.revision + 1,
        schema_version = new_schema_version,
        data = new_data,
        device_id = new_device_id,
        updated_at = now()
    where s.user_id = uid and s.revision = expected_revision
    returning s.revision, s.updated_at into saved_revision, saved_at;
  end if;

  if saved_revision is not null then
    return jsonb_build_object('status', 'ok', 'revision', saved_revision, 'updated_at', saved_at);
  end if;

  select s.revision, s.updated_at into saved_revision, saved_at
  from public.snapshots as s
  where s.user_id = uid;

  return jsonb_build_object('status', 'conflict', 'revision', saved_revision, 'updated_at', saved_at);
end;
$$;

revoke execute on function public.push_snapshot(bigint, integer, jsonb, text) from public, anon;
grant execute on function public.push_snapshot(bigint, integer, jsonb, text) to authenticated;
