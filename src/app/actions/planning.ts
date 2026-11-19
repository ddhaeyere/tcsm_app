"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/forms";
import { requireOrganiser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PlanningMatch } from "@/lib/types";

function refresh(eventId: string) {
  revalidatePath(`/evenementen/${eventId}`);
}

const MAX_SLOTS = 50;
const MAX_COURTS = 30;

// Saves the whole planning of an event: slots, courts and every match.
export async function savePlanning(input: {
  eventId: string;
  slots: number;
  tennisCourts: number;
  padelCourts: number;
  slotLabels: string[];
  matches: PlanningMatch[];
}): Promise<ActionState> {
  await requireOrganiser();
  const whole = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  if (!whole(input.slots, 1, MAX_SLOTS)) return { error: `Kies 1 tot ${MAX_SLOTS} tijdsslots.` };
  if (!whole(input.tennisCourts, 0, MAX_COURTS) || !whole(input.padelCourts, 0, MAX_COURTS))
    return { error: `Kies 0 tot ${MAX_COURTS} velden.` };
  if (input.tennisCourts + input.padelCourts === 0) return { error: "Kies minstens één veld." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_event_planning", {
    p_event_id: input.eventId,
    p_slots: input.slots,
    p_tennis_courts: input.tennisCourts,
    p_padel_courts: input.padelCourts,
    p_slot_labels: input.slotLabels.slice(0, input.slots).map((l) => l.trim()),
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
