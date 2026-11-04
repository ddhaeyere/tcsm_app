import { RegistrationForm, type CurrentChoice } from "@/components/registration-form";
import { Card } from "@/components/ui";
import { isOrganiser } from "@/lib/auth";
import { sportLabel } from "@/lib/format";
import {
  SPORTS,
  eaters,
  maxPlayers,
  offersSport,
  rankingText,
  reservePlace,
  sportLists,
} from "@/lib/registrations";
import type { ClubEvent, ClubMember, Profile, Registration, Sport } from "@/lib/types";

// The registration form: yourself first, then any other member. Members
// someone else registered are left out, unless you are an organiser.
export function RegisterCard({
  event,
  profile,
  me,
  members,
}: {
  event: ClubEvent;
  profile: Profile;
  me: ClubMember | null;
  members: ClubMember[];
}) {
  const organiser = isOrganiser(profile);
  const current: Record<string, CurrentChoice> = {};
  for (const r of event.registrations) {
    if (organiser || r.registered_by === profile.id || r.member_id === me?.id)
      current[r.member_id] = {
        registration_id: r.id,
        tennis: r.tennis,
        padel: r.padel,
        eats: r.eats,
        reserve: {
          tennis: reservePlace(event, "tennis", r.member_id),
          padel: reservePlace(event, "padel", r.member_id),
        },
      };
  }
  const registered = new Set(event.registrations.map((r) => r.member_id));
  const pickMe = me && (!registered.has(me.id) || current[me.id]) ? me : null;
  const others = members
    .filter((m) => m.id !== me?.id && (!registered.has(m.id) || current[m.id]))
    .map((m) => ({ id: m.id, full_name: m.full_name }));
  const choosable = pickMe
    ? [{ id: pickMe.id, full_name: `${pickMe.full_name} (ikzelf)` }, ...others]
    : others;

  const sportState = (sport: Sport) => ({
    offered: offersSport(event, sport),
    players: event.registrations.filter((r) => r[sport]).length,
    max: maxPlayers(event, sport),
  });

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Inschrijven of aanpassen</h2>
      <RegistrationForm
        eventId={event.id}
        members={choosable}
        defaultMemberId={pickMe?.id ?? ""}
        current={current}
        tennis={sportState("tennis")}
        padel={sportState("padel")}
        catering={event.catering}
        eaters={eaters(event).map((r) => r.member?.full_name ?? "Onbekend")}
      />
    </Card>
  );
}

// Who plays each sport (with the reserve list) and who eats along.
export function RegistrationLists({ event, me }: { event: ClubEvent; me: ClubMember | null }) {
  const name = (r: Registration) => (
    <span className={r.member_id === me?.id ? "font-semibold" : undefined}>
      {r.member?.full_name ?? "Onbekend"}
    </span>
  );

  return (
    <div className="space-y-4">
      {SPORTS.filter((sport) => offersSport(event, sport)).map((sport) => {
        const { players, reserves } = sportLists(event, sport);
        const max = maxPlayers(event, sport);
        return (
          <Card key={sport}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{sportLabel(sport)}</h2>
              <span className="text-sm text-stone-600">
                {players.length}
                {max !== null ? ` / ${max}` : ""} spelers
                {reserves.length > 0 && ` · ${reserves.length} op de reservelijst`}
              </span>
            </div>
            {players.length === 0 ? (
              <p className="mt-3 text-sm text-stone-600">Nog niemand ingeschreven.</p>
            ) : (
              <ol className="mt-3 divide-y divide-stone-100 text-sm">
                {players.map((r, i) => (
                  <li key={r.id} className="flex gap-3 py-1.5">
                    <span className="w-6 shrink-0 text-right text-stone-400">{i + 1}.</span>
                    <span className="min-w-0 flex-1">
                      {name(r)}
                      <span className="block text-xs text-stone-500">
                        {rankingText(r.member, sport) || "geen klassement"}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {reserves.length > 0 && (
              <>
                <h3 className="mt-4 text-sm font-semibold text-amber-800">Reservelijst</h3>
                <ol className="mt-1 divide-y divide-amber-100 rounded-lg bg-amber-50 px-2 text-sm">
                  {reserves.map((r, i) => (
                    <li key={r.id} className="flex gap-3 py-1.5">
                      <span className="w-6 shrink-0 text-right text-amber-700">{i + 1}.</span>
                      <span className="min-w-0 flex-1">
                        {name(r)}
                        <span className="block text-xs text-stone-500">
                          {rankingText(r.member, sport) || "geen klassement"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </Card>
        );
      })}

      {event.catering && (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{event.catering}</h2>
            <span className="text-sm text-stone-600">
              {eaters(event).length} {eaters(event).length === 1 ? "eet" : "eten"} mee
            </span>
          </div>
          {eaters(event).length === 0 ? (
            <p className="mt-3 text-sm text-stone-600">Nog niemand eet mee.</p>
          ) : (
            <p className="mt-3 text-sm text-stone-800">
              {eaters(event).map((r, i) => (
                <span key={r.id}>
                  {i > 0 && ", "}
                  {name(r)}
                </span>
              ))}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
