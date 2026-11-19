import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RegisterCard, RegistrationOverview } from "@/components/event-registrations";
import { PlanningEditor } from "@/components/planning-editor";
import { PlanningView } from "@/components/planning-view";
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
import { plannablePlayers } from "@/lib/planning";
import { SPORTS, describeChoice, offersSport, reservePlace } from "@/lib/registrations";
import { createClient } from "@/lib/supabase/server";
import {
  EVENT_SELECT,
  MEMBER_COLUMNS,
  type ClubEvent,
  type ClubMember,
  type EventPlanning,
  type PlanningMatch,
} from "@/lib/types";

export const metadata: Metadata = { title: "Evenement" };

export default async function EventPage({
  params,
  searchParams,
}: PageProps<"/evenementen/[id]">) {
  const { id } = await params;
  const { tab } = await searchParams;
  const profile = await requireApprovedProfile();
  const me = await getCurrentMember();
  const supabase = await createClient();

  // The planning rows come back only for organisers, or for everyone once
  // the planning is released (row level security).
  const [{ data }, { data: memberRows }, { data: planningRow }, { data: matchRows }] =
    await Promise.all([
      supabase.from("events").select(EVENT_SELECT).eq("id", id).maybeSingle(),
      supabase
        .from("club_members")
        .select(MEMBER_COLUMNS)
        .order("last_name")
        .order("first_name"),
      supabase
        .from("event_plannings")
        .select("event_id, slots, tennis_courts, padel_courts, slot_labels, released_at, updated_at")
        .eq("event_id", id)
        .maybeSingle(),
      supabase
        .from("planning_matches")
        .select("slot, sport, court, side_a, side_b")
        .eq("event_id", id),
    ]);
  if (!data) notFound();

  const planning = (planningRow as EventPlanning | null) ?? null;
  const matches = (matchRows ?? []) as PlanningMatch[];
  const organiser = isOrganiser(profile);
  const showPlanningTab = organiser || planning?.released_at != null;
  const activeTab = tab === "planning" && showPlanningTab ? "planning" : "inschrijven";

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
          {open && event.registrations_closed_at
            ? "De inschrijvingen zijn afgesloten. Wie nu nog inschrijft voor tennis of padel, komt op de reservelijst."
            : open
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
        {organiser && (
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

      {showPlanningTab && (
        <nav className="mb-4 flex gap-1 rounded-xl bg-stone-100 p-1" aria-label="Onderdelen">
          {(
            [
              ["inschrijven", "Inschrijven", `/evenementen/${event.id}`],
              ["planning", "Planning", `/evenementen/${event.id}?tab=planning`],
            ] as const
          ).map(([key, label, href]) => (
            <Link
              key={key}
              href={href}
              scroll={false}
              aria-current={activeTab === key ? "page" : undefined}
              className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold ${
                activeTab === key ? "bg-white text-club-800 shadow-sm" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {label}
              {key === "planning" && organiser && !planning?.released_at && (
                <span className="ml-1 font-normal text-stone-500">(verborgen)</span>
              )}
            </Link>
          ))}
        </nav>
      )}

      {activeTab === "inschrijven" ? (
        <div className="space-y-4">
          {canRegister && <RegisterCard event={event} profile={profile} me={me} members={members} />}
          <RegistrationOverview event={event} me={me} />
        </div>
      ) : organiser ? (
        <PlanningEditor
          eventId={event.id}
          planning={planning}
          matches={matches}
          players={plannablePlayers(event)}
          sports={SPORTS.filter((s) => offersSport(event, s))}
        />
      ) : (
        planning && (
          <PlanningView
            planning={planning}
            matches={matches}
            names={new Map(members.map((m) => [m.id, m.full_name]))}
            myMemberId={me?.id ?? null}
          />
        )
      )}
    </>
  );
}
