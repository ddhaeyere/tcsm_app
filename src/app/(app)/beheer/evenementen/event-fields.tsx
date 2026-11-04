import { Field, inputClass } from "@/components/ui";
import { isoToBrusselsInput } from "@/lib/format";
import type { ClubEvent, Sport } from "@/lib/types";

export function EventFields({ event }: { event?: ClubEvent }) {
  return (
    <div className="space-y-4">
      <Field label="Naam">
        <input
          name="title"
          defaultValue={event?.title}
          required
          placeholder="Bv. Herfsttornooi dubbel"
          className={inputClass}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Begint op">
          <input
            name="starts_at"
            type="datetime-local"
            defaultValue={isoToBrusselsInput(event?.starts_at ?? null)}
            required
            className={inputClass}
          />
        </Field>
        <Field label="Eindigt op" hint="Optioneel">
          <input
            name="ends_at"
            type="datetime-local"
            defaultValue={isoToBrusselsInput(event?.ends_at ?? null)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Inschrijven kan tot" hint="Leeg laten: tot het begin van het evenement">
        <input
          name="registration_deadline"
          type="datetime-local"
          defaultValue={isoToBrusselsInput(event?.registration_deadline ?? null)}
          className={inputClass}
        />
      </Field>
      <fieldset className="space-y-3 rounded-lg border border-stone-200 p-3">
        <legend className="px-1 text-sm font-medium text-stone-700">Wat kan je doen?</legend>
        <SportField
          sport="tennis"
          label="Tennis"
          checked={event ? event.has_tennis : true}
          max={event?.max_tennis ?? null}
        />
        <SportField
          sport="padel"
          label="Padel"
          checked={event?.has_padel ?? false}
          max={event?.max_padel ?? null}
        />
        <div className="grid items-end gap-2 sm:grid-cols-[10rem_1fr]">
          <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-stone-800">
            <input
              type="checkbox"
              name="has_catering"
              defaultChecked={!!event?.catering}
              className="size-5 accent-club-700"
            />
            Catering
          </label>
          <Field label="Naam van de catering">
            <input
              name="catering"
              defaultValue={event?.catering ?? ""}
              placeholder="Bv. Barbecue of Pasta"
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>
      <Field label="Locatie" hint="Optioneel">
        <input name="location" defaultValue={event?.location ?? ""} className={inputClass} />
      </Field>
      <Field label="Beschrijving" hint="Optioneel: formule, prijs, wat er na het spelen gebeurt…">
        <textarea
          name="description"
          rows={4}
          defaultValue={event?.description ?? ""}
          className={inputClass}
        />
      </Field>
    </div>
  );
}

// A sport the event offers, with an optional maximum number of players.
function SportField({
  sport,
  label,
  checked,
  max,
}: {
  sport: Sport;
  label: string;
  checked: boolean;
  max: number | null;
}) {
  return (
    <div className="grid items-end gap-2 sm:grid-cols-[10rem_1fr]">
      <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-stone-800">
        <input
          type="checkbox"
          name={`has_${sport}`}
          defaultChecked={checked}
          className="size-5 accent-club-700"
        />
        {label}
      </label>
      <Field
        label={`Max. spelers ${label.toLowerCase()}`}
        hint="Leeg laten: geen maximum. Wie daarna inschrijft, komt op de reservelijst."
      >
        <input
          name={`max_${sport}`}
          type="number"
          min={1}
          defaultValue={max ?? ""}
          className={inputClass}
        />
      </Field>
    </div>
  );
}
