"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/forms";
import { requireOrganiser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SportSetup } from "@/lib/planning";
import type { PlanningMatch } from "@/lib/types";

function refresh(eventId: string) {
  revalidatePath(`/evenementen/${eventId}`);
}

const MAX_SLOTS = 50;
const MAX_COURTS = 30;

// Saves the whole planning of an event: per sport the slots, slot names and
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

  const labels = (setup: SportSetup) =>
    Array.from({ length: setup.slots }, (_, i) => (setup.labels[i] ?? "").trim());

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_event_planning", {
    p_event_id: input.eventId,
    p_tennis_slots: input.tennis.slots,
    p_padel_slots: input.padel.slots,
    p_tennis_courts: input.tennis.courts,
    p_padel_courts: input.padel.courts,
    p_tennis_slot_labels: labels(input.tennis),
    p_padel_slot_labels: labels(input.padel),
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
