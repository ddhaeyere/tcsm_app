import { RegistrationForm, type CurrentChoice } from "@/components/registration-form";
import {
  RegistrationTable,
  type TablePart,
  type TableRegistration,
} from "@/components/registration-table";
import { Card } from "@/components/ui";
import { isOrganiser } from "@/lib/auth";
import { sportLabel } from "@/lib/format";
import {
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
        closed={event.registrations_closed_at !== null}
        eaters={eaters(event).map((r) => r.member?.full_name ?? "Onbekend")}
      />
    </Card>
  );
}

// Everyone registered, in one table. Organisers (manage) can change and
// remove registrations from it.
export function RegistrationOverview({
  event,
  me,
  manage = false,
  registeredByNames,
}: {
  event: ClubEvent;
  me: ClubMember | null;
  manage?: boolean;
  // Account names by profile id, for "door ..." under the name.
  registeredByNames?: Map<string, string>;
}) {
  const position = (list: Registration[]) => new Map(list.map((r, i) => [r.id, i + 1]));
  const tennis = sportLists(event, "tennis");
  const padel = sportLists(event, "padel");
  const order = {
    tennis: position([...tennis.players, ...tennis.reserves]),
    padel: position([...padel.players, ...padel.reserves]),
    eats: position(eaters(event)),
  };

  const rows: TableRegistration[] = event.registrations.map((r) => ({
    id: r.id,
    member_id: r.member_id,
    full_name: r.member?.full_name ?? "Onbekend",
    rankings: [
      offersSport(event, "tennis") &&
        [r.member?.tennis_singles_ranking, r.member?.tennis_doubles_ranking].some(Boolean) &&
        `T ${[r.member?.tennis_singles_ranking, r.member?.tennis_doubles_ranking].map((x) => (x ? `${x}p` : "–")).join("/")}`,
      offersSport(event, "padel") && rankingText(r.member, "padel") && `P ${rankingText(r.member, "padel")}`,
    ].filter((x): x is string => !!x),
    is_me: r.member_id === me?.id,
    tennis: r.tennis,
    padel: r.padel,
    eats: r.eats,
    order: {
      tennis: order.tennis.get(r.id) ?? null,
      padel: order.padel.get(r.id) ?? null,
      eats: order.eats.get(r.id) ?? null,
    },
    reserve: {
      tennis: reservePlace(event, "tennis", r.member_id),
      padel: reservePlace(event, "padel", r.member_id),
    },
    registered_by_name:
      manage && r.registered_by ? (registeredByNames?.get(r.registered_by) ?? null) : null,
  }));

  const sportCount = (sport: Sport, lists: { players: Registration[]; reserves: Registration[] }) => {
    const max = maxPlayers(event, sport);
    const count = max === null ? `${lists.players.length}` : `${lists.players.length}/${max}`;
    return lists.reserves.length ? `${count} +${lists.reserves.length} res.` : count;
  };
  const parts: TablePart[] = [
    ...(offersSport(event, "tennis")
      ? [{ part: "tennis" as const, label: sportLabel("tennis"), count: sportCount("tennis", tennis) }]
      : []),
    ...(offersSport(event, "padel")
      ? [{ part: "padel" as const, label: sportLabel("padel"), count: sportCount("padel", padel) }]
      : []),
    ...(event.catering
      ? [{ part: "eats" as const, label: event.catering, count: `${eaters(event).length}` }]
      : []),
  ];

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">
        Wie doet er mee?{" "}
        <span className="font-normal text-stone-500">({event.registrations.length})</span>
      </h2>
      <RegistrationTable eventId={event.id} registrations={rows} parts={parts} manage={manage} />
    </Card>
  );
}
