"use client";

import { useState, useTransition } from "react";
import { setRegistrationsClosed } from "@/app/actions/events";
import { formatDateTime } from "@/lib/format";

// Checkbox for organisers to close the registrations by hand. Asks to
// confirm, then saves right away.
export function CloseRegistrations({
  eventId,
  closedAt,
}: {
  eventId: string;
  closedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; message?: string }>({});
  const closed = closedAt !== null;

  const toggle = (close: boolean) => {
    const question = close
      ? "Inschrijvingen afsluiten? Wie vanaf nu nog inschrijft voor tennis of padel, komt op de reservelijst. Wie al ingeschreven is, blijft staan."
      : "Inschrijvingen weer openen? Wie na het afsluiten inschreef, komt dan gewoon mee in de lijst (tot het maximum).";
    if (!window.confirm(question)) return;
    startTransition(async () => setResult(await setRegistrationsClosed({ eventId, closed: close })));
  };

  return (
    <div
      className={`rounded-xl border p-4 ${closed ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"}`}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={closed}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-club-700"
        />
        <span>
          <span className="block font-medium text-stone-900">
            {pending ? "Even geduld…" : "Inschrijvingen afgesloten"}
          </span>
          <span className="block text-sm text-stone-600">
            {closed
              ? `Afgesloten op ${formatDateTime(closedAt)}. Wie nu nog inschrijft voor tennis of padel, komt op de reservelijst.`
              : "Vink aan om af te sluiten: wie daarna nog inschrijft, komt op de reservelijst."}
          </span>
        </span>
      </label>
      {result.error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {result.error}
        </p>
      )}
    </div>
  );
}
