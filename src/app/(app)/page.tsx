import Link from "next/link";
import { Badge, Card, PageTitle } from "@/components/ui";
import { getCurrentMember, requireApprovedProfile } from "@/lib/auth";
import { formatDateTime, formatDay, hoursAgo, isRegistrationOpen } from "@/lib/format";
import { SPORTS, eaters, maxPlayers, offersSport, sportLists } from "@/lib/registrations";
import { createClient } from "@/lib/supabase/server";
import { EVENT_SELECT, type ClubEvent } from "@/lib/types";

export default async function EventsPage() {
  await requireApprovedProfile();
  const me = await getCurrentMember();
  const supabase = await createClient();

  // Keep today's events visible for a while after they started.
  const since = hoursAgo(12);

  const { data: events } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .gte("starts_at", since.toISOString())
    .order("starts_at");

  const list = (events ?? []) as unknown as ClubEvent[];

  return (
    <>
      <PageTitle sub="Zie wie er al meedoet en schrijf je in.">Clubevenementen</PageTitle>

      {list.length === 0 && (
        <Card>
          <p className="text-stone-600">Er staan nog geen evenementen gepland.</p>
        </Card>
      )}

      <div className="space-y-3">
        {list.map((event) => (
          <EventCard key={event.id} event={event} memberId={me?.id ?? null} />
        ))}
      </div>
    </>
  );
}

function EventCard({ event, memberId }: { event: ClubEvent; memberId: string | null }) {
  const { day, month } = formatDay(event.starts_at);
  const players = event.registrations.filter((r) => r.tennis || r.padel);
  const uniqueNames = players.map((r) => r.member?.full_name ?? "");
  const joined = event.registrations.some((r) => r.member_id === memberId);
  const open = isRegistrationOpen(event);

  return (
    <Link href={`/evenementen/${event.id}`} className="block">
      <Card className="flex gap-4 transition hover:border-club-600">
        <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-club-50 py-2 text-club-800">
          <span className="text-2xl leading-none font-bold">{day}</span>
          <span className="text-xs uppercase">{month}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-stone-900">{event.title}</h2>
            {joined && <Badge tone="green">Je doet mee</Badge>}
            {!open && <Badge>Inschrijvingen gesloten</Badge>}
            {open && event.registrations_closed_at && <Badge tone="amber">Enkel nog reservelijst</Badge>}
          </div>
          <p className="text-sm text-stone-600">{formatDateTime(event.starts_at)}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {SPORTS.filter((sport) => offersSport(event, sport)).map((sport) => {
              const { players: playing, reserves } = sportLists(event, sport);
              const max = maxPlayers(event, sport);
              return (
                <Badge key={sport} tone={sport === "padel" ? "club" : "neutral"}>
                  {sport === "padel" ? "Padel" : "Tennis"}: {playing.length}
                  {max !== null && ` / ${max}`}
                  {reserves.length > 0 && ` + ${reserves.length} reserve`}
                </Badge>
              );
            })}
            {event.catering && (
              <Badge tone="amber">
                {event.catering}: {eaters(event).length}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-stone-700">
            {uniqueNames.length === 0 ? (
              "Nog niemand ingeschreven. Wees de eerste!"
            ) : (
              <>
                <strong>{uniqueNames.length}</strong>{" "}
                {uniqueNames.length === 1 ? "speler doet" : "spelers doen"} mee:{" "}
                {uniqueNames.slice(0, 4).join(", ")}
                {uniqueNames.length > 4 && ` en ${uniqueNames.length - 4} anderen`}
              </>
            )}
          </p>
        </div>
      </Card>
    </Link>
  );
}
