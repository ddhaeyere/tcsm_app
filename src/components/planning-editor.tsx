"use client";

import { useMemo, useState, useTransition } from "react";
import { savePlanning, setPlanningReleased } from "@/app/actions/planning";
import type { ActionState } from "@/components/forms";
import { Card, Field, inputClass } from "@/components/ui";
import { formatDateTime, sportLabel } from "@/lib/format";
import { matchKey, planningCourts, type PlanningPlayer } from "@/lib/planning";
import type { EventPlanning, PlanningMatch, Sport } from "@/lib/types";

// Four places per match: two per side. Empty string means nobody.
type Places = [string, string, string, string];
const EMPTY: Places = ["", "", "", ""];

const BUTTON = "inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition disabled:opacity-60";

// The planning for organisers: set the number of time slots and courts, then
// pick per slot and court who plays whom. Saving stores everything at once;
// releasing shows the saved planning to every member.
export function PlanningEditor({
  eventId,
  planning,
  matches,
  players,
  sports,
}: {
  eventId: string;
  planning: EventPlanning | null;
  matches: PlanningMatch[];
  players: Record<Sport, PlanningPlayer[]>;
  sports: Sport[];
}) {
  const [slots, setSlots] = useState(planning?.slots ?? 4);
  const [tennisCourts, setTennisCourts] = useState(
    planning?.tennis_courts ?? (sports.includes("tennis") ? 2 : 0),
  );
  const [padelCourts, setPadelCourts] = useState(
    planning?.padel_courts ?? (sports.includes("padel") ? 2 : 0),
  );
  const [labels, setLabels] = useState<string[]>(planning?.slot_labels ?? []);
  const [places, setPlaces] = useState<Record<string, Places>>(() =>
    Object.fromEntries(
      matches.map((m) => [
        matchKey(m),
        [m.side_a[0] ?? "", m.side_a[1] ?? "", m.side_b[0] ?? "", m.side_b[1] ?? ""] as Places,
      ]),
    ),
  );
  const [dirty, setDirty] = useState(planning === null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState>({});

  const courts = planningCourts({ tennis_courts: tennisCourts, padel_courts: padelCourts });
  const slotList = Array.from({ length: slots }, (_, i) => i + 1);
  const names = useMemo(
    () => new Map([...players.tennis, ...players.padel].map((p) => [p.member_id, p.name])),
    [players],
  );

  const change = (update: () => void) => {
    update();
    setDirty(true);
    setResult({});
  };
  const setPlace = (key: string, index: number, memberId: string) =>
    change(() =>
      setPlaces((all) => {
        const next = [...(all[key] ?? EMPTY)] as Places;
        next[index] = memberId;
        return { ...all, [key]: next };
      }),
    );

  // Matches inside the current slots and courts, as the database stores them.
  const currentMatches: PlanningMatch[] = slotList.flatMap((slot) =>
    courts.flatMap(({ sport, court }) => {
      const p = places[matchKey({ slot, sport, court })] ?? EMPTY;
      const side_a = [p[0], p[1]].filter(Boolean);
      const side_b = [p[2], p[3]].filter(Boolean);
      return side_a.length || side_b.length ? [{ slot, sport, court, side_a, side_b }] : [];
    }),
  );

  // Who is planned twice in the same slot, and how often everyone plays.
  const doubleBooked = new Set<string>();
  const matchCount = new Map<string, number>();
  for (const slot of slotList) {
    const seen = new Set<string>();
    for (const m of currentMatches.filter((m) => m.slot === slot))
      for (const id of [...m.side_a, ...m.side_b]) {
        if (seen.has(id)) doubleBooked.add(`${slot}-${id}`);
        seen.add(id);
        matchCount.set(id, (matchCount.get(id) ?? 0) + 1);
      }
  }

  const save = () =>
    startTransition(async () => {
      const res = await savePlanning({
        eventId,
        slots,
        tennisCourts,
        padelCourts,
        slotLabels: slotList.map((s) => labels[s - 1] ?? ""),
        matches: currentMatches,
      });
      setResult(res);
      if (!res.error) setDirty(false);
    });

  const release = (released: boolean) => {
    const question = released
      ? "Planning vrijgeven? Alle leden kunnen ze dan zien. Je kan ze daarna nog aanpassen."
      : "Planning weer verbergen? Dan zien enkel beheerders ze nog.";
    if (!window.confirm(question)) return;
    startTransition(async () => setResult(await setPlanningReleased({ eventId, released })));
  };

  const released = planning?.released_at ?? null;
  const number = (value: number, set: (n: number) => void, min: number, max: number) => (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value}
      onChange={(e) => change(() => set(Math.max(min, Math.min(max, Number(e.target.value) || 0))))}
      className={inputClass}
    />
  );

  return (
    <div className="space-y-4">
      <div
        className={`rounded-xl border p-4 ${released ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}
      >
        <p className="font-medium text-stone-900">
          {released ? "Vrijgegeven" : "Nog niet vrijgegeven"}
        </p>
        <p className="mt-1 text-sm text-stone-700">
          {released
            ? `Sinds ${formatDateTime(released)} ziet iedereen deze planning. Wat je opslaat, zien ze meteen.`
            : "Enkel beheerders zien deze planning. Geef ze vrij als ze klaar is."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {planning && (
            <button
              type="button"
              disabled={pending || (!released && dirty)}
              onClick={() => release(!released)}
              className={`${BUTTON} ${released ? "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50" : "bg-emerald-700 text-white hover:bg-emerald-800"}`}
            >
              {released ? "Weer verbergen" : "Planning vrijgeven"}
            </button>
          )}
          {!released && dirty && planning && (
            <span className="self-center text-xs text-stone-600">Sla eerst je wijzigingen op.</span>
          )}
        </div>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Tijdsslots en velden</h2>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Tijdsslots">{number(slots, setSlots, 1, 50)}</Field>
          <Field label="Tennisvelden">{number(tennisCourts, setTennisCourts, 0, 30)}</Field>
          <Field label="Padelvelden">{number(padelCourts, setPadelCourts, 0, 30)}</Field>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Minder slots of velden kiezen verwijdert bij het opslaan de wedstrijden die erbuiten vallen.
        </p>
      </Card>

      {slotList.map((slot) => (
        <Card key={slot}>
          <Field label={`Tijdsslot ${slot}`} hint="Bv. 14:00 of Ronde 1. Leeg laten mag.">
            <input
              value={labels[slot - 1] ?? ""}
              onChange={(e) =>
                change(() =>
                  setLabels((all) => {
                    const next = [...all];
                    while (next.length < slot) next.push("");
                    next[slot - 1] = e.target.value;
                    return next;
                  }),
                )
              }
              placeholder={`Ronde ${slot}`}
              maxLength={40}
              className={inputClass}
            />
          </Field>
          {courts.length === 0 && <p className="mt-3 text-sm text-stone-600">Kies eerst het aantal velden.</p>}
          <div className="mt-3 space-y-3">
            {courts.map(({ sport, court, label }) => {
              const key = matchKey({ slot, sport, court });
              const p = places[key] ?? EMPTY;
              const select = (index: number) => {
                const value = p[index];
                const clash = value && doubleBooked.has(`${slot}-${value}`);
                const options = players[sport];
                return (
                  <select
                    aria-label={`${label}, ${index < 2 ? "ploeg 1" : "ploeg 2"}, speler ${(index % 2) + 1}`}
                    value={value}
                    onChange={(e) => setPlace(key, index, e.target.value)}
                    className={`${inputClass} !mt-0 ${clash ? "!border-red-500 !bg-red-50" : ""}`}
                  >
                    <option value="">{index % 2 === 0 || sport === "padel" ? "Speler…" : "(geen 2de speler)"}</option>
                    {value && !options.some((o) => o.member_id === value) && (
                      <option value={value}>{names.get(value) ?? "Niet meer ingeschreven"}</option>
                    )}
                    {options.map((o) => (
                      <option key={o.member_id} value={o.member_id}>
                        {o.name}
                        {o.reserve ? " (reserve)" : ""}
                        {matchCount.get(o.member_id) ? ` · ${matchCount.get(o.member_id)}×` : ""}
                      </option>
                    ))}
                  </select>
                );
              };
              return (
                <fieldset key={key} className="rounded-lg border border-stone-200 p-3">
                  <legend className="px-1 text-sm font-medium text-stone-700">{label}</legend>
                  <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
                    <div className="space-y-2">
                      {select(0)}
                      {select(1)}
                    </div>
                    <span className="text-center text-sm text-stone-500">tegen</span>
                    <div className="space-y-2">
                      {select(2)}
                      {select(3)}
                    </div>
                  </div>
                </fieldset>
              );
            })}
          </div>
          {[...doubleBooked].some((d) => d.startsWith(`${slot}-`)) && (
            <p className="mt-2 text-sm text-red-700">Iemand staat twee keer in dit tijdsslot.</p>
          )}
        </Card>
      ))}

      <Overview players={players} sports={sports} matchCount={matchCount} />

      <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white/95 p-3 shadow-md">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className={`${BUTTON} bg-club-700 text-white hover:bg-club-800`}
        >
          {pending ? "Even geduld…" : "Planning opslaan"}
        </button>
        {result.error && (
          <p role="alert" className="text-sm text-red-700">
            {result.error}
          </p>
        )}
        {result.message && !dirty && (
          <p role="status" className="text-sm text-club-700">
            {result.message}
          </p>
        )}
        {dirty && !result.error && <p className="text-sm text-stone-600">Niet opgeslagen wijzigingen.</p>}
      </div>
    </div>
  );
}

// How many matches every registered player has, so nobody is forgotten.
function Overview({
  players,
  sports,
  matchCount,
}: {
  players: Record<Sport, PlanningPlayer[]>;
  sports: Sport[];
  matchCount: Map<string, number>;
}) {
  return (
    <Card>
      <h2 className="mb-2 text-lg font-semibold">Aantal wedstrijden per speler</h2>
      {sports.map((sport) => (
        <div key={sport} className="mb-3 last:mb-0">
          <h3 className="text-sm font-medium text-stone-700">{sportLabel(sport)}</h3>
          {players[sport].length === 0 ? (
            <p className="text-sm text-stone-500">Nog niemand ingeschreven.</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {players[sport].map((p) => {
                const n = matchCount.get(p.member_id) ?? 0;
                return (
                  <li
                    key={p.member_id}
                    className={`rounded-full px-2 py-0.5 text-xs ${n === 0 ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-700"}`}
                  >
                    {p.name}
                    {p.reserve ? " (res.)" : ""}: {n}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </Card>
  );
}
