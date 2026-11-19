import { Card } from "@/components/ui";
import { matchKey, planningCourts, slotLabel } from "@/lib/planning";
import type { EventPlanning, PlanningMatch } from "@/lib/types";

// The released planning, read only: per time slot who plays whom on which
// court. The current member's own matches stand out.
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
  const courts = planningCourts(planning);
  const byKey = new Map(matches.map((m) => [matchKey(m), m]));
  const side = (ids: string[]) => ids.map((id) => names.get(id) ?? "Onbekend").join(" & ") || "–";
  const mine = (m: PlanningMatch) => !!myMemberId && [...m.side_a, ...m.side_b].includes(myMemberId);
  const myMatches = matches.filter(mine).sort((a, b) => a.slot - b.slot);
  const courtLabel = (m: PlanningMatch) =>
    courts.find((c) => c.sport === m.sport && c.court === m.court)?.label ?? "";

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
                <strong>{slotLabel(planning, m.slot)}</strong> · {courtLabel(m)}: {side(m.side_a)} tegen{" "}
                {side(m.side_b)}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {Array.from({ length: planning.slots }, (_, i) => i + 1).map((slot) => {
        const rows = courts
          .map((c) => ({ court: c, match: byKey.get(matchKey({ slot, ...c })) }))
          .filter((r) => r.match);
        if (rows.length === 0) return null;
        return (
          <Card key={slot}>
            <h2 className="mb-2 text-lg font-semibold">{slotLabel(planning, slot)}</h2>
            <ul className="divide-y divide-stone-100">
              {rows.map(({ court, match }) => (
                <li
                  key={court.label}
                  className={`py-2 text-sm ${mine(match!) ? "-mx-2 rounded-lg bg-club-50 px-2" : ""}`}
                >
                  <span className="block text-xs font-medium uppercase tracking-wide text-stone-500">
                    {court.label}
                  </span>
                  <span className="text-stone-900">
                    {side(match!.side_a)} <span className="text-stone-500">tegen</span> {side(match!.side_b)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
