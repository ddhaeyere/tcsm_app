-- Simpler registrations: an event offers tennis and/or padel, optionally with
-- a meal ("catering", e.g. "Barbecue"). A member registers once per event and
-- says whether they play tennis, padel or both, and whether they eat along.
-- They can change that later. Each sport can have a maximum number of
-- players; who registers after that ends up on the reserve list, in order of
-- registration, and moves up as soon as someone drops out.
--
-- Series (event_categories, entries, entry_players) are no longer used by the
-- app. Their data stays in place; the registrations made in them are copied
-- into the new table at the bottom of this file.

alter table public.events
  add column has_tennis boolean not null default true,
  add column has_padel boolean not null default false,
  add column max_tennis integer check (max_tennis > 0),
  add column max_padel integer check (max_padel > 0),
  -- Name of the meal people can register for; null when there is none.
  add column catering text;

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.club_members (id) on delete cascade,
  tennis boolean not null default false,
  padel boolean not null default false,
  eats boolean not null default false,
  -- When the member signed up for the sport: the order of the reserve list.
  tennis_since timestamptz,
  padel_since timestamptz,
  registered_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, member_id),
  check (tennis = (tennis_since is not null)),
  check (padel = (padel_since is not null)),
  check (tennis or padel or eats)
);

create index registrations_member_id_idx on public.registrations (member_id);

alter table public.registrations enable row level security;

-- Everyone sees who plays and who eats along; writes go through the functions.
create policy "registrations: approved members read"
  on public.registrations for select to authenticated
  using (public.is_approved());

revoke all on public.registrations from anon, authenticated;
grant select on public.registrations to authenticated;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Throws unless the current account may change this registration: the member
-- themselves, whoever registered them, or an organiser. Others than
-- organisers only until the registrations close.
create function public.assert_may_change_registration(p_registration public.registrations)
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  closes_at timestamptz;
begin
  if public.is_organiser() then
    return;
  end if;
  if not public.is_approved() or not (
    coalesce(p_registration.registered_by = auth.uid(), false)
    or coalesce(p_registration.member_id = public.current_member_id(), false)
  ) then
    raise exception 'Je kan alleen je eigen inschrijving of wie jij inschreef aanpassen';
  end if;

  select coalesce(registration_deadline, starts_at) into closes_at
  from public.events where id = p_registration.event_id;
  if now() >= closes_at then
    raise exception 'De inschrijvingen voor dit evenement zijn gesloten';
  end if;
end;
$$;

-- Register a member for an event, or change their registration. Any
-- approved account can register any member of the club. Returns the
-- registration's id.
create function public.save_registration(
  p_event_id uuid,
  p_member_id uuid,
  p_tennis boolean,
  p_padel boolean,
  p_eats boolean
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.events;
  existing public.registrations;
  saved uuid;
begin
  if not public.is_approved() then
    raise exception 'Je account is nog niet goedgekeurd';
  end if;

  select * into ev from public.events where id = p_event_id;
  if not found then
    raise exception 'Evenement niet gevonden';
  end if;
  if not exists (select 1 from public.club_members where id = p_member_id) then
    raise exception 'Lid niet gevonden';
  end if;

  if p_tennis and not ev.has_tennis then
    raise exception 'Op dit evenement wordt geen tennis gespeeld';
  end if;
  if p_padel and not ev.has_padel then
    raise exception 'Op dit evenement wordt geen padel gespeeld';
  end if;
  if p_eats and ev.catering is null then
    raise exception 'Op dit evenement kan je niet inschrijven om te eten';
  end if;
  if not (p_tennis or p_padel or p_eats) then
    raise exception 'Kies tennis, padel of eten';
  end if;

  select * into existing from public.registrations
  where event_id = p_event_id and member_id = p_member_id;

  if found then
    perform public.assert_may_change_registration(existing);
    update public.registrations set
      tennis = p_tennis,
      padel = p_padel,
      eats = p_eats,
      -- Staying on keeps your place in line; signing up again goes last.
      tennis_since = case when p_tennis then coalesce(tennis_since, now()) end,
      padel_since = case when p_padel then coalesce(padel_since, now()) end,
      updated_at = now()
    where id = existing.id
    returning id into saved;
  else
    if not public.is_organiser()
      and now() >= coalesce(ev.registration_deadline, ev.starts_at) then
      raise exception 'De inschrijvingen voor dit evenement zijn gesloten';
    end if;
    insert into public.registrations (
      event_id, member_id, tennis, padel, eats, tennis_since, padel_since, registered_by
    ) values (
      p_event_id, p_member_id, p_tennis, p_padel, p_eats,
      case when p_tennis then now() end,
      case when p_padel then now() end,
      auth.uid()
    )
    returning id into saved;
  end if;

  return saved;
end;
$$;

-- Unregister a member from an event.
create function public.cancel_registration(p_registration_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  reg public.registrations;
begin
  select * into reg from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'Inschrijving niet gevonden';
  end if;
  perform public.assert_may_change_registration(reg);
  delete from public.registrations where id = p_registration_id;
end;
$$;

-- Name and email address of a registered member, for the confirmation mail.
-- Only for whoever just saved the registration, or the member themselves.
create function public.registration_contact(p_registration_id uuid)
returns table (full_name text, email text, registered_by_name text, is_self boolean)
language sql stable security definer set search_path = ''
as $$
  select m.full_name, m.email, p.full_name, m.profile_id is not distinct from auth.uid()
  from public.registrations r
  join public.club_members m on m.id = r.member_id
  left join public.profiles p on p.id = auth.uid()
  where r.id = p_registration_id
    and public.is_approved()
    and r.updated_at > now() - interval '5 minutes';
$$;

revoke execute on function
  public.assert_may_change_registration(public.registrations)
from public, anon, authenticated;

revoke execute on function
  public.save_registration(uuid, uuid, boolean, boolean, boolean),
  public.cancel_registration(uuid),
  public.registration_contact(uuid)
from public, anon;

grant execute on function
  public.save_registration(uuid, uuid, boolean, boolean, boolean),
  public.cancel_registration(uuid),
  public.registration_contact(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Existing events and registrations
-- ---------------------------------------------------------------------------

-- Events with series offer the sports of their series.
update public.events e set
  has_tennis = exists (
    select 1 from public.event_categories c where c.event_id = e.id and c.sport = 'tennis'
  ),
  has_padel = exists (
    select 1 from public.event_categories c where c.event_id = e.id and c.sport = 'padel'
  )
where exists (select 1 from public.event_categories c where c.event_id = e.id);

alter table public.events
  add constraint events_has_a_sport check (has_tennis or has_padel);

-- Everyone registered in a series plays that sport, in the order they
-- registered. Safe to run again: members already in the new table are skipped.
insert into public.registrations (
  event_id, member_id, tennis, padel, tennis_since, padel_since, registered_by, created_at
)
select
  c.event_id,
  ep.member_id,
  bool_or(c.sport = 'tennis'),
  bool_or(c.sport = 'padel'),
  min(ep.created_at) filter (where c.sport = 'tennis'),
  min(ep.created_at) filter (where c.sport = 'padel'),
  (array_agg(ep.registered_by order by ep.created_at))[1],
  min(ep.created_at)
from public.entry_players ep
join public.event_categories c on c.id = ep.category_id
group by c.event_id, ep.member_id
on conflict (event_id, member_id) do nothing;
