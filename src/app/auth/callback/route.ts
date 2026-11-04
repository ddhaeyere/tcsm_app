import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { notifyAdminsOfNewAccount } from "@/lib/new-account-notice";
import { createClient } from "@/lib/supabase/server";

// Landing page for the links in confirmation and password reset emails.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/";
  // Only allow redirects within this site.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  const supabase = await createClient();
  let ok = false;

  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  if (!ok) {
    return NextResponse.redirect(new URL("/login?fout=link", origin));
  }
  // A freshly confirmed account that waits for approval: let the admins know.
  if (type !== "recovery") await notifyAdminsOfNewAccount(supabase, origin);

  const destination = type === "recovery" ? "/nieuw-wachtwoord" : next;
  return NextResponse.redirect(new URL(destination, origin));
}
