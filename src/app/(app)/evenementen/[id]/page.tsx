import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RegisterCard, RegistrationOverview } from "@/components/event-registrations";
import {
  getCurrentMember,
  isOrganiser,
  requireApprovedProfile,
} from "@/lib/auth";
import {
  formatDateTime,
  isRegistrationOpen,
  registrationClosesAt,
} from "@/lib/format";
import { SPORTS, describeChoice, reservePlace } from "@/lib/registrations";
import { createClient } from "@/lib/supabase/server";
import {
  EVENT_SELECT,
  MEMBER_COLUMNS,
  type ClubEvent,
  type ClubMember,
} from "@/lib/types";

export const metadata: Metadata = { title: "Evenement" };

export default async function EventPage({
  params,
}: PageProps<"/evenementen/[id]">) {
  const { id } = await params;
  const profile = await requireApprovedProfile();
  const me = await getCurrentMember();
  const supabase = await createClient();

  const [{ data }, { data: memberRows }] = await Promise.all([
    supabase.from("events").select(EVENT_SELECT).eq("id", id).maybeSingle(),
    supabase
      .from("club_members")
      .select(MEMBER_COLUMNS)
      .order("last_name")
      .order("first_name"),
  ]);
  if (!data) notFound();

  const event = data as unknown as ClubEvent;
  const members = (memberRows ?? []) as ClubMember[];
  const open = isRegistrationOpen(event);
  // Admins keep registering members after the deadline.
  const canRegister = open || isOrganiser(profile);
  const mine = me && event.registrations.find((r) => r.member_id === me.id);
  const myReserves = me
    ? SPORTS.map((sport) => ({ sport, place: reservePlace(event, sport, me.id) })).filter(
        (r) => r.place !== null,
      )
    : [];

  return (
    <>
      <Link href="/" className="text-sm text-club-700 underline">
        ← Alle evenementen
      </Link>

      <div className="mt-2 mb-4">
        <h1 className="text-2xl font-bold">{event.title}</h1>
        <p className="mt-1 text-stone-700">
          {formatDateTime(event.starts_at)}
          {event.location && ` · ${event.location}`}
        </p>
        <p className="mt-1 text-sm text-stone-600">
          {open
            ? `Inschrijven kan tot ${formatDateTime(registrationClosesAt(event).toISOString())}.`
            : isOrganiser(profile)
              ? "De inschrijvingen zijn gesloten. Als beheerder kan je nog leden inschrijven."
              : "De inschrijvingen zijn gesloten."}
        </p>
        {event.description && (
          <p className="mt-3 whitespace-pre-line text-stone-800">
            {event.description}
          </p>
        )}
        {isOrganiser(profile) && (
          <Link
            href={`/beheer/evenementen/${event.id}`}
            className="mt-3 inline-block text-sm text-club-700 underline"
          >
            Evenement beheren
          </Link>
        )}
      </div>

      {mine && (
        <p className="mb-4 rounded-lg bg-club-50 p-3 text-sm text-club-900">
          <strong>Je bent ingeschreven</strong> voor {describeChoice(mine, event.catering)}.
          {myReserves.map((r) => (
            <span key={r.sport}>
              {" "}
              Voor {r.sport} sta je op de reservelijst (plaats {r.place}).
            </span>
          ))}
        </p>
      )}

      <div className="space-y-4">
        {canRegister && <RegisterCard event={event} profile={profile} me={me} members={members} />}
        <RegistrationOverview event={event} me={me} />
      </div>
    </>
  );
}
