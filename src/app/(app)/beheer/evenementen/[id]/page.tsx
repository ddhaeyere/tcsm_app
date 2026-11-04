import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteEvent, updateEvent } from "@/app/actions/events";
import { RegisterCard, RegistrationLists } from "@/components/event-registrations";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, PageTitle } from "@/components/ui";
import { getCurrentMember, requireOrganiser } from "@/lib/auth";
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
