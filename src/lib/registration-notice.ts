import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateTime, sportLabel } from "./format";
import { sendMail } from "./mail";
import { SPORTS, describeChoice, reservePlace } from "./registrations";
import type { ClubEvent } from "./types";

// Mails every admin that someone registered for an event. The database makes
// sure this happens only once per registration, so it is safe to call after
// every save: changing a registration later sends nothing.
export async function notifyAdminsOfRegistration(
  supabase: SupabaseClient,
  registrationId: string,
  event: ClubEvent,
  memberId: string,
  choice: { tennis: boolean; padel: boolean; eats: boolean },
  origin: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("claim_registration_notice", {
    p_registration_id: registrationId,
  });
  if (error) {
    console.error("Registration notice failed:", error.message);
    return;
  }
  const rows = (data ?? []) as {
    admin_email: string;
    member_name: string;
    registered_by_name: string | null;
    is_self: boolean;
  }[];
  if (rows.length === 0) return;

  const { member_name, registered_by_name, is_self } = rows[0];
  const reserves = SPORTS.map((sport) => ({ sport, place: reservePlace(event, sport, memberId) }))
    .filter((r) => r.place !== null)
    .map((r) => `${sportLabel(r.sport)}: op de reservelijst (plaats ${r.place}).`);
  const text = [
    "Dag,",
    "",
    `${member_name} schreef zich in voor ${event.title} (${formatDateTime(event.starts_at)}): ${describeChoice(choice, event.catering)}.`,
    ...reserves,
    registered_by_name && !is_self ? `Ingeschreven door ${registered_by_name}.` : "",
    "",
    `Alle inschrijvingen: ${origin}/beheer/evenementen/${event.id}`,
    "",
    "Sportieve groeten,",
    "TC Sint-Michiels",
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");

  await Promise.all(
    rows.map((row) => sendMail(row.admin_email, `Nieuwe inschrijving: ${member_name} voor ${event.title}`, text)),
  );
}
