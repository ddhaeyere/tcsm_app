import type { Metadata } from "next";
import Link from "next/link";
import { createEvent } from "@/app/actions/events";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, PageTitle } from "@/components/ui";
import { requireOrganiser } from "@/lib/auth";
import { EventFields } from "../event-fields";

export const metadata: Metadata = { title: "Nieuw evenement" };

export default async function NewEventPage() {
  await requireOrganiser();

  return (
    <>
      <Link href="/beheer" className="text-sm text-club-700 underline">
        ← Beheer
      </Link>
      <PageTitle>Nieuw evenement</PageTitle>
      <Card>
        <ActionForm action={createEvent} className="space-y-6">
          <EventFields />
          <SubmitButton>Evenement aanmaken</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
