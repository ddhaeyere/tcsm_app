import type { Metadata } from "next";
import Link from "next/link";
import { importMembers } from "@/app/actions/members";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, PageTitle, inputClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Leden importeren" };

const EXAMPLE = `Naam\tVoornaam\tGeslacht\tEnkel\tDubbel\tPadel\tE-mail
De Meyer\tSien\tV\t3 ptn\t5 ptn\tP50\tsien@voorbeeld.be`;

export default async function ImportMembersPage() {
  await requireAdmin();

  return (
    <>
      <Link href="/beheer/leden" className="text-sm text-club-700 underline">
        ← Ledenlijst
      </Link>
      <PageTitle sub="Kies een Excel-bestand (.xlsx) of CSV-bestand, of kopieer de lijst uit Excel en plak ze hieronder.">
        Leden importeren
      </PageTitle>

      <Card>
        <ActionForm action={importMembers} className="space-y-4">
          <Field
            label="Excel- of CSV-bestand"
            hint="Bijvoorbeeld de ledenlijst met de kolommen Naam, Voornaam, Geslacht, Geboortedatum, Klassement enkel, Klassement dubbel, Klassement padel en E-mail. De geboortedatum wordt niet bewaard."
          >
            <input
              name="file"
              type="file"
              accept=".xlsx,.csv,.txt,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="mt-1 block text-sm"
            />
          </Field>
          <Field
            label="Of plak de ledenlijst"
            hint='De eerste regel bevat de kolomnamen: Naam, Voornaam, Geslacht, Enkel, Dubbel, Padel en E-mail. Alleen Naam en Voornaam zijn verplicht.'
          >
            <textarea
              name="text"
              rows={10}
              placeholder={EXAMPLE}
              className={`${inputClass} font-mono text-sm`}
            />
          </Field>
          <p className="text-sm text-stone-600">
            Een lid dat al bestaat (zelfde e-mailadres, of anders zelfde naam en voornaam) wordt
            bijgewerkt met de gegevens uit de lijst, bv. nieuwe klassementen. Lege cellen laten de
            bestaande gegevens ongemoeid.
          </p>
          <SubmitButton>Importeren</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
