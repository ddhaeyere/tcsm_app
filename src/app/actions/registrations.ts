"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionState } from "@/components/forms";
import { formatDateTime, sportLabel } from "@/lib/format";
import { sendMail } from "@/lib/mail";
import { SPORTS, describeChoice, reservePlace } from "@/lib/registrations";
import { createClient } from "@/lib/supabase/server";
import { EVENT_SELECT, type ClubEvent } from "@/lib/types";

function refresh(eventId: string) {
  revalidatePath("/");
  revalidatePath("/beheer");
  revalidatePath(`/evenementen/${eventId}`);
  revalidatePath(`/beheer/evenementen/${eventId}`);
}

// Registers a member, changes their registration, or (intent "cancel")
// unregisters them.
export async function saveRegistration(_: ActionState, formData: FormData): Promise<ActionState> {
  const eventId = String(formData.get("event_id"));
  const memberId = String(formData.get("member_id") ?? "");
  if (!memberId) return { error: "Kies wie je inschrijft." };
  const supabase = await createClient();

  if (formData.get("intent") === "cancel") {
    const { error } = await supabase.rpc("cancel_registration", {
      p_registration_id: String(formData.get("registration_id")),
    });
    if (error) return { error: error.message };
    refresh(eventId);
    return { message: "Uitgeschreven." };
  }

  const choice = {
    tennis: formData.get("tennis") === "on",
    padel: formData.get("padel") === "on",
    eats: formData.get("eats") === "on",
  };
  if (!choice.tennis && !choice.padel && !choice.eats)
    return { error: "Duid aan wat je wil doen: tennis, padel of eten." };

  const { data: registrationId, error } = await supabase.rpc("save_registration", {
    p_event_id: eventId,
    p_member_id: memberId,
    p_tennis: choice.tennis,
    p_padel: choice.padel,
    p_eats: choice.eats,
  });
  if (error) return { error: error.message };

  const { data } = await supabase.from("events").select(EVENT_SELECT).eq("id", eventId).single();
  const event = data as unknown as ClubEvent | null;
  const summary = event ? statusText(event, memberId, choice) : "Opgeslagen.";

  if (event) await mailMember(registrationId as string, event, summary);
  refresh(eventId);
  return { message: summary };
}

// "Ingeschreven voor tennis en eten (Barbecue). Padel is volzet: je staat op
// de reservelijst (plaats 2)."
function statusText(
  event: ClubEvent,
  memberId: string,
  choice: { tennis: boolean; padel: boolean; eats: boolean },
): string {
  const reserves = SPORTS.map((sport) => ({ sport, place: reservePlace(event, sport, memberId) }))
    .filter((r) => r.place !== null);
  const confirmed = {
    tennis: choice.tennis && !reserves.some((r) => r.sport === "tennis"),
    padel: choice.padel && !reserves.some((r) => r.sport === "padel"),
    eats: choice.eats,
  };
  const lines = [];
  if (confirmed.tennis || confirmed.padel || confirmed.eats)
    lines.push(`Ingeschreven voor ${describeChoice(confirmed, event.catering)}.`);
  for (const r of reserves)
    lines.push(
      `${sportLabel(r.sport)}: ${
        event.registrations_closed_at ? "de inschrijvingen zijn afgesloten" : "volzet"
      }, je staat op de reservelijst (plaats ${r.place}). ` +
        "Valt er iemand af, dan schuif je vanzelf door.",
    );
  return lines.join(" ");
}

// Lets the member know they are registered, and by whom.
async function mailMember(registrationId: string, event: ClubEvent, summary: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("registration_contact", {
    p_registration_id: registrationId,
  });
  const contact = (
    data as
      | { full_name: string; email: string | null; registered_by_name: string | null; is_self: boolean }[]
      | null
  )?.[0];
  if (!contact?.email) return;

  const head = await headers();
  const link = `${head.get("x-forwarded-proto") ?? "https"}://${head.get("host")}/evenementen/${event.id}`;
  const lines = [
    `Dag ${contact.full_name},`,
    "",
    `${event.title}, ${formatDateTime(event.starts_at)}.`,
    summary,
    contact.registered_by_name && !contact.is_self
      ? `${contact.registered_by_name} schreef je in.`
      : "",
    "",
    `Bekijk wie er nog meedoet of pas je inschrijving aan: ${link}`,
    "",
    "Sportieve groeten,",
    "TC Sint-Michiels",
  ];
  await sendMail(contact.email, `Inschrijving: ${event.title}`, lines.join("\n"));
}

// Organisers on the manage page: change what a member registered for. No mail
// goes out; the registration keeps whoever registered the member.
export async function adminUpdateRegistration(input: {
  eventId: string;
  memberId: string;
  tennis: boolean;
  padel: boolean;
  eats: boolean;
}): Promise<ActionState> {
  if (!input.tennis && !input.padel && !input.eats)
    return { error: "Vink minstens één onderdeel aan, of verwijder de inschrijving." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_registration", {
    p_event_id: input.eventId,
    p_member_id: input.memberId,
    p_tennis: input.tennis,
    p_padel: input.padel,
    p_eats: input.eats,
  });
  if (error) return { error: error.message };
  refresh(input.eventId);
  return { message: "Inschrijving aangepast." };
}

// Organisers on the manage page: remove a registration entirely.
export async function adminDeleteRegistration(input: {
  eventId: string;
  registrationId: string;
}): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_registration", {
    p_registration_id: input.registrationId,
  });
  if (error) return { error: error.message };
  refresh(input.eventId);
  return { message: "Inschrijving verwijderd." };
}
