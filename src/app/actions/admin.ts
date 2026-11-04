"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/forms";
import { createClient } from "@/lib/supabase/server";
import type { AccountStatus, UserRole } from "@/lib/types";

const STATUSES: AccountStatus[] = ["pending", "approved", "rejected"];
const ROLES: UserRole[] = ["member", "organiser", "admin"];

export async function updateAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  const status = String(formData.get("status") ?? "") as AccountStatus;
  const role = String(formData.get("role") ?? "") as UserRole;

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_profile", {
    p_profile_id: String(formData.get("profile_id")),
    p_status: STATUSES.includes(status) ? status : null,
    p_role: ROLES.includes(role) ? role : null,
  });
  if (error) return { error: error.message };

  revalidatePath("/beheer/accounts");
  revalidatePath("/beheer/leden", "layout");
  revalidatePath("/beheer");
  return { message: "Opgeslagen." };
}

// Make a member of the club list an admin, or take it away. Works for members
// without an account too: they become an admin once their account is linked.
export async function setMemberAdmin(_: ActionState, formData: FormData): Promise<ActionState> {
  const memberId = String(formData.get("member_id") ?? "");
  if (!memberId) return { error: "Kies een lid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_member_admin", {
    p_member_id: memberId,
    p_admin: formData.get("role") === "admin",
  });
  if (error) return { error: error.message };

  revalidatePath("/beheer/accounts");
  revalidatePath("/beheer/leden", "layout");
  return { message: "Opgeslagen." };
}
