import { sportLabel } from "./format";
import { offersSport, sportLists } from "./registrations";
import type { ClubEvent, EventPlanning, PlanningMatch, Sport } from "./types";

export interface Court {
  sport: Sport;
  court: number;
  label: string;
}

// The courts of a planning in display order: tennis first, then padel.
export function planningCourts(planning: Pick<EventPlanning, "tennis_courts" | "padel_courts">): Court[] {
  const courts: Court[] = [];
  for (const [sport, count] of [
    ["tennis", planning.tennis_courts],
    ["padel", planning.padel_courts],
  ] as const)
    for (let court = 1; court <= count; court++)
      courts.push({ sport, court, label: `${sportLabel(sport)} ${court}` });
  return courts;
}

export function slotLabel(planning: Pick<EventPlanning, "slot_labels">, slot: number): string {
  return planning.slot_labels[slot - 1]?.trim() || `Ronde ${slot}`;
}

export function matchKey(m: Pick<PlanningMatch, "slot" | "sport" | "court">): string {
  return `${m.slot}-${m.sport}-${m.court}`;
}

export interface PlanningPlayer {
  member_id: string;
  name: string;
  reserve: boolean;
}

// Who can be planned per sport: the players, then the reserves.
export function plannablePlayers(event: ClubEvent): Record<Sport, PlanningPlayer[]> {
  const list = (sport: Sport): PlanningPlayer[] => {
    if (!offersSport(event, sport)) return [];
    const { players, reserves } = sportLists(event, sport);
    return [
      ...players.map((r) => ({ member_id: r.member_id, name: r.member?.full_name ?? "Onbekend", reserve: false })),
      ...reserves.map((r) => ({ member_id: r.member_id, name: r.member?.full_name ?? "Onbekend", reserve: true })),
    ];
  };
  return { tennis: list("tennis"), padel: list("padel") };
}
