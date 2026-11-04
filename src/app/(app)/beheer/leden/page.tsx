import type { Metadata } from "next";
import Link from "next/link";
import { setMemberAdmin, updateAccount } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms";
import { MemberTable } from "@/components/member-table";
import { Badge, Card, PageTitle, inputClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ClubMember, UserRole } from "@/lib/types";

export const metadata: Metadata = { title: "Ledenlijst" };

export default async function MemberListPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  const [{ data }, { data: accounts }, { data: flagged }] = await Promise.all([
    supabase.rpc("admin_list_members"),
    supabase.rpc("admin_list_profiles"),
    supabase.rpc("admin_list_member_admins"),
  ]);
  const members = (data ?? []) as (ClubMember & { email: string | null; birth_date: string | null })[];
  const adminAccounts = (
    (accounts ?? []) as { id: string; full_name: string; email: string; role: UserRole; status: string }[]
  ).filter((a) => a.role !== "member" && a.status === "approved");
  const admins = new Set(adminAccounts.map((a) => a.id));
  // Members marked as admin who have no account yet: they become an admin
  // as soon as they make one.
  const marked = new Set((flagged ?? []) as string[]);
  const memberByProfile = new Map(members.filter((m) => m.profile_id).map((m) => [m.profile_id, m]));
  const adminRows = [
    ...adminAccounts.map((a) => ({
      key: a.id,
      name: a.full_name,
      email: a.email,
      memberId: memberByProfile.get(a.id)?.id ?? null,
      profileId: a.id,
      note: memberByProfile.has(a.id) ? null : "niet in de ledenlijst",
    })),
    ...members
      .filter((m) => !m.profile_id && marked.has(m.id))
      .map((m) => ({
        key: m.id,
        name: m.full_name,
        email: m.email,
        memberId: m.id,
        profileId: null,
        note: "nog geen account",
      })),
  ];
  const isAdminMember = (m: (typeof members)[number]) =>
    m.profile_id ? admins.has(m.profile_id) : marked.has(m.id);

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
        <h2 className="mb-1 font-semibold">Beheerders ({adminRows.length})</h2>
        <p className="mb-2 text-sm text-stone-600">
          Een beheerder maakt evenementen aan en beheert de ledenlijst en de inschrijvingen. Een lid zonder
          account wordt beheerder zodra het een account maakt met het e-mailadres uit de ledenlijst.
        </p>
        <ul className="divide-y divide-stone-100">
          {adminRows.map((a) => (
            <li key={a.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="min-w-48 flex-1">
                <span className="font-medium">{a.name}</span>
                <span className="block text-xs text-stone-600">{a.email ?? "geen e-mailadres"}</span>
              </span>
              {a.note && <Badge tone="amber">{a.note}</Badge>}
              {a.profileId === me.id ? (
                <Badge tone="green">jij</Badge>
              ) : (
                <ActionForm action={a.memberId ? setMemberAdmin : updateAccount}>
                  {a.memberId ? (
                    <input type="hidden" name="member_id" value={a.memberId} />
                  ) : (
                    <input type="hidden" name="profile_id" value={a.profileId ?? ""} />
                  )}
                  <SubmitButton
                    name="role"
                    value="member"
                    variant="link"
                    confirm={`${a.name} is dan geen beheerder meer. Doorgaan?`}
                  >
                    geen beheerder meer
                  </SubmitButton>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>

        <ActionForm action={setMemberAdmin} className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
          <input type="hidden" name="role" value="admin" />
          <select
            name="member_id"
            required
            defaultValue=""
            aria-label="Lid dat beheerder wordt"
            className={`${inputClass} mt-0 w-auto min-w-56 py-1.5 text-sm`}
          >
            <option value="" disabled>
              Kies een lid…
            </option>
            {members
              .filter((m) => !isAdminMember(m))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.last_name} {m.first_name}
                  {m.profile_id ? "" : " (nog geen account)"}
                </option>
              ))}
          </select>
          <SubmitButton variant="secondary">Beheerder maken</SubmitButton>
        </ActionForm>
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
            birth_date: m.birth_date ?? null,
            is_admin: isAdminMember(m),
            has_account: !!m.profile_id,
          }))}
        />
      </Card>
    </>
  );
}
