import type { ClubEvent, Registration, Sport } from "./types";

export const SPORTS: Sport[] = ["tennis", "padel"];

export function offersSport(event: Pick<ClubEvent, "has_tennis" | "has_padel">, sport: Sport) {
  return sport === "tennis" ? event.has_tennis : event.has_padel;
}

export function maxPlayers(event: Pick<ClubEvent, "max_tennis" | "max_padel">, sport: Sport) {
  return sport === "tennis" ? event.max_tennis : event.max_padel;
}

function since(r: Registration, sport: Sport): string | null {
  return sport === "tennis" ? r.tennis_since : r.padel_since;
}

// Who plays the sport, in order of registration, split at the maximum: the
// rest is the reserve list. Someone dropping out moves the first reserve up.
// Once an organiser closed the registrations, whoever signed up after that
// is always a reserve, behind those already on the list.
export function sportLists(
  event: ClubEvent,
  sport: Sport,
): { players: Registration[]; reserves: Registration[] } {
  const all = event.registrations
    .filter((r) => since(r, sport) !== null)
    .sort(
      (a, b) =>
        Date.parse(since(a, sport)!) - Date.parse(since(b, sport)!) || a.id.localeCompare(b.id),
    );
  const closedAt = event.registrations_closed_at ? Date.parse(event.registrations_closed_at) : null;
  const inTime =
    closedAt === null ? all.length : all.filter((r) => Date.parse(since(r, sport)!) <= closedAt).length;
  const places = Math.min(maxPlayers(event, sport) ?? Infinity, inTime);
  return { players: all.slice(0, places), reserves: all.slice(places) };
}

// Place on the reserve list (1 is first), or null when the member plays.
export function reservePlace(event: ClubEvent, sport: Sport, memberId: string): number | null {
  const index = sportLists(event, sport).reserves.findIndex((r) => r.member_id === memberId);
  return index === -1 ? null : index + 1;
}

// Who eats along, in order of registration.
export function eaters(event: ClubEvent): Registration[] {
  return event.registrations
    .filter((r) => r.eats)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

// A member's tennis rankings as "15p enkel · 30p dubbel", or padel "P300".
export function rankingText(
  member: Registration["member"],
  sport: Sport,
): string {
  if (!member) return "";
  if (sport === "padel") return member.padel_ranking ?? "";
  return [
    member.tennis_singles_ranking && `${member.tennis_singles_ranking}p enkel`,
    member.tennis_doubles_ranking && `${member.tennis_doubles_ranking}p dubbel`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// "tennis, padel en eten (Barbecue)"
export function describeChoice(
  choice: { tennis: boolean; padel: boolean; eats: boolean },
  catering: string | null,
): string {
  const parts = [
    choice.tennis && "tennis",
    choice.padel && "padel",
    choice.eats && `eten${catering ? ` (${catering})` : ""}`,
  ].filter(Boolean) as string[];
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} en ${parts.at(-1)}` : parts.join("");
}
