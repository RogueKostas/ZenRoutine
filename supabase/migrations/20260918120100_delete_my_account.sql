-- Iteration 2 (docs/ITERATION-2-PLAN.md, D2): a signed-in user deletes their own account.
-- Deleting the auth.users row cascades to their snapshot. The app never holds a secret key, so
-- this runs as the function owner, and only ever on the caller's own id.

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
