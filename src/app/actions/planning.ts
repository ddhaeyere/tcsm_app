"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/forms";
import { requireOrganiser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { findClashes, type SportSetup } from "@/lib/planning";
import type { PlanningMatch } from "@/lib/types";

function refresh(eventId: string) {
  revalidatePath(`/evenementen/${eventId}`);
}

const MAX_SLOTS = 50;
const MAX_COURTS = 30;

// Saves the whole planning of an event: per sport the slots, slot times and
// courts, and every match.
export async function savePlanning(input: {
  eventId: string;
  tennis: SportSetup;
  padel: SportSetup;
  matches: PlanningMatch[];
}): Promise<ActionState> {
  await requireOrganiser();
  const whole = (n: number, max: number) => Number.isInteger(n) && n >= 0 && n <= max;
  for (const setup of [input.tennis, input.padel]) {
    if (!whole(setup.slots, MAX_SLOTS)) return { error: `Kies 0 tot ${MAX_SLOTS} tijdsslots.` };
    if (!whole(setup.courts, MAX_COURTS)) return { error: `Kies 0 tot ${MAX_COURTS} velden.` };
  }
  const used = [input.tennis, input.padel].filter((s) => s.slots > 0 && s.courts > 0);
  if (used.length === 0) return { error: "Kies minstens één tijdsslot en één veld." };

  // Every slot needs a start and a later end, on a quarter of an hour.
  const quarter = /^([01]\d|2[0-3]):(00|15|30|45)$/;
  for (const [sport, setup] of [["Tennis", input.tennis], ["Padel", input.padel]] as const)
    for (let i = 0; i < setup.slots; i++) {
      const t = setup.times[i];
      if (!t?.start || !t.end || !quarter.test(t.start) || !quarter.test(t.end) || t.end <= t.start)
        return { error: `${sport}, tijdsslot ${i + 1}: kies een beginuur en een later einduur.` };
    }
  const clashes = findClashes(input.matches, { tennis: input.tennis, padel: input.padel });
  if (clashes.size > 0)
    return { error: "Iemand staat op twee terreinen tegelijk. Pas de rood gemarkeerde namen aan." };

  const times = (setup: SportSetup) =>
    setup.times.slice(0, setup.slots).map((t) => ({ start: t.start, end: t.end }));

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_event_planning", {
    p_event_id: input.eventId,
    p_tennis_slots: input.tennis.slots,
    p_padel_slots: input.padel.slots,
    p_tennis_courts: input.tennis.courts,
    p_padel_courts: input.padel.courts,
    p_tennis_slot_times: times(input.tennis),
    p_padel_slot_times: times(input.padel),
    p_matches: input.matches.filter((m) => m.side_a.length || m.side_b.length),
  });
  if (error) return { error: error.message || "Opslaan lukte niet." };
  refresh(input.eventId);
  return { message: "Planning opgeslagen." };
}

// Releases the planning to every member, or hides it again.
export async function setPlanningReleased(input: {
  eventId: string;
  released: boolean;
}): Promise<ActionState> {
  await requireOrganiser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_event_planning_released", {
    p_event_id: input.eventId,
    p_released: input.released,
  });
  if (error) return { error: error.message || "Opslaan lukte niet." };
  refresh(input.eventId);
  return {
    message: input.released
      ? "De planning is vrijgegeven: iedereen kan ze nu zien."
      : "De planning is weer enkel zichtbaar voor beheerders.",
  };
}
