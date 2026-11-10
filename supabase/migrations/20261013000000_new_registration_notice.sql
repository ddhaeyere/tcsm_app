-- Admins get a mail when a member registers for an event. The app asks for
-- the recipients right after a new registration is saved. This column makes
-- sure the mail goes out only once per registration, so changing a
-- registration later sends nothing.
alter table public.registrations
  add column admins_notified_at timestamptz;

-- Registrations that already exist count as announced.
update public.registrations set admins_notified_at = created_at;

-- Only admins who ask for it get these mails. For now that is Dieter.
alter table public.profiles
  add column notify_registrations boolean not null default false;

update public.profiles
set notify_registrations = true
where email = 'dieter.dhaeyere@gmail.com';

-- Returns one row per admin to mail (approved, with notify_registrations on), and nothing when this registration was
-- already announced, is older than five minutes, or was not made by the
-- caller. The admin who made the registration gets no mail about it.
create function public.claim_registration_notice(p_registration_id uuid)
returns table (
  admin_email text,
  member_name text,
  registered_by_name text,
  is_self boolean,
  event_title text
)
language plpgsql security definer set search_path = ''
as $$
declare
  reg public.registrations;
begin
  update public.registrations
  set admins_notified_at = now()
  where id = p_registration_id
    and registered_by = auth.uid()
    and admins_notified_at is null
    and created_at > now() - interval '5 minutes'
  returning * into reg;

  if reg.id is null then
    return;
  end if;

  return query
    select a.email, m.full_name, p.full_name, m.profile_id is not distinct from auth.uid(), e.title
    from public.profiles a
    cross join public.club_members m
    cross join public.events e
    left join public.profiles p on p.id = auth.uid()
    where a.role = 'admin' and a.status = 'approved' and a.notify_registrations
      and a.id <> auth.uid()
      and m.id = reg.member_id
      and e.id = reg.event_id;
end;
$$;

revoke all on function public.claim_registration_notice(uuid) from public, anon;
grant execute on function public.claim_registration_notice(uuid) to authenticated;
