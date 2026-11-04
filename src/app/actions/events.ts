"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/forms";
import { requireOrganiser } from "@/lib/auth";
import { brusselsInputToIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function refresh(eventId?: string) {
  revalidatePath("/");
  revalidatePath("/beheer");
  if (eventId) {
    revalidatePath(`/evenementen/${eventId}`);
    revalidatePath(`/beheer/evenementen/${eventId}`);
  }
}

type EventFields = {
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  registration_deadline: string | null;
  has_tennis: boolean;
  has_padel: boolean;
  max_tennis: number | null;
  max_padel: number | null;
  catering: string | null;
};

function readEventFields(formData: FormData): EventFields | string {
  const title = String(formData.get("title") ?? "").trim();
  const startsAt = brusselsInputToIso(String(formData.get("starts_at") ?? ""));
  const endsRaw = String(formData.get("ends_at") ?? "");
  const deadlineRaw = String(formData.get("registration_deadline") ?? "");
  const endsAt = endsRaw ? brusselsInputToIso(endsRaw) : null;
  const deadline = deadlineRaw ? brusselsInputToIso(deadlineRaw) : null;

  if (!title) return "Geef het evenement een naam.";
  if (!startsAt) return "Kies wanneer het evenement begint.";
  if (endsAt && endsAt < startsAt) return "Het einde ligt voor het begin.";
  if (deadline && deadline > startsAt) return "De inschrijvingen moeten sluiten voor het begin.";

  const hasTennis = formData.get("has_tennis") === "on";
  const hasPadel = formData.get("has_padel") === "on";
  if (!hasTennis && !hasPadel) return "Kies tennis, padel of allebei.";
  const maxTennis = hasTennis ? readMax(formData.get("max_tennis")) : null;
  const maxPadel = hasPadel ? readMax(formData.get("max_padel")) : null;
  if (typeof maxTennis === "string") return maxTennis;
  if (typeof maxPadel === "string") return maxPadel;

  const hasCatering = formData.get("has_catering") === "on";
  const catering = String(formData.get("catering") ?? "").trim();
  if (hasCatering && !catering) return "Geef de catering een naam, bv. Barbecue.";

  return {
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    location: String(formData.get("location") ?? "").trim() || null,
    starts_at: startsAt,
    ends_at: endsAt,
    registration_deadline: deadline,
    has_tennis: hasTennis,
    has_padel: hasPadel,
    max_tennis: maxTennis,
    max_padel: maxPadel,
    catering: hasCatering ? catering : null,
  };
}

function readMax(value: FormDataEntryValue | null): number | null | string {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return "Het maximum aantal spelers moet een positief getal zijn.";
  return n;
}

export async function createEvent(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireOrganiser();
  const fields = readEventFields(formData);
  if (typeof fields === "string") return { error: fields };

  const supabase = await createClient();
  const { data: event, error } = await supabase
    .from("events")
    .insert({ ...fields, created_by: profile.id })
    .select("id")
    .single();
  if (error || !event) return { error: "Evenement aanmaken lukte niet." };

  refresh(event.id);
  redirect(`/beheer/evenementen/${event.id}`);
}

export async function updateEvent(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireOrganiser();
  const eventId = String(formData.get("event_id"));
  const fields = readEventFields(formData);
  if (typeof fields === "string") return { error: fields };

  const supabase = await createClient();
  const { data: registrations } = await supabase
    .from("registrations")
    .select("tennis, padel, eats")
    .eq("event_id", eventId);
  const count = (key: "tennis" | "padel" | "eats") =>
    (registrations ?? []).filter((r) => r[key]).length;
  if (!fields.has_tennis && count("tennis") > 0)
    return { error: `Er zijn al ${count("tennis")} tennisspelers ingeschreven; tennis kan niet weg.` };
  if (!fields.has_padel && count("padel") > 0)
    return { error: `Er zijn al ${count("padel")} padelspelers ingeschreven; padel kan niet weg.` };
  if (!fields.catering && count("eats") > 0)
    return { error: `Er eten al ${count("eats")} mensen mee; de catering kan niet weg.` };

  const { error } = await supabase.from("events").update(fields).eq("id", eventId);
  if (error) return { error: "Opslaan lukte niet." };

  refresh(eventId);
  return { message: "Opgeslagen." };
}

export async function deleteEvent(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireOrganiser();
  const eventId = String(formData.get("event_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) return { error: "Verwijderen lukte niet." };

  refresh();
  redirect("/beheer");
}

// Close the registrations by hand (whoever signs up after this goes on the
// reserve list), or open them again.
export async function setRegistrationsClosed(input: {
  eventId: string;
  closed: boolean;
}): Promise<ActionState> {
  await requireOrganiser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ registrations_closed_at: input.closed ? new Date().toISOString() : null })
    .eq("id", input.eventId);
  if (error) return { error: "Opslaan lukte niet." };
  refresh(input.eventId);
  return {
    message: input.closed
      ? "Inschrijvingen afgesloten. Wie nu nog inschrijft, komt op de reservelijst."
      : "Inschrijvingen weer open.",
  };
}
