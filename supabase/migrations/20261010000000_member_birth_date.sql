-- Birth date of club members, read from the member list. Only admins see it:
-- members cannot select this column (see the column grants on club_members).

alter table public.club_members add column if not exists birth_date date;

-- The admin member list now includes the birth date.
drop function if exists public.admin_list_members();
create function public.admin_list_members()
returns table (
  id uuid,
  last_name text,
  first_name text,
  full_name text,
  gender public.gender,
  email text,
  birth_date date,
  tennis_singles_ranking text,
  tennis_doubles_ranking text,
  padel_ranking text,
  profile_id uuid
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Alleen beheerders kunnen de ledenlijst beheren';
  end if;

  return query
  select m.id, m.last_name, m.first_name, m.full_name, m.gender, m.email, m.birth_date,
         m.tennis_singles_ranking, m.tennis_doubles_ranking, m.padel_ranking, m.profile_id
  from public.club_members m
  order by m.last_name, m.first_name;
end;
$$;

-- Import: also stores the birth date ("birth_date" as yyyy-mm-dd).
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
begin
  if not public.is_admin() then
    raise exception 'Alleen beheerders kunnen leden importeren';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_email := nullif(lower(trim(r ->> 'email')), '');
    existing := null;

    if v_email is not null then
      select id into existing from public.club_members where lower(email) = v_email;
    end if;
    if existing is null then
      select id into existing from public.club_members
      where lower(last_name) = lower(trim(r ->> 'last_name'))
        and lower(first_name) = lower(trim(r ->> 'first_name'))
      limit 1;
    end if;

    if existing is null then
      insert into public.club_members (
        last_name, first_name, gender, email, birth_date,
        tennis_singles_ranking, tennis_doubles_ranking, padel_ranking
      ) values (
        trim(r ->> 'last_name'),
        trim(r ->> 'first_name'),
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
        last_name = trim(r ->> 'last_name'),
        first_name = trim(r ->> 'first_name'),
        gender = coalesce(nullif(r ->> 'gender', '')::public.gender, gender),
        email = coalesce(v_email, email),
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

-- Editing a member: the birth date can be changed too.
drop function if exists public.admin_update_member(uuid, text, text, public.gender, text, text, text, text);
drop function if exists public.admin_update_member(uuid, text, text, public.gender, text, text, text, text, date);
create function public.admin_update_member(
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
    select 1 from public.club_members where lower(email) = v_email and id <> p_member_id
  ) then
    raise exception 'Een ander lid heeft al dit e-mailadres';
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

revoke execute on function
  public.admin_list_members(),
  public.admin_import_members(jsonb),
  public.admin_update_member(uuid, text, text, public.gender, text, text, text, text, date)
from public, anon;

grant execute on function
  public.admin_list_members(),
  public.admin_import_members(jsonb),
  public.admin_update_member(uuid, text, text, public.gender, text, text, text, text, date)
to authenticated;
