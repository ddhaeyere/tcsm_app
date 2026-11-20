"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { savePlanning, setPlanningReleased } from "@/app/actions/planning";
import { CourtFrame, CourtRow } from "@/components/court";
import type { ActionState } from "@/components/forms";
import { Card, Field, inputClass } from "@/components/ui";
import { formatDateTime, sportLabel } from "@/lib/format";
import {
  QUARTERS,
  completeTimes,
  courtLabel,
  findClashes,
  fromMinutes,
  matchKey,
  range,
  rankingLabel,
  sideSum,
  sportSetup,
  toMinutes,
  type PlanningPlayer,
  type SportSetup,
} from "@/lib/planning";
import type { EventPlanning, PlanningMatch, SlotTime, Sport } from "@/lib/types";

// Four places per match: team 1 is 0 and 1, team 2 is 2 and 3. Empty string
// means nobody.
type Places = [string, string, string, string];
const EMPTY: Places = ["", "", "", ""];

// Where a dragged name comes from: the player list, or a place on a court.
type Spot = { key: string; index: number };
type Pick = { memberId: string; sport: Sport; from: Spot | null };

const BUTTON = "inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition disabled:opacity-60";
const SPORTS: Sport[] = ["tennis", "padel"];

// The planning for organisers: per sport the number of time slots and
// courts, then per slot the courts next to each other. Names are dragged
// from the player list onto a side of a court (or tapped, then a place
// tapped). A name can be used in any number of slots; the counter shows how
// often. Saving stores everything at once; releasing shows the saved
// planning to every member.
export function PlanningEditor({
  eventId,
  planning,
  matches,
  players,
  sports,
  defaultStart,
}: {
  eventId: string;
  planning: EventPlanning | null;
  matches: PlanningMatch[];
  players: Record<Sport, PlanningPlayer[]>;
  sports: Sport[];
  // Start of the event ("19:00"): the first slot starts here by default.
  defaultStart: string;
}) {
  const [setups, setSetups] = useState<Record<Sport, SportSetup>>(() => {
    const initial = (sport: Sport): SportSetup => {
      const setup = planning
        ? sportSetup(planning, sport)
        : sports.includes(sport)
          ? { slots: 4, courts: 2, times: [] }
          : { slots: 0, courts: 0, times: [] };
      return { ...setup, times: completeTimes(setup.times, setup.slots, defaultStart) };
    };
    return { tennis: initial("tennis"), padel: initial("padel") };
  });
  // A planning saved before slots had times gets suggested times: those
  // still need saving.
  const missingTimes =
    planning !== null &&
    SPORTS.some((sport) => {
      const { slots, times } = sportSetup(planning, sport);
      return range(slots).some((i) => !times[i - 1]?.start || !times[i - 1]?.end);
    });
  const [places, setPlaces] = useState<Record<string, Places>>(() =>
    Object.fromEntries(
      matches.map((m) => [
        matchKey(m),
        [m.side_a[0] ?? "", m.side_a[1] ?? "", m.side_b[0] ?? "", m.side_b[1] ?? ""] as Places,
      ]),
    ),
  );
  const [dirty, setDirty] = useState(planning === null || missingTimes);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState>({});
  const [selected, setSelected] = useState<Pick | null>(null);

  // Sports shown: those the event offers, plus any that still has courts.
  const shownSports = SPORTS.filter((s) => sports.includes(s) || setups[s].courts > 0);
  const people = useMemo(
    () => new Map([...players.tennis, ...players.padel].map((p) => [p.member_id, p])),
    [players],
  );
  const names = useMemo(
    () => new Map([...people.values()].map((p) => [p.member_id, p.name])),
    [people],
  );

  const change = (update: () => void) => {
    update();
    setDirty(true);
    setResult({});
  };
  const setSetup = (sport: Sport, patch: Partial<SportSetup>) =>
    change(() => setSetups((all) => ({ ...all, [sport]: { ...all[sport], ...patch } })));

  // Puts a name on a place. Moving a name from one place to another swaps it
  // with whoever stood there.
  const place = useCallback((pick: Pick, to: Spot) => {
    setPlaces((all) => {
      const next = { ...all };
      const target = [...(next[to.key] ?? EMPTY)] as Places;
      const before = target[to.index];
      target[to.index] = pick.memberId;
      next[to.key] = target;
      if (pick.from && !(pick.from.key === to.key && pick.from.index === to.index)) {
        const source = [...(next[pick.from.key] ?? EMPTY)] as Places;
        source[pick.from.index] = before;
        next[pick.from.key] = source;
      }
      return next;
    });
    setDirty(true);
    setResult({});
  }, []);
  const remove = useCallback((spot: Spot) => {
    setPlaces((all) => {
      const source = [...(all[spot.key] ?? EMPTY)] as Places;
      source[spot.index] = "";
      return { ...all, [spot.key]: source };
    });
    setDirty(true);
    setResult({});
  }, []);

  // Dropping on a court place, or on the player list (takes the name off).
  const drop = useCallback(
    (pick: Pick, target: string | null) => {
      if (!target) return;
      if (target.startsWith("list:")) {
        if (pick.from) remove(pick.from);
        return;
      }
      const [sport, key, index] = target.split("|");
      if (sport !== pick.sport) return;
      place(pick, { key, index: Number(index) });
    },
    [place, remove],
  );
  const { dragging, startDrag } = usePointerDrag(drop, setSelected);

  // Tap a place: put the selected name there, or pick up the name on it.
  const tapSpot = (sport: Sport, spot: Spot, occupant: string) => {
    if (selected && selected.sport === sport) {
      if (selected.from?.key === spot.key && selected.from.index === spot.index) setSelected(null);
      else {
        place(selected, spot);
        setSelected(null);
      }
    } else if (occupant) setSelected({ memberId: occupant, sport, from: spot });
  };

  // Matches inside the current slots and courts, as the database stores them.
  const currentMatches: PlanningMatch[] = SPORTS.flatMap((sport) =>
    range(setups[sport].slots).flatMap((slot) =>
      range(setups[sport].courts).flatMap((court) => {
        const p = places[matchKey({ slot, sport, court })] ?? EMPTY;
        const side_a = [p[0], p[1]].filter(Boolean);
        const side_b = [p[2], p[3]].filter(Boolean);
        return side_a.length || side_b.length ? [{ slot, sport, court, side_a, side_b }] : [];
      }),
    ),
  );

  // Who stands on two courts at overlapping times (tennis and padel
  // together), and how often everyone plays over both sports.
  const clashes = findClashes(currentMatches, setups);
  const matchCount = new Map<string, number>();
  for (const m of currentMatches)
    for (const id of [...m.side_a, ...m.side_b]) matchCount.set(id, (matchCount.get(id) ?? 0) + 1);

  const save = () =>
    startTransition(async () => {
      const res = await savePlanning({
        eventId,
        tennis: setups.tennis,
        padel: setups.padel,
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
  const number = (sport: Sport, field: "slots" | "courts", label: string) => (
    <Field label={label}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={field === "slots" ? 50 : 30}
        value={setups[sport][field]}
        onChange={(e) => {
          const value = Math.max(0, Math.min(field === "slots" ? 50 : 30, Number(e.target.value) || 0));
          setSetup(
            sport,
            field === "slots"
              ? { slots: value, times: completeTimes(setups[sport].times, value, defaultStart) }
              : { courts: value },
          );
        }}
        className={inputClass}
      />
    </Field>
  );

  // A name that can be dragged or tapped.
  const chip = (sport: Sport, memberId: string, from: Spot | null, extra = "") => {
    const isSelected =
      selected?.memberId === memberId &&
      selected.sport === sport &&
      (selected.from?.key ?? null) === (from?.key ?? null) &&
      (selected.from?.index ?? null) === (from?.index ?? null);
    const isDragged =
      dragging?.memberId === memberId &&
      (dragging.from?.key ?? null) === (from?.key ?? null) &&
      (dragging.from?.index ?? null) === (from?.index ?? null);
    return (
      <span
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        onPointerDown={(e) => startDrag(e, { memberId, sport, from }, names.get(memberId) ?? "Onbekend")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelected(isSelected ? null : { memberId, sport, from });
          }
        }}
        onClick={(e) => {
          if (from) return; // a tap on a place is handled by the place
          e.stopPropagation();
          setSelected(isSelected ? null : { memberId, sport, from });
        }}
        className={`inline-flex max-w-full cursor-grab touch-none select-none items-center gap-1 truncate rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm transition active:cursor-grabbing ${
          isSelected ? "border-club-700 bg-club-700 text-white" : "border-stone-300 bg-white text-stone-800"
        } ${isDragged ? "opacity-40" : ""} ${extra}`}
      >
        <span className="truncate">{names.get(memberId) ?? "Niet meer ingeschreven"}</span>
        {rankingLabel(people.get(memberId), sport) && (
          <span className={`shrink-0 font-normal ${isSelected ? "text-club-100" : "text-stone-500"}`}>
            {rankingLabel(people.get(memberId), sport)}
          </span>
        )}
      </span>
    );
  };

  // The sum of the rankings of one side, shown under that side.
  const sum = (sport: Sport, ids: string[]) => {
    const present = ids.filter(Boolean);
    if (present.length === 0) return <span key="sum" className="h-4" />;
    const { sum: total, missing } = sideSum(present.map((id) => people.get(id)), sport);
    return (
      <span
        key="sum"
        className="px-1 text-right text-[11px] font-semibold text-stone-600"
        title={missing ? `${missing} speler(s) zonder klassement` : undefined}
      >
        Σ {total}
        {missing ? " +?" : ""}
      </span>
    );
  };

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
        <div className="space-y-3">
          {shownSports.map((sport) => (
            <div key={sport}>
              <h3 className="text-sm font-semibold text-stone-800">{sportLabel(sport)}</h3>
              <div className="grid grid-cols-2 gap-3">
                {number(sport, "slots", "Tijdsslots")}
                {number(sport, "courts", "Velden")}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Minder slots of velden kiezen verwijdert bij het opslaan de wedstrijden die erbuiten vallen.
        </p>
      </Card>

      {shownSports.map((sport) => {
        const setup = setups[sport];
        if (setup.slots === 0 || setup.courts === 0) return null;
        return (
          <section key={sport} className="space-y-3">
            <h2 className="pt-2 text-xl font-bold text-stone-900">{sportLabel(sport)}</h2>

            <p className="text-sm text-stone-600">
              Sleep een naam naar een kant van een terrein, of tik een naam en dan een plaats. Naast de
              naam staat het klassement, erachter hoe vaak iemand al speelt (tennis en padel samen). Een
              naam terug naar de lijst slepen haalt hem van het terrein.
            </p>
            <div
              data-drop={`list:${sport}`}
              className="sticky top-16 z-[5] rounded-xl border border-stone-200 bg-white/95 p-2 shadow-sm backdrop-blur"
            >
              {players[sport].length === 0 ? (
                <p className="text-sm text-stone-500">Nog niemand ingeschreven voor {sport}.</p>
              ) : (
                <ul className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                  {players[sport].map((p) => {
                    const n = matchCount.get(p.member_id) ?? 0;
                    return (
                      <li key={p.member_id} className="flex items-center">
                        {chip(sport, p.member_id, null, n === 0 ? "!border-amber-300 !bg-amber-50" : "")}
                        <span
                          className={`-ml-1 rounded-full px-1.5 text-[11px] font-semibold ${n === 0 ? "text-amber-700" : "text-stone-500"}`}
                          aria-label={`${n} keer gepland`}
                        >
                          {n}×{p.reserve ? " res." : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {range(setup.slots).map((slot) => (
              <Card key={slot}>
                <SlotTimes
                  sport={sport}
                  slot={slot}
                  time={setup.times[slot - 1] ?? { start: null, end: null }}
                  onChange={(time) => {
                    const times = [...setup.times];
                    times[slot - 1] = time;
                    setSetup(sport, { times });
                  }}
                />
                <CourtRow>
                  {range(setup.courts).map((court) => {
                    const key = matchKey({ slot, sport, court });
                    const p = places[key] ?? EMPTY;
                    const filled = p.filter(Boolean).length;
                    const spot = (index: number) => {
                      const occupant = p[index];
                      const optional = sport === "tennis" && index % 2 === 1;
                      const clash = occupant && clashes.has(`${key}|${occupant}`);
                      const target = dragging?.sport === sport || (selected?.sport === sport && !occupant);
                      return (
                        <div
                          key={index}
                          data-drop={`${sport}|${key}|${index}`}
                          onClick={() => tapSpot(sport, { key, index }, occupant)}
                          className={`flex min-h-9 items-center gap-1 rounded-md border px-1 ${
                            occupant
                              ? clash
                                ? "border-red-400 bg-red-50"
                                : "border-transparent bg-white/70"
                              : `border-dashed ${target ? "border-club-600 bg-white" : "border-stone-300 bg-white/40"}`
                          }`}
                        >
                          {occupant ? (
                            <>
                              {chip(sport, occupant, { key, index }, "min-w-0 flex-1")}
                              <button
                                type="button"
                                aria-label={`${names.get(occupant) ?? "Speler"} van het terrein halen`}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  remove({ key, index });
                                }}
                                className="shrink-0 rounded px-1 text-stone-400 hover:text-red-700"
                              >
                                ×
                              </button>
                            </>
                          ) : (
                            <span className="px-1 text-xs text-stone-400">{optional ? "+ dubbel" : "speler"}</span>
                          )}
                        </div>
                      );
                    };
                    return (
                      <CourtFrame
                        key={key}
                        sport={sport}
                        label={courtLabel(sport, court)}
                        left={[spot(0), spot(1), sum(sport, [p[0], p[1]])]}
                        right={[spot(2), spot(3), sum(sport, [p[2], p[3]])]}
                        note={
                          sport === "padel" && filled > 0 && filled < 4 ? (
                            <span className="text-[11px] text-amber-700">{filled}/4</span>
                          ) : null
                        }
                      />
                    );
                  })}
                </CourtRow>
                {(() => {
                  const busy = [
                    ...new Set(
                      range(setup.courts).flatMap((court) => {
                        const key = matchKey({ slot, sport, court });
                        return (places[key] ?? EMPTY).filter((id) => id && clashes.has(`${key}|${id}`));
                      }),
                    ),
                  ];
                  return busy.length > 0 ? (
                    <p className="mt-1 text-sm text-red-700">
                      {busy.map((id) => names.get(id) ?? "Iemand").join(", ")}{" "}
                      {busy.length === 1 ? "staat" : "staan"} op hetzelfde moment op een ander terrein.
                    </p>
                  ) : null;
                })()}
              </Card>
            ))}
          </section>
        );
      })}

      <div className="sticky bottom-2 z-30 flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white/95 p-3 shadow-md">
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

      {dragging && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-full bg-club-700 px-3 py-1 text-xs font-semibold text-white shadow-lg"
          style={{ left: dragging.x, top: dragging.y }}
        >
          {dragging.label}
        </div>
      )}
    </div>
  );
}

type Dragging = Pick & { label: string; x: number; y: number };

// Drag with mouse, pen or finger (pointer events, so it also works on a
// phone). A press without movement counts as a tap. While dragging near the
// top or bottom of the screen, the page scrolls along.
function usePointerDrag(
  onDrop: (pick: Pick, target: string | null) => void,
  setSelected: (pick: Pick | null) => void,
) {
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const start = useRef<{ pick: Pick; label: string; x: number; y: number; active: boolean } | null>(null);
  const pos = useRef({ x: 0, y: 0 });

  const startDrag = (e: ReactPointerEvent, pick: Pick, label: string) => {
    if (e.button !== 0) return;
    start.current = { pick, label, x: e.clientX, y: e.clientY, active: false };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = start.current;
      if (!s) return;
      pos.current = { x: e.clientX, y: e.clientY };
      if (!s.active && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 5) {
        s.active = true;
        setSelected(null);
      }
      if (s.active) setDragging({ ...s.pick, label: s.label, x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s?.active) return; // a tap: the click handlers take it
      setDragging(null);
      const target = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-drop]")
        ?.dataset.drop;
      onDrop(s.pick, target ?? null);
      // Swallow the click that may follow the drag, so it isn't taken as a tap.
      const swallow = (c: MouseEvent) => c.stopPropagation();
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 100);
    };
    const cancel = () => {
      start.current = null;
      setDragging(null);
    };
    const scroll = window.setInterval(() => {
      if (!start.current?.active) return;
      const { y } = pos.current;
      // The club header is sticky, so the top zone starts below it.
      const top = 110;
      const bottom = 70;
      if (y < top) window.scrollBy(0, -Math.ceil((top - y) / 5));
      else if (y > window.innerHeight - bottom)
        window.scrollBy(0, Math.ceil((y - window.innerHeight + bottom) / 5));
    }, 16);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.clearInterval(scroll);
    };
  }, [onDrop, setSelected]);

  return { dragging, startDrag };
}

// Start and end of a time slot, per quarter of an hour. Moving the start
// keeps the length of the slot.
function SlotTimes({
  sport,
  slot,
  time,
  onChange,
}: {
  sport: Sport;
  slot: number;
  time: SlotTime;
  onChange: (time: SlotTime) => void;
}) {
  const wrong = !time.start || !time.end || time.end <= time.start;
  const select = (field: "start" | "end") => (
    <select
      aria-label={`${sportLabel(sport)}, tijdsslot ${slot}, ${field === "start" ? "beginuur" : "einduur"}`}
      value={time[field] ?? ""}
      onChange={(e) => {
        const value = e.target.value || null;
        if (field === "start" && value && time.start && time.end) {
          const length = toMinutes(time.end) - toMinutes(time.start);
          onChange({ start: value, end: fromMinutes(toMinutes(value) + Math.max(15, length)) });
        } else onChange({ ...time, [field]: value });
      }}
      className={`${inputClass} !mt-0 !w-auto !py-1.5 ${wrong ? "!border-red-500" : ""}`}
    >
      <option value="">--:--</option>
      {QUARTERS.map((q) => (
        <option key={q} value={q}>
          {q}
        </option>
      ))}
    </select>
  );
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-stone-800">Tijdsslot {slot}</span>
      {select("start")}
      <span className="text-sm text-stone-500">tot</span>
      {select("end")}
      {wrong && <span className="text-xs text-red-700">Kies een beginuur en een later einduur.</span>}
    </div>
  );
}
