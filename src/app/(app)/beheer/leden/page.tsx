import type { Metadata } from "next";
import Link from "next/link";
import { MemberTable } from "@/components/member-table";
import { Badge, Card, PageTitle } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ClubMember, UserRole } from "@/lib/types";

export const metadata: Metadata = { title: "Ledenlijst" };

export default async function MemberListPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data }, { data: accounts }] = await Promise.all([
    supabase.rpc("admin_list_members"),
    supabase.rpc("admin_list_profiles"),
  ]);
  const members = (data ?? []) as (ClubMember & { email: string | null })[];
  const adminAccounts = (
    (accounts ?? []) as { id: string; full_name: string; email: string; role: UserRole; status: string }[]
  ).filter((a) => a.role !== "member" && a.status === "approved");
  const admins = new Set(adminAccounts.map((a) => a.id));
  const linked = new Set(members.map((m) => m.profile_id).filter(Boolean));

  return (
    <>
      <Link href="/beheer" className="text-sm text-club-700 underline">
        ← Beheer
      </Link>
      <PageTitle sub="Iedereen die ingeschreven kan worden. Met een account op hetzelfde e-mailadres kan een lid zelf inloggen.">
        Ledenlijst ({members.length})
      </PageTitle>

      <Link
        href="/beheer/leden/import"
        className="mb-4 inline-flex min-h-10 items-center rounded-lg bg-club-700 px-4 text-sm font-semibold text-white hover:bg-club-800"
      >
        Leden importeren
      </Link>

      <Card className="mb-4">
        <h2 className="mb-1 font-semibold">Beheerders ({adminAccounts.length})</h2>
        <p className="mb-2 text-sm text-stone-600">
          Rollen pas je aan bij{" "}
          <Link href="/beheer/accounts" className="text-club-700 underline">
            Accounts
          </Link>
          .
        </p>
        <ul className="divide-y divide-stone-100">
          {adminAccounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="min-w-48 flex-1">
                <span className="font-medium">{a.full_name}</span>
                <span className="block text-xs text-stone-600">{a.email}</span>
              </span>
              {!linked.has(a.id) && <Badge tone="amber">niet in de ledenlijst</Badge>}
              <Badge tone="club">beheerder</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <MemberTable
          members={members.map((m) => ({
            id: m.id,
            name: `${m.last_name} ${m.first_name}`,
            email: m.email,
            singles: m.tennis_singles_ranking,
            doubles: m.tennis_doubles_ranking,
            padel: m.padel_ranking,
            is_admin: !!m.profile_id && admins.has(m.profile_id),
            has_account: !!m.profile_id,
          }))}
        />
      </Card>
    </>
  );
}
