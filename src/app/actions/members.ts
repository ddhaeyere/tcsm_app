"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/forms";
import { requireAdmin } from "@/lib/auth";
import { parseMemberList, parseMemberRows } from "@/lib/member-import";
import { isValidRanking } from "@/lib/rankings";
import { createClient } from "@/lib/supabase/server";
import { readXlsx } from "@/lib/xlsx";

// Import a member list: pasted, or uploaded as an Excel (.xlsx) or CSV file.
// Existing members (same email address, else same name) are updated.
export async function importMembers(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const file = formData.get("file");
  let parsed: ReturnType<typeof parseMemberList>;
  if (file instanceof File && file.size > 0 && /\.xlsx$/i.test(file.name)) {
    try {
      parsed = parseMemberRows(readXlsx(new Uint8Array(await file.arrayBuffer())));
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Het Excel-bestand kon niet gelezen worden." };
    }
  } else if (file instanceof File && file.size > 0 && /\.xls$/i.test(file.name)) {
    return { error: "Oude .xls-bestanden worden niet ondersteund. Bewaar het bestand in Excel als .xlsx." };
  } else {
    parsed = parseMemberList(
      file instanceof File && file.size > 0 ? await file.text() : String(formData.get("text") ?? ""),
    );
  }

  const { members, problems } = parsed;
  if (members.length === 0) return { error: problems.join(" ") || "Geen leden gevonden." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_import_members", { p_rows: members });
  if (error) return { error: error.message };

  const { added, updated } = (data as { added: number; updated: number }[])[0];
  revalidatePath("/beheer/leden");
  return {
    message:
      `${added} leden toegevoegd, ${updated} bijgewerkt.` +
      (problems.length ? ` Let op: ${problems.join(" ")}` : ""),
  };
}

export async function updateClubMember(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const field = (name: string) => String(formData.get(name) ?? "").trim();

  if (!field("last_name") || !field("first_name")) return { error: "Vul naam en voornaam in." };
  for (const [name, sport] of [
    ["tennis_singles_ranking", "tennis"],
    ["tennis_doubles_ranking", "tennis"],
    ["padel_ranking", "padel"],
  ] as const) {
    if (field(name) && !isValidRanking(sport, field(name))) return { error: "Ongeldig klassement." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_member", {
    p_member_id: field("member_id"),
    p_last_name: field("last_name"),
    p_first_name: field("first_name"),
    p_gender: field("gender") || null,
    p_email: field("email"),
    p_tennis_singles_ranking: field("tennis_singles_ranking"),
    p_tennis_doubles_ranking: field("tennis_doubles_ranking"),
    p_padel_ranking: field("padel_ranking"),
  });
  if (error) return { error: error.message };

  revalidatePath("/beheer/leden");
  redirect("/beheer/leden");
}

export async function deleteClubMember(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_member", {
    p_member_id: String(formData.get("member_id")),
  });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/beheer/leden");
}
