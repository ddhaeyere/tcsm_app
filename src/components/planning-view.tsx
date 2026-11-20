import { CourtFrame, CourtRow } from "@/components/court";
import { Card } from "@/components/ui";
import { sportLabel } from "@/lib/format";
import {
  courtLabel,
  matchKey,
  range,
  rankingLabel,
  slotLabel,
  sportSetup,
  toMinutes,
  type PlayerRankings,
} from "@/lib/planning";
import { SPORTS } from "@/lib/registrations";
import type { EventPlanning, PlanningMatch } from "@/lib/types";

// The released planning, read only: per sport and time slot who plays whom
// on which court. The current member's own matches stand out.
export function PlanningView({
  planning,
  matches,
  people,
  myMemberId,
}: {
  planning: EventPlanning;
  matches: PlanningMatch[];
  people: Map<string, PlayerRankings & { full_name: string }>;
  myMemberId: string | null;
}) {
  const byKey = new Map(matches.map((m) => [matchKey(m), m]));
  const side = (ids: string[]) => ids.map((id) => people.get(id)?.full_name ?? "Onbekend").join(" & ") || "–";
  const start = (m: PlanningMatch) => {
    const t = sportSetup(planning, m.sport).times[m.slot - 1]?.start;
    return t ? toMinutes(t) : m.slot * 10000;
  };
  const mine = (m: PlanningMatch) => !!myMemberId && [...m.side_a, ...m.side_b].includes(myMemberId);
  const myMatches = matches
    .filter(mine)
    .sort((a, b) => start(a) - start(b) || SPORTS.indexOf(a.sport) - SPORTS.indexOf(b.sport));
  const label = (m: PlanningMatch) => slotLabel(sportSetup(planning, m.sport).times, m.slot);

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
                <h3 className="mb-2 text-lg font-semibold">{slotLabel(setup.times, slot)}</h3>
                <CourtRow>
                  {rows.map(({ court, match }) => {
                    const team = (ids: string[]) =>
                      ids.length ? (
                        ids.map((id) => (
                          <span
                            key={id}
                            className={`block truncate rounded px-1.5 py-1 text-sm ${id === myMemberId ? "bg-club-700 font-semibold text-white" : "bg-white/70 text-stone-900"}`}
                          >
                            {side([id])}
                            {rankingLabel(people.get(id), sport) && (
                              <span className="ml-1 text-xs font-normal opacity-70">
                                {rankingLabel(people.get(id), sport)}
                              </span>
                            )}
                          </span>
                        ))
                      ) : (
                        <span className="px-1.5 text-sm text-stone-400">–</span>
                      );
                    return (
                      <CourtFrame
                        key={court}
                        sport={sport}
                        label={courtLabel(sport, court)}
                        left={team(match.side_a)}
                        right={team(match.side_b)}
                        highlight={mine(match)}
                      />
                    );
                  })}
                </CourtRow>
              </Card>
            ))}
          </div>
        );
      })}
    </div>
  );
}
