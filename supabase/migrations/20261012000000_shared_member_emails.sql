-- Several members can share one email address (e.g. a parent's address used
-- for their children). A member is now identified by email address + name +
-- first name. One account per email address stays: it is linked to one of
-- the members with that address.

drop index if exists public.club_members_email_idx;
create unique index if not exists club_members_email_name_idx
  on public.club_members (lower(email), lower(last_name), lower(first_name))
  where email is not null;
create index if not exists club_members_email_lookup_idx
  on public.club_members (lower(email));

-- Link accounts to members through the email address. When several members
-- share the address, the account goes to the member with the same name as
-- the account, else to the eldest member.
create or replace function public.link_accounts_to_members()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  with candidates as (
    select distinct on (p.id) p.id as profile_id, m.id as member_id
    from public.profiles p
    join public.club_members m
      on m.email is not null
     and lower(m.email) = lower(p.email)
     and m.profile_id is null
    where not exists (select 1 from public.club_members o where o.profile_id = p.id)
    order by p.id,
      (lower(trim(p.full_name)) in (
        lower(m.first_name || ' ' || m.last_name),
        lower(m.last_name || ' ' || m.first_name)
      )) desc,
      m.birth_date asc nulls last,
      m.created_at,
      m.id
  ),
  linked as (
    update public.club_members m
    set profile_id = c.profile_id
    from candidates c
    where m.id = c.member_id
    returning c.profile_id as id
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

-- Import: an existing member is found on email address + name + first name,
-- else on name + first name alone.
create or replace function public.admin_import_members(p_rows jsonb)
returns table (added integer, updated integer)
language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb;
  existing uuid;
  n_added integer := 0;
  n_updated integer := 0;
  v_email text;
  v_last text;
  v_first text;
begin
  if not public.is_admin() then
    raise exception 'Alleen beheerders kunnen leden importeren';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_email := nullif(lower(trim(r ->> 'email')), '');
    v_last := trim(r ->> 'last_name');
    v_first := trim(r ->> 'first_name');
    existing := null;

    if v_email is not null then
      select id into existing from public.club_members
      where lower(email) = v_email
        and lower(last_name) = lower(v_last)
        and lower(first_name) = lower(v_first);
    end if;
    if existing is null then
      select id into existing from public.club_members
      where lower(last_name) = lower(v_last)
        and lower(first_name) = lower(v_first)
      order by (email is null) desc, created_at
      limit 1;
    end if;

    if existing is null then
      insert into public.club_members (
        last_name, first_name, gender, email, birth_date,
        tennis_singles_ranking, tennis_doubles_ranking, padel_ranking
      ) values (
        v_last,
        v_first,
        nullif(r ->> 'gender', '')::public.gender,
        v_email,
        nullif(r ->> 'birth_date', '')::date,
        nullif(r ->> 'tennis_singles_ranking', ''),
        nullif(r ->> 'tennis_doubles_ranking', ''),
        nullif(r ->> 'padel_ranking', '')
      );
      n_added := n_added + 1;
    else
      update public.club_members set
        last_name = v_last,
        first_name = v_first,
        gender = coalesce(nullif(r ->> 'gender', '')::public.gender, gender),
        email = coalesce(v_email, email),
        -- A changed email address is linked again below.
        profile_id = case when v_email is not null and lower(email) is distinct from v_email
                          then null else profile_id end,
        birth_date = coalesce(nullif(r ->> 'birth_date', '')::date, birth_date),
        tennis_singles_ranking = coalesce(nullif(r ->> 'tennis_singles_ranking', ''), tennis_singles_ranking),
        tennis_doubles_ranking = coalesce(nullif(r ->> 'tennis_doubles_ranking', ''), tennis_doubles_ranking),
        padel_ranking = coalesce(nullif(r ->> 'padel_ranking', ''), padel_ranking)
      where id = existing;
      n_updated := n_updated + 1;
    end if;
  end loop;

  perform public.link_accounts_to_members();
  return query select n_added, n_updated;
end;
$$;

-- Editing a member: only the same email address with the same name is taken.
create or replace function public.admin_update_member(
  p_member_id uuid,
  p_last_name text,
  p_first_name text,
  p_gender public.gender,
  p_email text,
  p_tennis_singles_ranking text,
  p_tennis_doubles_ranking text,
  p_padel_ranking text,
  p_birth_date date default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := nullif(lower(trim(p_email)), '');
begin
  if not public.is_admin() then
    raise exception 'Alleen beheerders kunnen leden aanpassen';
  end if;
  if exists (
    select 1 from public.club_members
    where lower(email) = v_email
      and lower(last_name) = lower(trim(p_last_name))
      and lower(first_name) = lower(trim(p_first_name))
      and id <> p_member_id
  ) then
    raise exception 'Er bestaat al een lid met deze naam en dit e-mailadres';
  end if;

  update public.club_members set
    last_name = trim(p_last_name),
    first_name = trim(p_first_name),
    gender = p_gender,
    email = v_email,
    birth_date = p_birth_date,
    -- A changed email address is linked again below.
    profile_id = case when lower(email) is distinct from v_email then null else profile_id end,
    tennis_singles_ranking = nullif(p_tennis_singles_ranking, ''),
    tennis_doubles_ranking = nullif(p_tennis_doubles_ranking, ''),
    padel_ranking = nullif(p_padel_ranking, '')
  where id = p_member_id;

  perform public.link_accounts_to_members();
end;
$$;
