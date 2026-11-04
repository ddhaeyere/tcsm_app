import type { Sport } from "./types";

// Official rankings of Tennis en Padel Vlaanderen, lowest first.
// Adjust these lists when the federation changes its rankings.
export const RANKINGS: Record<Sport, string[]> = {
  // Tennis uses points: 3, 5, then steps of 5 up to 110.
  tennis: ["3", ...Array.from({ length: 22 }, (_, i) => String((i + 1) * 5))],
  padel: ["P50", "P100", "P200", "P300", "P400", "P500", "P700", "P1000"],
};

export const NO_RANKING = "Geen klassement";

export function rankingOptions(sport: Sport): string[] {
  return [NO_RANKING, ...RANKINGS[sport]];
}

export function isValidRanking(sport: Sport, ranking: string): boolean {
  return rankingOptions(sport).includes(ranking);
}

// Reads a ranking as written in the club's member list, e.g. "5 ptn *" or
// "P50 *". Returns null when it is empty or not a known ranking.
export function parseRanking(sport: Sport, text: string): string | null {
  const value = text.replace(/\*/g, "").replace(/\s*ptn?\.?\s*$/i, "").trim().toUpperCase();
  if (!value) return null;
  return RANKINGS[sport].find((r) => r.toUpperCase() === value) ?? null;
}
