-- Time slots get a real start and end time (per quarter hour in the app),
-- per sport: [{"start": "19:15", "end": "20:00"}, ...], one entry per slot.
-- Because a member can play both tennis and padel, nobody may be planned on
-- two courts at overlapping times. The save function refuses that.
--
-- Only adds columns: existing plannings, matches and slot names stay. A slot
-- name that is a time ("14:00", "14u00", "14.00") becomes the start time of
-- that slot; the end time still has to be filled in.

alter table public.event_plannings
  add column tennis_slot_times jsonb not null default '[]',
  add column padel_slot_times jsonb not null default '[]';

create function public.slot_times_from_labels(p_labels text[], p_slots integer)
returns jsonb
language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'start',
      case when coalesce(p_labels[i], '') ~ '^\s*\d{1,2}\s*[:.hu]\s*\d{2}\s*$'
        then lpad(substring(p_labels[i] from '(\d{1,2})'), 2, '0') || ':' ||
             substring(p_labels[i] from '\d{1,2}\s*[:.hu]\s*(\d{2})')
      end,
      'end', null
    ) order by i
  ), '[]'::jsonb)
  from generate_series(1, p_slots) as i;
$$;

update public.event_plannings
set tennis_slot_times = public.slot_times_from_labels(tennis_slot_labels, tennis_slots),
    padel_slot_times = public.slot_times_from_labels(padel_slot_labels, padel_slots);

drop function public.slot_times_from_labels(text[], integer);

-- The save function now takes the slot times instead of the slot names.
-- It stores no data of its own, so it is simply replaced.
drop function public.save_event_planning(uuid, integer, integer, integer, integer, text[], text[], jsonb);

-- Reads "HH:MM" from slot p_slot (1-based) of a times array; null when absent
-- or not a time.
create function public.planning_slot_time(p_times jsonb, p_slot integer, p_field text)
returns time
language plpgsql immutable set search_path = ''
as $$
begin
  return (p_times -> (p_slot - 1) ->> p_field)::time;
exception when others then
  return null;
end;
$$;

-- Saves the whole planning of an event at once. p_*_slot_times hold one
-- {start, end} per slot. p_matches is a JSON array of
-- {slot, sport, court, side_a: [member ids], side_b: [member ids]}.
-- Refused: a slot without a valid start and end, a match outside the slots
-- or courts of its sport, someone who is not registered, and someone on two
-- courts at overlapping times (tennis and padel together). Keeps released_at.
create function public.save_event_planning(
  p_event_id uuid,
  p_tennis_slots integer,
  p_padel_slots integer,
  p_tennis_courts integer,
  p_padel_courts integer,
  p_tennis_slot_times jsonb,
  p_padel_slot_times jsonb,
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
  i integer;
  clash text;
begin
  if not public.is_organiser() then
    raise exception 'Alleen beheerders kunnen de planning aanpassen';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Evenement niet gevonden';
  end if;

  for i in 1 .. p_tennis_slots loop
    if coalesce(public.planning_slot_time(p_tennis_slot_times, i, 'end')
          <= public.planning_slot_time(p_tennis_slot_times, i, 'start'), true) then
      raise exception 'Tennis, tijdsslot %: kies een beginuur en een later einduur', i;
    end if;
  end loop;
  for i in 1 .. p_padel_slots loop
    if coalesce(public.planning_slot_time(p_padel_slot_times, i, 'end')
          <= public.planning_slot_time(p_padel_slot_times, i, 'start'), true) then
      raise exception 'Padel, tijdsslot %: kies een beginuur en een later einduur', i;
    end if;
  end loop;

  insert into public.event_plannings (
    event_id, slots, tennis_slots, padel_slots, tennis_courts, padel_courts,
    tennis_slot_times, padel_slot_times, updated_at
  )
  values (
    p_event_id, greatest(p_tennis_slots, p_padel_slots, 1), p_tennis_slots, p_padel_slots,
    p_tennis_courts, p_padel_courts,
    coalesce(p_tennis_slot_times, '[]'), coalesce(p_padel_slot_times, '[]'), now()
  )
  on conflict (event_id) do update
    set slots = excluded.slots,
        tennis_slots = excluded.tennis_slots,
        padel_slots = excluded.padel_slots,
        tennis_courts = excluded.tennis_courts,
        padel_courts = excluded.padel_courts,
        tennis_slot_times = excluded.tennis_slot_times,
        padel_slot_times = excluded.padel_slot_times,
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

  -- Nobody on two courts at once: the same person twice in one match, or in
  -- two matches whose times overlap, over tennis and padel together.
  with played as (
    select pm.id, x.member_id,
      public.planning_slot_time(
        case pm.sport when 'tennis' then p_tennis_slot_times else p_padel_slot_times end,
        pm.slot, 'start') as starts,
      public.planning_slot_time(
        case pm.sport when 'tennis' then p_tennis_slot_times else p_padel_slot_times end,
        pm.slot, 'end') as ends
    from public.planning_matches pm
    cross join lateral unnest(pm.side_a || pm.side_b) with ordinality as x(member_id, n)
    where pm.event_id = p_event_id
  ),
  numbered as (
    select row_number() over () as k, * from played
  )
  select coalesce(cm.full_name, 'Iemand') into clash
  from numbered p1
  join numbered p2 on p1.member_id = p2.member_id and p1.k < p2.k
  left join public.club_members cm on cm.id = p1.member_id
  where p1.id = p2.id or (p1.starts < p2.ends and p2.starts < p1.ends)
  limit 1;

  if clash is not null then
    raise exception '% staat op twee terreinen tegelijk', clash;
  end if;
end;
$$;

revoke all on function public.planning_slot_time(jsonb, integer, text) from public, anon;
revoke all on function public.save_event_planning(uuid, integer, integer, integer, integer, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_event_planning(uuid, integer, integer, integer, integer, jsonb, jsonb, jsonb) to authenticated;
