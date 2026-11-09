"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui";
import { RANKINGS } from "@/lib/rankings";
import type { Sport } from "@/lib/types";

type RankingKey = "singles" | "doubles" | "padel";
type SortKey = "name" | "birth_date" | RankingKey;

const PAGE_SIZE = 25;

const SPORT: Record<RankingKey, Sport> = { singles: "tennis", doubles: "tennis", padel: "padel" };

export interface TableMember {
  id: string;
  // "Last First", as shown and searched.
  name: string;
  email: string | null;
  singles: string | null;
  doubles: string | null;
  padel: string | null;
  // yyyy-mm-dd
  birth_date: string | null;
  is_admin: boolean;
  has_account: boolean;
}

// Position of a ranking in the official list (higher is stronger), or null
// when there is none or it is unknown.
function rank(key: RankingKey, value: string | null): number | null {
  if (!value) return null;
  const i = RANKINGS[SPORT[key]].indexOf(value);
  return i < 0 ? null : i;
}

// The club's member list as a table: search on name, sortable columns and
// pages of 25.
export function MemberTable({ members }: { members: TableMember[] }) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "name", desc: false });
  const [page, setPage] = useState(0);

  const query = filter.trim().toLowerCase();
  const shown = members
    .filter((m) => m.name.toLowerCase().includes(query))
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name, "nl");
      if (sort.key === "name") return sort.desc ? -byName : byName;
      if (sort.key === "birth_date") {
        // Without a birth date always comes last, by name.
        const [da, db] = [a.birth_date, b.birth_date];
        if (!da || !db) return da === db ? byName : !da ? 1 : -1;
        if (da === db) return byName;
        return (da < db ? -1 : 1) * (sort.desc ? -1 : 1);
      }
      // Without a ranking always comes last, by name.
      const ra = rank(sort.key, a[sort.key]);
      const rb = rank(sort.key, b[sort.key]);
      if (ra === null || rb === null) return ra === rb ? byName : ra === null ? 1 : -1;
      if (ra === rb) return byName;
      return sort.desc ? rb - ra : ra - rb;
    });

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = shown.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  // A ranking column starts with the strongest first, birth date with the
  // youngest; name starts at A.
  const sortBy = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "name" }));
    setPage(0);
  };

  const header = (key: SortKey, label: ReactNode) => {
    const active = sort.key === key;
    return (
      <th
        className={`py-2 font-medium ${key === "name" ? "pr-2 text-left" : "px-1 text-center"}`}
        aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
      >
        <button
          type="button"
          onClick={() => sortBy(key)}
          className={`inline-flex items-center gap-0.5 rounded hover:text-club-700 ${
            active ? "text-club-800" : ""
          }`}
        >
          <span className="text-left">{label}</span>
          <span aria-hidden className={`text-[10px] ${active ? "" : "text-stone-300"}`}>
            {active ? (sort.desc ? "▼" : "▲") : "↕"}
          </span>
        </button>
      </th>
    );
  };

  if (members.length === 0)
    return <p className="text-sm text-stone-600">Nog geen leden. Importeer de ledenlijst van de club.</p>;

  return (
    <div>
      <input
        type="search"
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setPage(0);
        }}
        placeholder="Zoek op naam"
        aria-label="Zoek op naam"
        className="mb-3 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base focus:border-club-600 focus:outline-none focus:ring-2 focus:ring-club-200"
      />
      <p className="mb-3 text-xs text-stone-600">
        Klik op een naam om naam, voornaam, e-mailadres, geboortedatum of klassementen aan te passen.
      </p>

      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 align-bottom text-xs text-stone-500">
              {header("name", "Naam")}
              {header("singles", "Tennis enkel")}
              {header("doubles", "Tennis dubbel")}
              {header("padel", "Padel")}
              {header("birth_date", "Geboren")}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="py-2 pr-2">
                  <Link href={`/beheer/leden/${m.id}`} className="font-medium text-club-800 underline">
                    {m.name}
                  </Link>
                  <Link
                    href={`/beheer/leden/${m.id}`}
                    aria-label={`${m.name} bewerken`}
                    className="ml-2 text-xs text-club-700 hover:underline"
                  >
                    ✎ bewerken
                  </Link>
                  <span className="block text-xs text-stone-600">{m.email ?? "geen e-mailadres"}</span>
                  {m.is_admin ? (
                    <span className="mt-1 inline-block">
                      <Badge tone="club">beheerder</Badge>
                    </span>
                  ) : (
                    m.has_account && (
                      <span className="mt-1 inline-block">
                        <Badge tone="green">heeft account</Badge>
                      </span>
                    )
                  )}
                </td>
                <RankingCell value={m.singles} />
                <RankingCell value={m.doubles} />
                <RankingCell value={m.padel} />
                <td className="px-1 py-2 text-center whitespace-nowrap">
                  {m.birth_date ? (
                    m.birth_date.split("-").reverse().join("/")
                  ) : (
                    <span className="text-stone-300" aria-label="geen geboortedatum">
                      –
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-stone-600">
                  Niemand gevonden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav aria-label="Pagina's" className="mt-3 flex items-center justify-between gap-2 text-sm">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
            className="inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-3 font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-40"
          >
            ← Vorige
          </button>
          <span className="text-stone-600">
            {current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, shown.length)} van{" "}
            {shown.length} · pagina {current + 1}/{pages}
          </span>
          <button
            type="button"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
            className="inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-3 font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-40"
          >
            Volgende →
          </button>
        </nav>
      )}
    </div>
  );
}

function RankingCell({ value }: { value: string | null }) {
  return (
    <td className="px-1 py-2 text-center whitespace-nowrap">
      {value ?? (
        <span className="text-stone-300" aria-label="geen klassement">
          –
        </span>
      )}
    </td>
  );
}
