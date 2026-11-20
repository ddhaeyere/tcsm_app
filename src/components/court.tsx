import type { ReactNode } from "react";
import type { Sport } from "@/lib/types";

// A court seen from above: the net in the middle, team 1 on the left half
// and team 2 on the right half. Used by the planning editor (with drop spots)
// and by the read-only planning.
export function CourtFrame({
  sport,
  label,
  left,
  right,
  note,
  highlight = false,
}: {
  sport: Sport;
  label: string;
  left: ReactNode;
  right: ReactNode;
  note?: ReactNode;
  highlight?: boolean;
}) {
  const colours =
    sport === "tennis"
      ? "border-orange-300 bg-orange-50"
      : "border-sky-300 bg-sky-50";
  return (
    <div className={`w-72 shrink-0 snap-start rounded-lg border-2 ${colours} ${highlight ? "ring-2 ring-club-600" : ""}`}>
      <div className="flex items-baseline justify-between px-2 pt-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-600">{label}</span>
        {note}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-1 p-2">
        <div className="flex flex-col justify-center gap-1.5">{left}</div>
        <div className="w-0.5 rounded bg-stone-400" aria-hidden />
        <div className="flex flex-col justify-center gap-1.5">{right}</div>
      </div>
    </div>
  );
}

// The courts of one time slot next to each other; scrolls sideways when
// they don't fit.
export function CourtRow({ children }: { children: ReactNode }) {
  return <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">{children}</div>;
}
