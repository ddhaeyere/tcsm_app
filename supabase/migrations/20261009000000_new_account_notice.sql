-- Admins get a mail when a new account waits for their approval. The app
-- sends it right after the member confirmed their email address (or right
-- after sign-up when confirmation is off). This column makes sure the mail
-- goes out only once per account.
alter table public.profiles
  add column admins_notified_at timestamptz;

-- Called by the new account itself. When it is still pending and admins were
-- not told yet, marks it as told and returns who should get the mail, with
-- the account's name and address. Otherwise returns nothing.
create function public.claim_new_account_notice()
returns table (admin_email text, account_name text, account_email text)
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles;
begin
  update public.profiles
  set admins_notified_at = now()
  where id = auth.uid() and status = 'pending' and admins_notified_at is null
  returning * into me;

  if me.id is null then
    return;
  end if;

  return query
    select a.email, me.full_name, me.email
    from public.profiles a
    where a.role = 'admin' and a.status = 'approved';
end;
$$;

revoke all on function public.claim_new_account_notice() from public, anon;
grant execute on function public.claim_new_account_notice() to authenticated;
