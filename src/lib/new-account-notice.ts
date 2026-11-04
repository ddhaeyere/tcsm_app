import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMail } from "./mail";

// Mails every admin that a new account waits for approval. The database makes
// sure this happens only once per account and only while it is pending, so it
// is safe to call after every sign-up or confirmation link.
export async function notifyAdminsOfNewAccount(
  supabase: SupabaseClient,
  origin: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("claim_new_account_notice");
  if (error) {
    console.error("New account notice failed:", error.message);
    return;
  }
  const rows = (data ?? []) as { admin_email: string; account_name: string; account_email: string }[];
  if (rows.length === 0) return;

  const { account_name, account_email } = rows[0];
  const text = [
    "Dag,",
    "",
    `${account_name} (${account_email}) heeft een account aangemaakt in de app en wacht op goedkeuring.`,
    "",
    `Goedkeuren of weigeren kan hier: ${origin}/beheer/accounts`,
    "",
    "Sportieve groeten,",
    "TC Sint-Michiels",
  ].join("\n");

  await Promise.all(
    rows.map((row) => sendMail(row.admin_email, `Nieuw account wacht op goedkeuring: ${account_name}`, text)),
  );
}
