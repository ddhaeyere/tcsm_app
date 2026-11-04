"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/forms";
import { notifyAdminsOfNewAccount } from "@/lib/new-account-notice";
import { createClient } from "@/lib/supabase/server";

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function login(_: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: text(formData, "email"),
    password: String(formData.get("password") ?? ""),
  });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Bevestig eerst je e-mailadres via de link in je mailbox." };
    }
    return { error: "E-mailadres of wachtwoord klopt niet." };
  }
  redirect("/");
}

export async function signup(_: ActionState, formData: FormData): Promise<ActionState> {
  const fullName = text(formData, "full_name");
  const email = text(formData, "email");
  const password = String(formData.get("password") ?? "");

  if (fullName.length < 2) return { error: "Vul je voor- en achternaam in." };
  if (password.length < 8) return { error: "Kies een wachtwoord van minstens 8 tekens." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${await siteOrigin()}/auth/callback`,
    },
  });
  if (error) {
    if (error.code === "user_already_exists") {
      return { error: "Er bestaat al een account met dit e-mailadres." };
    }
    return { error: "Account aanmaken lukte niet. Probeer het later opnieuw." };
  }

  // Without email confirmation the member is logged in right away.
  if (data.session) {
    await notifyAdminsOfNewAccount(supabase, await siteOrigin());
    redirect("/wachten");
  }

  return {
    message:
      "Bijna klaar! Bevestig je e-mailadres via de link in je mailbox. Daarna keurt een beheerder je account goed.",
  };
}

export async function requestPasswordReset(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(text(formData, "email"), {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/nieuw-wachtwoord`,
  });
  // Same answer whether or not the address exists.
  return { message: "Als dit e-mailadres bij ons gekend is, krijg je zo een mail met een link." };
}

export async function updatePassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Kies een wachtwoord van minstens 8 tekens." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Wachtwoord wijzigen lukte niet. Vraag een nieuwe link aan." };
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
