-- Admins can be chosen straight from the member list, also for members who
-- do not have an account yet. The choice is stored on the member; when the
-- member later makes an account (and gets linked through the email address),
-- that account becomes an admin.

alter table public.club_members
  add column if not exists make_admin boolean not null default false;

-- Members whose account is already an admin keep that.
update public.club_members m
set make_admin = true
from public.profiles p
where m.profile_id = p.id and p.role <> 'member';

-- Linking now also gives a linked account the admin role chosen on its member.
create or replace function public.link_accounts_to_members()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  with linked as (
    update public.club_members m
    set profile_id = p.id
    from public.profiles p
    where m.profile_id is null
      and m.email is not null
      and lower(m.email) = lower(p.email)
      and not exists (select 1 from public.club_members o where o.profile_id = p.id)
    returning p.id
  )
  update public.profiles p
  set status = 'approved'
  from linked
  where p.id = linked.id and p.status = 'pending';

  update public.profiles p
  set role = 'admin'
  from public.club_members m
  where m.profile_id = p.id and m.make_admin and p.role = 'member';
end;
$$;

-- Make a member an admin, or take it away. With an account, the account
-- changes right away; without one, it happens when the account is linked.
create or replace function public.admin_set_member_admin(p_member_id uuid, p_admin boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile uuid;
begin
  if not public.is_admin() then
    raise exception 'Alleen beheerders kunnen beheerders aanduiden';
  end if;

  select profile_id into v_profile from public.club_members where id = p_member_id;
  if not found then
    raise exception 'Lid niet gevonden';
  end if;
  if v_profile = auth.uid() then
    raise exception 'Je kan je eigen rechten niet aanpassen';
  end if;

  update public.club_members set make_admin = p_admin where id = p_member_id;
  if v_profile is not null then
    update public.profiles
    set role = case when p_admin then 'admin' else 'member' end::public.user_role
    where id = v_profile;
  end if;
end;
$$;

-- The members marked as admin.
create or replace function public.admin_list_member_admins()
returns setof uuid
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Alleen beheerders kunnen de ledenlijst beheren';
  end if;
  return query select id from public.club_members where make_admin;
end;
$$;

-- A role changed on the accounts page is kept on the member too, so linking
-- never undoes it.
create or replace function public.admin_update_profile(
  p_profile_id uuid,
  p_status public.account_status default null,
  p_role public.user_role default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Alleen beheerders kunnen accounts aanpassen';
  end if;
  if p_profile_id = auth.uid() then
    raise exception 'Je kan je eigen account niet aanpassen';
  end if;

  update public.profiles
  set status = coalesce(p_status, status),
      role = coalesce(p_role, role)
  where id = p_profile_id;

  if p_role is not null then
    update public.club_members
    set make_admin = p_role <> 'member'
    where profile_id = p_profile_id;
  end if;
end;
$$;

revoke execute on function
  public.link_accounts_to_members(),
  public.admin_set_member_admin(uuid, boolean),
  public.admin_list_member_admins()
from public, anon;
revoke execute on function public.link_accounts_to_members() from authenticated;

grant execute on function
  public.admin_set_member_admin(uuid, boolean),
  public.admin_list_member_admins()
to authenticated;
