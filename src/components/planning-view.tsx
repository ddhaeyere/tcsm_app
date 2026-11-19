import { Card } from "@/components/ui";
import { sportLabel } from "@/lib/format";
import { courtLabel, matchKey, range, slotLabel, sportSetup } from "@/lib/planning";
import { SPORTS } from "@/lib/registrations";
import type { EventPlanning, PlanningMatch } from "@/lib/types";

// The released planning, read only: per sport and time slot who plays whom
// on which court. The current member's own matches stand out.
export function PlanningView({
  planning,
  matches,
  names,
  myMemberId,
}: {
  planning: EventPlanning;
  matches: PlanningMatch[];
  names: Map<string, string>;
  myMemberId: string | null;
}) {
  const byKey = new Map(matches.map((m) => [matchKey(m), m]));
  const side = (ids: string[]) => ids.map((id) => names.get(id) ?? "Onbekend").join(" & ") || "–";
  const mine = (m: PlanningMatch) => !!myMemberId && [...m.side_a, ...m.side_b].includes(myMemberId);
  const myMatches = matches
    .filter(mine)
    .sort((a, b) => SPORTS.indexOf(a.sport) - SPORTS.indexOf(b.sport) || a.slot - b.slot);
  const label = (m: PlanningMatch) => slotLabel(sportSetup(planning, m.sport).labels, m.slot);

  if (matches.length === 0)
    return (
      <Card>
        <p className="text-stone-600">De planning is nog leeg.</p>
      </Card>
    );

  return (
    <div className="space-y-4">
      {myMatches.length > 0 && (
        <Card className="border-club-200 bg-club-50">
          <h2 className="mb-2 text-lg font-semibold text-club-900">Jouw wedstrijden</h2>
          <ul className="space-y-1 text-sm text-club-900">
            {myMatches.map((m) => (
              <li key={matchKey(m)}>
                <strong>{label(m)}</strong> · {courtLabel(m.sport, m.court)}: {side(m.side_a)} tegen{" "}
                {side(m.side_b)}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {SPORTS.map((sport) => {
        const setup = sportSetup(planning, sport);
        const slots = range(setup.slots)
          .map((slot) => ({
            slot,
            rows: range(setup.courts)
              .map((court) => ({ court, match: byKey.get(matchKey({ slot, sport, court })) }))
              .filter((r): r is { court: number; match: PlanningMatch } => !!r.match),
          }))
          .filter((s) => s.rows.length > 0);
        if (slots.length === 0) return null;
        return (
          <div key={sport} className="space-y-3">
            <h2 className="text-xl font-bold text-stone-900">{sportLabel(sport)}</h2>
            {slots.map(({ slot, rows }) => (
              <Card key={slot}>
                <h3 className="mb-2 text-lg font-semibold">{slotLabel(setup.labels, slot)}</h3>
                <ul className="divide-y divide-stone-100">
                  {rows.map(({ court, match }) => (
                    <li
                      key={court}
                      className={`py-2 text-sm ${mine(match) ? "-mx-2 rounded-lg bg-club-50 px-2" : ""}`}
                    >
                      <span className="block text-xs font-medium uppercase tracking-wide text-stone-500">
                        {courtLabel(sport, court)}
                      </span>
                      <span className="text-stone-900">
                        {side(match.side_a)} <span className="text-stone-500">tegen</span> {side(match.side_b)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        );
      })}
    </div>
  );
}
