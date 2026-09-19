import Link from "next/link";
import { getCountriesOverview, getTopClubs } from "@/lib/queries";
import { TrendIndicator } from "@/components/TrendIndicator";

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
  const [countries, topClubs] = await Promise.all([
    getCountriesOverview().then((rows) =>
      rows.sort((a, b) => DISPLAY_ORDER.indexOf(a.code) - DISPLAY_ORDER.indexOf(b.code))
    ),
    getTopClubs(10),
  ]);

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
              <span className="ml-auto">
                <TrendIndicator pct={c.changePct} />
              </span>
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              {c.matchCount.toLocaleString("da-DK")} kampe registreret
            </div>
          </Link>
        ))}
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Top 10 klubber på tværs af Norden
        </h2>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
                <th className="px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>#</th>
                <th className="px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Klub</th>
                <th className="px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Land</th>
                <th className="px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Stadion</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--text-muted)" }}>Gns. tilskuere</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--text-muted)" }}>Udvikling</th>
              </tr>
            </thead>
            <tbody>
              {topClubs.map((c, i) => (
                <tr key={c.slug} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                  <td className="px-3 py-2">
                    <Link href={`/${c.countryCode.toLowerCase()}/${c.slug}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: SERIES_COLOR[c.countryCode] }}
                      />
                      <span style={{ color: "var(--text-secondary)" }}>{c.countryName}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                    {c.venueName} {c.city ? `· ${c.city}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {c.avgAttendance?.toLocaleString("da-DK") ?? "–"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <TrendIndicator pct={c.changePct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
