import { sportLabel } from "./format";
import { offersSport, sportLists } from "./registrations";
import type { ClubEvent, EventPlanning, PlanningMatch, Sport } from "./types";

// The planning settings of one sport: time slots, slot names and courts.
export interface SportSetup {
  slots: number;
  courts: number;
  labels: string[];
}

export function sportSetup(planning: EventPlanning, sport: Sport): SportSetup {
  return sport === "tennis"
    ? { slots: planning.tennis_slots, courts: planning.tennis_courts, labels: planning.tennis_slot_labels }
    : { slots: planning.padel_slots, courts: planning.padel_courts, labels: planning.padel_slot_labels };
}

export function courtLabel(sport: Sport, court: number): string {
  return `${sportLabel(sport)} ${court}`;
}

export function slotLabel(labels: string[], slot: number): string {
  return labels[slot - 1]?.trim() || `Ronde ${slot}`;
}

export function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
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
