"use client";

import { useActionState, useState } from "react";
import { saveRegistration } from "@/app/actions/registrations";
import { SubmitButton } from "@/components/forms";
import { MemberPicker } from "@/components/member-picker";
import { Field } from "@/components/ui";

export interface CurrentChoice {
  registration_id: string;
  tennis: boolean;
  padel: boolean;
  eats: boolean;
  // Place on the reserve list, when there.
  reserve: { tennis: number | null; padel: number | null };
}

export interface SportState {
  offered: boolean;
  players: number;
  max: number | null;
}

// Register yourself or another member: who plays tennis and/or padel, and who
// eats along. Picking someone who is already registered changes their
// registration instead.
export function RegistrationForm({
  eventId,
  members,
  defaultMemberId,
  current,
  tennis,
  padel,
  catering,
  closed,
  eaters,
}: {
  eventId: string;
  members: { id: string; full_name: string; first_name: string; last_name: string; me?: boolean }[];
  defaultMemberId: string;
  // The registrations this account may change, by member.
  current: Record<string, CurrentChoice>;
  tennis: SportState;
  padel: SportState;
  catering: string | null;
  // Closed by an organiser: new players go on the reserve list.
  closed: boolean;
  eaters: string[];
}) {
  const [state, formAction] = useActionState(saveRegistration, {});
  const [memberId, setMemberId] = useState(defaultMemberId);
  const mine = current[memberId];

  const sportBox = (sport: "tennis" | "padel", label: string, s: SportState) => {
    if (!s.offered) return null;
    const full = s.max !== null && s.players >= s.max;
    return (
      <Choice name={sport} label={label} checked={mine?.[sport] ?? false}>
        {mine?.[sport] && mine.reserve[sport] !== null
          ? `Op de reservelijst (plaats ${mine.reserve[sport]})`
          : s.max === null
            ? `${s.players} ingeschreven`
            : closed && !mine?.[sport]
              ? "Inschrijvingen afgesloten: je komt op de reservelijst"
              : full && !mine?.[sport]
              ? "Volzet: je komt op de reservelijst"
              : `${Math.min(s.players, s.max)}/${s.max} plaatsen bezet`}
      </Choice>
    );
  };

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="event_id" value={eventId} />
      {mine && <input type="hidden" name="registration_id" value={mine.registration_id} />}

      <Field label="Wie schrijf je in?">
        <MemberPicker
          name="member_id"
          value={memberId}
          onChange={setMemberId}
          required
          options={members.map((m) => ({
            id: m.id,
            label: m.full_name,
            first_name: m.first_name,
            last_name: m.last_name,
            hint: [m.me && "ikzelf", current[m.id] && "ingeschreven"].filter(Boolean).join(", ") || undefined,
          }))}
        />
      </Field>

      {/* Remount when the member or their registration changes, so the boxes show it. */}
      <div key={`${memberId}:${JSON.stringify(mine ?? null)}`} className="space-y-2">
        {sportBox("tennis", "Speelt tennis", tennis)}
        {sportBox("padel", "Speelt padel", padel)}
        {catering && (
          <Choice name="eats" label={`Eet mee: ${catering}`} checked={mine?.eats ?? false}>
            {eaters.length === 0
              ? "Nog niemand eet mee."
              : `${eaters.length} ${eaters.length === 1 ? "eet" : "eten"} al mee: ${eaters
                  .slice(0, 5)
                  .join(", ")}${eaters.length > 5 ? ` en ${eaters.length - 5} anderen` : ""}`}
          </Choice>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton>{mine ? "Inschrijving aanpassen" : "Inschrijven"}</SubmitButton>
        {mine && (
          <SubmitButton
            variant="danger"
            name="intent"
            value="cancel"
            formNoValidate
            confirm="Deze inschrijving helemaal schrappen?"
          >
            Uitschrijven
          </SubmitButton>
        )}
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-lg bg-club-50 p-3 text-sm text-club-900">
          {state.message}
        </p>
      )}
    </form>
  );
}

function Choice({
  name,
  label,
  checked,
  children,
}: {
  name: string;
  label: string;
  checked: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 p-3 has-checked:border-club-600 has-checked:bg-club-50">
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        className="mt-0.5 size-5 shrink-0 accent-club-700"
      />
      <span>
        <span className="block font-medium text-stone-900">{label}</span>
        <span className="block text-sm text-stone-600">{children}</span>
      </span>
    </label>
  );
}
