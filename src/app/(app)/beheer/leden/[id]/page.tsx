import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateAccount } from "@/app/actions/admin";
import { deleteClubMember, updateClubMember } from "@/app/actions/members";
import { ActionForm, SubmitButton } from "@/components/forms";
import { RoleSelect } from "@/components/role-select";
import { Card, Field, PageTitle, RankingField, inputClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ClubMember, UserRole } from "@/lib/types";

export const metadata: Metadata = { title: "Lid" };

export default async function EditMemberPage({ params }: PageProps<"/beheer/leden/[id]">) {
  const { id } = await params;
  const me = await requireAdmin();
  const supabase = await createClient();
  const [{ data }, { data: accounts }] = await Promise.all([
    supabase.rpc("admin_list_members"),
    supabase.rpc("admin_list_profiles"),
  ]);
  const member = ((data ?? []) as (ClubMember & { email: string | null; birth_date: string | null })[]).find((m) => m.id === id);
  if (!member) notFound();
  const account = ((accounts ?? []) as { id: string; role: UserRole }[]).find(
    (a) => a.id === member.profile_id,
  );

  return (
    <>
      <Link href="/beheer/leden" className="text-sm text-club-700 underline">
        ← Ledenlijst
      </Link>
      <PageTitle sub={member.profile_id ? "Heeft een account in de app." : "Heeft nog geen account."}>
        {member.full_name}
      </PageTitle>

      <Card className="mb-6">
        <ActionForm action={updateClubMember} className="space-y-4">
          <input type="hidden" name="member_id" value={member.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Naam">
              <input name="last_name" defaultValue={member.last_name} required className={inputClass} />
            </Field>
            <Field label="Voornaam">
              <input name="first_name" defaultValue={member.first_name} required className={inputClass} />
            </Field>
            <Field label="Geslacht">
              <select name="gender" defaultValue={member.gender ?? ""} className={inputClass}>
                <option value="">Niet ingevuld</option>
                <option value="M">Man</option>
                <option value="V">Vrouw</option>
              </select>
            </Field>
            <Field label="Geboortedatum">
              <input
                name="birth_date"
                type="date"
                defaultValue={member.birth_date ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="E-mailadres" hint="Hiermee wordt het lid aan een account gekoppeld.">
              <input name="email" type="email" defaultValue={member.email ?? ""} className={inputClass} />
            </Field>
            <RankingField
              sport="tennis"
              name="tennis_singles_ranking"
              label="Tennis enkel"
              value={member.tennis_singles_ranking}
            />
            <RankingField
              sport="tennis"
              name="tennis_doubles_ranking"
              label="Tennis dubbel"
              value={member.tennis_doubles_ranking}
            />
            <RankingField sport="padel" name="padel_ranking" label="Padel" value={member.padel_ranking} />
          </div>
          <SubmitButton>Opslaan</SubmitButton>
        </ActionForm>
      </Card>

      <Card className="mb-6">
        <h2 className="font-semibold">Rechten</h2>
        {!account ? (
          <p className="mt-1 text-sm text-stone-600">
            Dit lid kan beheerder worden zodra het een account aanmaakt met het e-mailadres hierboven.
          </p>
        ) : account.id === me.id ? (
          <p className="mt-1 text-sm text-stone-600">Dit ben jij. Je kan je eigen rechten niet aanpassen.</p>
        ) : (
          <ActionForm action={updateAccount} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="profile_id" value={account.id} />
            <Field
              label="Rol"
              hint="Een beheerder maakt evenementen aan en beheert de ledenlijst en de inschrijvingen."
            >
              <RoleSelect
                key={account.role}
                role={account.role === "member" ? "member" : "admin"}
                className="w-44"
              />
            </Field>
            <SubmitButton variant="secondary">Opslaan</SubmitButton>
          </ActionForm>
        )}
      </Card>

      <ActionForm action={deleteClubMember}>
        <input type="hidden" name="member_id" value={member.id} />
        <SubmitButton
          variant="danger"
          confirm={`${member.full_name} uit de ledenlijst verwijderen? Ook de inschrijvingen van dit lid verdwijnen.`}
        >
          Lid verwijderen
        </SubmitButton>
      </ActionForm>
    </>
  );
}
