import { TIME_ZONE, sportLabel } from "./format";
import { offersSport, sportLists } from "./registrations";
import type { ClubEvent, ClubMember, EventPlanning, PlanningMatch, SlotTime, Sport } from "./types";

// The planning settings of one sport: time slots with their times, and courts.
export interface SportSetup {
  slots: number;
  courts: number;
  times: SlotTime[];
}

export function sportSetup(planning: EventPlanning, sport: Sport): SportSetup {
  return sport === "tennis"
    ? { slots: planning.tennis_slots, courts: planning.tennis_courts, times: planning.tennis_slot_times ?? [] }
    : { slots: planning.padel_slots, courts: planning.padel_courts, times: planning.padel_slot_times ?? [] };
}

export function courtLabel(sport: Sport, court: number): string {
  return `${sportLabel(sport)} ${court}`;
}

// "19:15 – 20:00", or "Ronde 2" while the slot has no times yet.
export function slotLabel(times: SlotTime[], slot: number): string {
  const t = times[slot - 1];
  if (t?.start && t.end) return `${t.start} – ${t.end}`;
  if (t?.start) return `vanaf ${t.start}`;
  return `Ronde ${slot}`;
}

export function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}

export function matchKey(m: Pick<PlanningMatch, "slot" | "sport" | "court">): string {
  return `${m.slot}-${m.sport}-${m.court}`;
}

// Every quarter of an hour: "00:00", "00:15", … "23:45".
export const QUARTERS: string[] = Array.from(
  { length: 96 },
  (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`,
);

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(minutes: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 45, minutes));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// The start of an event on the Brussels clock, rounded down to a quarter.
export function eventStartTime(startsAt: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(startsAt));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return fromMinutes(h * 60 + Math.floor(m / 15) * 15);
}

// Fills in missing times: each slot starts where the previous one ended and
// lasts as long as the previous one (an hour for the first).
export function completeTimes(times: SlotTime[], slots: number, firstStart: string): SlotTime[] {
  const out: SlotTime[] = [];
  for (let i = 0; i < slots; i++) {
    const prev = out[i - 1];
    const length =
      prev?.start && prev.end ? toMinutes(prev.end) - toMinutes(prev.start) : 60;
    const start = times[i]?.start ?? (prev?.end ?? (i === 0 ? firstStart : null));
    const end = times[i]?.end ?? (start ? fromMinutes(toMinutes(start) + length) : null);
    out.push({ start, end });
  }
  return out;
}

export type PlayerRankings = Pick<
  ClubMember,
  "tennis_singles_ranking" | "tennis_doubles_ranking" | "padel_ranking"
>;

function points(ranking: string | null | undefined): number | null {
  if (!ranking) return null;
  const n = Number(ranking.replace(/^P/i, ""));
  return Number.isFinite(n) ? n : null;
}

// Tennis: "5" when singles and doubles are equal, else "5/15" (singles /
// doubles). Padel: the number without the P, e.g. "200". Empty when unknown.
export function rankingLabel(r: PlayerRankings | null | undefined, sport: Sport): string {
  if (!r) return "";
  if (sport === "padel") return r.padel_ranking ? r.padel_ranking.replace(/^P/i, "") : "";
  const s = r.tennis_singles_ranking;
  const d = r.tennis_doubles_ranking;
  if (!s && !d) return "";
  if (s === d) return s!;
  return `${s ?? "–"}/${d ?? "–"}`;
}

// The sum of the rankings of one side of a court. Tennis counts the singles
// ranking for one player and the doubles rankings for two; padel the padel
// ranking. Players without a ranking are counted in missing.
export function sideSum(
  sides: (PlayerRankings | null | undefined)[],
  sport: Sport,
): { sum: number; missing: number } {
  let sum = 0;
  let missing = 0;
  for (const r of sides) {
    const p = points(
      sport === "padel"
        ? r?.padel_ranking
        : sides.length === 1
          ? r?.tennis_singles_ranking
          : r?.tennis_doubles_ranking,
    );
    if (p === null) missing++;
    else sum += p;
  }
  return { sum, missing };
}

export interface PlanningPlayer extends PlayerRankings {
  member_id: string;
  name: string;
  reserve: boolean;
}

// Who can be planned per sport: the players, then the reserves.
export function plannablePlayers(event: ClubEvent): Record<Sport, PlanningPlayer[]> {
  const list = (sport: Sport): PlanningPlayer[] => {
    if (!offersSport(event, sport)) return [];
    const { players, reserves } = sportLists(event, sport);
    const row = (reserve: boolean) => (r: (typeof players)[number]): PlanningPlayer => ({
      member_id: r.member_id,
      name: r.member?.full_name ?? "Onbekend",
      reserve,
      tennis_singles_ranking: r.member?.tennis_singles_ranking ?? null,
      tennis_doubles_ranking: r.member?.tennis_doubles_ranking ?? null,
      padel_ranking: r.member?.padel_ranking ?? null,
    });
    return [...players.map(row(false)), ...reserves.map(row(true))];
  };
  return { tennis: list("tennis"), padel: list("padel") };
}

// Places (match key + member) where someone plays on two courts at once:
// twice in one match, or in matches whose times overlap, tennis and padel
// together.
export function findClashes(
  matches: PlanningMatch[],
  setups: Record<Sport, SportSetup>,
): Set<string> {
  const clashes = new Set<string>();
  const byMember = new Map<string, { key: string; start: number; end: number }[]>();
  for (const m of matches) {
    const t = setups[m.sport].times[m.slot - 1];
    const start = t?.start ? toMinutes(t.start) : null;
    const end = t?.end ? toMinutes(t.end) : null;
    const key = matchKey(m);
    const ids = [...m.side_a, ...m.side_b];
    for (const [i, id] of ids.entries()) {
      if (ids.indexOf(id) !== i) clashes.add(`${key}|${id}`);
      if (start === null || end === null) continue;
      const list = byMember.get(id) ?? [];
      for (const other of list)
        if (other.key !== key && start < other.end && other.start < end) {
          clashes.add(`${key}|${id}`);
          clashes.add(`${other.key}|${id}`);
        }
      list.push({ key, start, end });
      byMember.set(id, list);
    }
  }
  return clashes;
}
