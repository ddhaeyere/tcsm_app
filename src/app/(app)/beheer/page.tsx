import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageTitle } from "@/components/ui";
import { requireOrganiser } from "@/lib/auth";
import { formatDateTime, isPast, plural } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Beheer" };

const SECONDARY_LINK =
  "inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold hover:bg-stone-50";

export default async function AdminPage() {
  const profile = await requireOrganiser();
  const supabase = await createClient();

  const [{ data: events }, pending] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, starts_at, registrations ( tennis, padel )")
      .order("starts_at", { ascending: false }),
    profile.role === "admin"
      ? supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
      : Promise.resolve({ count: 0 }),
  ]);

  return (
    <>
      <PageTitle>Beheer</PageTitle>

      <div className="mb-6 flex flex-wrap gap-3">
        <Link
          href="/beheer/evenementen/nieuw"
          className="inline-flex min-h-10 items-center rounded-lg bg-club-700 px-4 text-sm font-semibold text-white hover:bg-club-800"
        >
          Nieuw evenement
        </Link>
        {profile.role === "admin" && (
          <>
            <Link href="/beheer/leden" className={SECONDARY_LINK}>
              Ledenlijst
            </Link>
            <Link href="/beheer/accounts" className={SECONDARY_LINK}>
              Accounts
              {(pending.count ?? 0) > 0 && <Badge tone="amber">{pending.count} wachten</Badge>}
            </Link>
          </>
        )}
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Evenementen</h2>
        {(events ?? []).length === 0 && <p className="text-sm text-stone-600">Nog geen evenementen.</p>}
        <ul className="divide-y divide-stone-100">
          {(events ?? []).map((e) => {
            const players = e.registrations.filter((r) => r.tennis || r.padel).length;
            return (
              <li key={e.id} className="py-2">
                <Link href={`/beheer/evenementen/${e.id}`} className="flex items-center gap-2">
                  <span className="flex-1">
                    <span className="font-medium text-club-800 underline">{e.title}</span>
                    <span className="block text-sm text-stone-600">{formatDateTime(e.starts_at)}</span>
                  </span>
                  {isPast(e.starts_at) && <Badge>voorbij</Badge>}
                  <Badge tone="green">{plural(players, "speler", "spelers")}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
