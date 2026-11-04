import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteEvent, updateEvent } from "@/app/actions/events";
import { RegisterCard, RegistrationLists } from "@/components/event-registrations";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ManageRegistrations, type ManagedRegistration } from "@/components/manage-registrations";
import { Card, PageTitle } from "@/components/ui";
import { getCurrentMember, requireOrganiser } from "@/lib/auth";
import { offersSport, reservePlace } from "@/lib/registrations";
import { createClient } from "@/lib/supabase/server";
import { EVENT_SELECT, MEMBER_COLUMNS, type ClubEvent, type ClubMember } from "@/lib/types";
import { EventFields } from "../event-fields";

export const metadata: Metadata = { title: "Evenement beheren" };

export default async function ManageEventPage({
  params,
}: PageProps<"/beheer/evenementen/[id]">) {
  const { id } = await params;
  const profile = await requireOrganiser();
  const me = await getCurrentMember();
  const supabase = await createClient();

  const [{ data }, { data: memberRows }] = await Promise.all([
    supabase.from("events").select(EVENT_SELECT).eq("id", id).maybeSingle(),
    supabase.from("club_members").select(MEMBER_COLUMNS).order("last_name").order("first_name"),
  ]);
  if (!data) notFound();
  const event = data as unknown as ClubEvent;
  const members = (memberRows ?? []) as ClubMember[];

  const registeredBy = [
    ...new Set(event.registrations.map((r) => r.registered_by).filter((id): id is string => !!id)),
  ];
  const { data: profileRows } = registeredBy.length
    ? await supabase.from("profiles").select("id, full_name").in("id", registeredBy)
    : { data: [] };
  const profileName = new Map((profileRows ?? []).map((p) => [p.id as string, p.full_name as string]));

  const managed: ManagedRegistration[] = event.registrations
    .map((r) => ({
      id: r.id,
      member_id: r.member_id,
      full_name: r.member?.full_name ?? "Onbekend",
      tennis: r.tennis,
      padel: r.padel,
      eats: r.eats,
      reserve: {
        tennis: reservePlace(event, "tennis", r.member_id),
        padel: reservePlace(event, "padel", r.member_id),
      },
      registered_by_name: r.registered_by ? (profileName.get(r.registered_by) ?? null) : null,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "nl"));
  const parts = [
    ...(offersSport(event, "tennis") ? [{ part: "tennis" as const, label: "Tennis" }] : []),
    ...(offersSport(event, "padel") ? [{ part: "padel" as const, label: "Padel" }] : []),
    ...(event.catering ? [{ part: "eats" as const, label: event.catering }] : []),
  ];

  return (
    <>
      <div className="flex justify-between text-sm">
        <Link href="/beheer" className="text-club-700 underline">
          ← Beheer
        </Link>
        <Link href={`/evenementen/${event.id}`} className="text-club-700 underline">
          Bekijk als lid
        </Link>
      </div>
      <PageTitle>{event.title}</PageTitle>

      <h2 className="mb-2 text-lg font-semibold">Inschrijvingen beheren</h2>
      <Card className="mb-6">
        <p className="mb-3 text-sm text-stone-600">
          {managed.length} {managed.length === 1 ? "inschrijving" : "inschrijvingen"}. Pas aan
          met het potlood, verwijder met het vuilbakje.
        </p>
        <ManageRegistrations eventId={event.id} registrations={managed} parts={parts} />
      </Card>

      <h2 className="mb-2 text-lg font-semibold">Inschrijvingen</h2>
      <div className="mb-6 space-y-4">
        <RegistrationLists event={event} me={me} />
        <RegisterCard event={event} profile={profile} me={me} members={members} />
      </div>

      <h2 className="mb-2 text-lg font-semibold">Gegevens</h2>
      <Card className="mb-6">
        <ActionForm action={updateEvent} className="space-y-4">
          <input type="hidden" name="event_id" value={event.id} />
          <EventFields event={event} />
          <SubmitButton>Opslaan</SubmitButton>
        </ActionForm>
      </Card>

      <ActionForm action={deleteEvent}>
        <input type="hidden" name="event_id" value={event.id} />
        <SubmitButton
          variant="danger"
          confirm="Dit evenement en alle inschrijvingen verwijderen? Dit kan niet ongedaan gemaakt worden."
        >
          Evenement verwijderen
        </SubmitButton>
      </ActionForm>
    </>
  );
}
