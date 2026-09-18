-- Iteration 2 (docs/ITERATION-2-PLAN.md, K4): sign-up is invite-only.
-- Kostas adds an email to public.invites (from the Supabase dashboard); Supabase Auth calls the
-- before-user-created hook below and refuses any address not on the list.
-- Nobody reaches the list through the API: RLS is on with no policies, and all grants are revoked.

create table public.invites (
  email text primary key check (email = lower(btrim(email)) and position('@' in email) > 1),
  note text,
  invited_at timestamptz not null default now()
);

alter table public.invites enable row level security;
revoke all on table public.invites from public, anon, authenticated;

create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text := lower(btrim(event -> 'user' ->> 'email'));
begin
  if candidate is not null and exists (select 1 from public.invites where email = candidate) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This email isn''t on the ZenRoutine invite list yet.'
    )
  );
end;
$$;

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
