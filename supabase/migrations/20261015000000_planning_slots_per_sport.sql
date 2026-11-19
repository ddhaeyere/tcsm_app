-- Tennis and padel can have a different number of time slots, each with
-- their own names (e.g. tennis rounds of 45 minutes, padel rounds of 30).
--
-- Only adds columns: existing plannings and matches stay as they are. Both
-- sports start with the number of slots and slot names the planning had.
-- The old columns slots and slot_labels stay, slots holds the larger of the two.

alter table public.event_plannings
  add column tennis_slots integer check (tennis_slots between 0 and 50),
  add column padel_slots integer check (padel_slots between 0 and 50),
  add column tennis_slot_labels text[] not null default '{}',
  add column padel_slot_labels text[] not null default '{}';

update public.event_plannings
set tennis_slots = slots,
    padel_slots = slots,
    tennis_slot_labels = slot_labels,
    padel_slot_labels = slot_labels;

alter table public.event_plannings
  alter column tennis_slots set not null,
  alter column tennis_slots set default 0,
  alter column padel_slots set not null,
  alter column padel_slots set default 0;

-- The save function now takes the slots per sport. The old version is
-- replaced; it stored no data of its own.
drop function public.save_event_planning(uuid, integer, integer, integer, text[], jsonb);

-- Saves the whole planning of an event at once. p_matches is a JSON array of
-- {slot, sport, court, side_a: [member ids], side_b: [member ids]}.
-- Matches outside the slots or courts of their sport are refused. Keeps
-- released_at as it is.
create function public.save_event_planning(
  p_event_id uuid,
  p_tennis_slots integer,
  p_padel_slots integer,
  p_tennis_courts integer,
  p_padel_courts integer,
  p_tennis_slot_labels text[],
  p_padel_slot_labels text[],
  p_matches jsonb
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  m jsonb;
  a uuid[];
  b uuid[];
  max_slot integer;
  max_court integer;
begin
  if not public.is_organiser() then
    raise exception 'Alleen beheerders kunnen de planning aanpassen';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Evenement niet gevonden';
  end if;

  insert into public.event_plannings (
    event_id, slots, tennis_slots, padel_slots, tennis_courts, padel_courts,
    tennis_slot_labels, padel_slot_labels, updated_at
  )
  values (
    p_event_id, greatest(p_tennis_slots, p_padel_slots, 1), p_tennis_slots, p_padel_slots,
    p_tennis_courts, p_padel_courts,
    coalesce(p_tennis_slot_labels, '{}'), coalesce(p_padel_slot_labels, '{}'), now()
  )
  on conflict (event_id) do update
    set slots = excluded.slots,
        tennis_slots = excluded.tennis_slots,
        padel_slots = excluded.padel_slots,
        tennis_courts = excluded.tennis_courts,
        padel_courts = excluded.padel_courts,
        tennis_slot_labels = excluded.tennis_slot_labels,
        padel_slot_labels = excluded.padel_slot_labels,
        updated_at = now();

  delete from public.planning_matches where event_id = p_event_id;

  for m in select * from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) loop
    a := array(select jsonb_array_elements_text(coalesce(m -> 'side_a', '[]'::jsonb))::uuid);
    b := array(select jsonb_array_elements_text(coalesce(m -> 'side_b', '[]'::jsonb))::uuid);
    if cardinality(a) = 0 and cardinality(b) = 0 then
      continue;
    end if;
    max_slot := case when m ->> 'sport' = 'tennis' then p_tennis_slots else p_padel_slots end;
    max_court := case when m ->> 'sport' = 'tennis' then p_tennis_courts else p_padel_courts end;
    if (m ->> 'slot')::int > max_slot or (m ->> 'court')::int > max_court then
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

revoke all on function public.save_event_planning(uuid, integer, integer, integer, integer, text[], text[], jsonb) from public, anon;
grant execute on function public.save_event_planning(uuid, integer, integer, integer, integer, text[], text[], jsonb) to authenticated;
