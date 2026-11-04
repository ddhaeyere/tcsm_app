-- Organisers can close the registrations of an event by hand. From then on
-- everyone who still signs up for a sport ends up on the reserve list, even
-- when there is room. Who was registered before stays where they were.
-- Null means the registrations are open (up to the deadline and maximum).
alter table public.events
  add column registrations_closed_at timestamptz;
