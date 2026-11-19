-- A planning per event: who plays whom, per time slot and court. Organisers
-- (admins) set the number of time slots and of tennis and padel courts, fill
-- in the matches by hand and release the planning. Until it is released only
-- organisers can read it; after that every approved member can read it.
--
-- This migration only adds new tables and functions: no existing data changes.

create table public.event_plannings (
  event_id uuid primary key references public.events (id) on delete cascade,
  slots integer not null default 1 check (slots between 1 and 50),
  tennis_courts integer not null default 0 check (tennis_courts between 0 and 30),
  padel_courts integer not null default 0 check (padel_courts between 0 and 30),
  -- Optional name per time slot, e.g. "14:00"; empty means "Ronde n".
  slot_labels text[] not null default '{}',
  -- Null while only organisers see the planning.
  released_at timestamptz,
  updated_at timestamptz not null default now()
);

-- One match: a court in a time slot, with one or two players per side.
create table public.planning_matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.event_plannings (event_id) on delete cascade,
  slot integer not null check (slot >= 1),
  sport public.sport not null,
  court integer not null check (court >= 1),
  side_a uuid[] not null default '{}' check (cardinality(side_a) <= 2),
  side_b uuid[] not null default '{}' check (cardinality(side_b) <= 2),
  unique (event_id, slot, sport, court)
);

alter table public.event_plannings enable row level security;
alter table public.planning_matches enable row level security;

create policy "plannings: organisers, or members once released"
  on public.event_plannings for select to authenticated
  using (public.is_organiser() or (released_at is not null and public.is_approved()));

create policy "planning matches: organisers, or members once released"
  on public.planning_matches for select to authenticated
  using (
    public.is_organiser()
    or (
      public.is_approved()
      and exists (
        select 1 from public.event_plannings p
        where p.event_id = planning_matches.event_id and p.released_at is not null
      )
    )
  );

-- Writes only go through the functions below.
revoke all on public.event_plannings, public.planning_matches from anon, authenticated;
grant select on public.event_plannings, public.planning_matches to authenticated;

-- Saves the whole planning of an event at once: the numbers of slots and
-- courts, the slot names and every match. p_matches is a JSON array of
-- {slot, sport, court, side_a: [member ids], side_b: [member ids]}.
-- Matches outside the slots or courts are refused. Keeps released_at as it is.
create function public.save_event_planning(
  p_event_id uuid,
  p_slots integer,
  p_tennis_courts integer,
  p_padel_courts integer,
  p_slot_labels text[],
  p_matches jsonb
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  m jsonb;
  a uuid[];
  b uuid[];
  courts integer;
begin
  if not public.is_organiser() then
    raise exception 'Alleen beheerders kunnen de planning aanpassen';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Evenement niet gevonden';
  end if;

  insert into public.event_plannings (event_id, slots, tennis_courts, padel_courts, slot_labels, updated_at)
  values (p_event_id, p_slots, p_tennis_courts, p_padel_courts, coalesce(p_slot_labels, '{}'), now())
  on conflict (event_id) do update
    set slots = excluded.slots,
        tennis_courts = excluded.tennis_courts,
        padel_courts = excluded.padel_courts,
        slot_labels = excluded.slot_labels,
        updated_at = now();

  delete from public.planning_matches where event_id = p_event_id;

  for m in select * from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) loop
    a := array(select jsonb_array_elements_text(coalesce(m -> 'side_a', '[]'::jsonb))::uuid);
    b := array(select jsonb_array_elements_text(coalesce(m -> 'side_b', '[]'::jsonb))::uuid);
    if cardinality(a) = 0 and cardinality(b) = 0 then
      continue;
    end if;
    courts := case when m ->> 'sport' = 'tennis' then p_tennis_courts else p_padel_courts end;
    if (m ->> 'slot')::int > p_slots or (m ->> 'court')::int > courts then
      raise exception 'Er staat een wedstrijd op een tijdsslot of veld dat niet bestaat';
    end if;
    if exists (
      select 1 from unnest(a || b) as x(member_id)
      where not exists (
        select 1 from public.registrations r
        where r.event_id = p_event_id and r.member_id = x.member_id
      )
    ) then
      raise exception 'Er staat iemand in de planning die niet ingeschreven is';
    end if;
    insert into public.planning_matches (event_id, slot, sport, court, side_a, side_b)
    values (p_event_id, (m ->> 'slot')::int, (m ->> 'sport')::public.sport, (m ->> 'court')::int, a, b);
  end loop;
end;
$$;

-- Releases the planning to every member, or takes it back.
create function public.set_event_planning_released(p_event_id uuid, p_released boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_organiser() then
    raise exception 'Alleen beheerders kunnen de planning vrijgeven';
  end if;
  update public.event_plannings
  set released_at = case when p_released then now() else null end
  where event_id = p_event_id;
  if not found then
    raise exception 'Sla eerst een planning op';
  end if;
end;
$$;

revoke all on function public.save_event_planning(uuid, integer, integer, integer, text[], jsonb) from public, anon;
revoke all on function public.set_event_planning_released(uuid, boolean) from public, anon;
grant execute on function public.save_event_planning(uuid, integer, integer, integer, text[], jsonb) to authenticated;
grant execute on function public.set_event_planning_released(uuid, boolean) to authenticated;
