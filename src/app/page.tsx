import Link from "next/link";
import { getCountriesOverview } from "@/lib/queries";

// Data changes as scrapers run — render fresh per request instead of baking
// it in at build time.
export const dynamic = "force-dynamic";

const SERIES_COLOR: Record<string, string> = {
  DK: "var(--series-dk)",
  SE: "var(--series-se)",
  NO: "var(--series-no)",
};

const DISPLAY_ORDER = ["DK", "SE", "NO"];

export default async function Home() {
  const countries = (await getCountriesOverview()).sort(
    (a, b) => DISPLAY_ORDER.indexOf(a.code) - DISPLAY_ORDER.indexOf(b.code)
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tilskuertal i Norden</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--text-secondary)" }}>
          Tilskuerstatistik for de øverste fodboldrækker i Danmark, Sverige og Norge —
          samlet ét sted. Senere udvides siden med en prognosemodel baseret på historik,
          vejr og holdenes performance.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {countries.map((c) => (
          <Link
            key={c.code}
            href={`/${c.code.toLowerCase()}`}
            className="rounded-lg border p-5 transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.03]"
            style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: SERIES_COLOR[c.code] }}
              />
              <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                {c.name}
              </span>
            </div>
            <div className="mt-3 text-lg font-semibold">{c.leagueName ?? "—"}</div>
            <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              {c.seasonLabel ?? "Ingen sæson"}
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tabular-nums">
                {c.avgAttendance?.toLocaleString("da-DK") ?? "–"}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                gns. tilskuere/kamp
              </span>
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              {c.matchCount.toLocaleString("da-DK")} kampe registreret
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
