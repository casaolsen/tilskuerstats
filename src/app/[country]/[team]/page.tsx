import Link from "next/link";
import { notFound } from "next/navigation";
import { getTeamDetail } from "@/lib/queries";
import { AttendanceLineChart } from "@/components/AttendanceLineChart";
import { SeasonSelector } from "@/components/SeasonSelector";
import { NoteBadge } from "@/components/NoteBadge";

// Data changes as scrapers run — render fresh per request instead of baking
// it in at build time.
export const dynamic = "force-dynamic";

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string; team: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { country, team } = await params;
  const { season } = await searchParams;
  const data = await getTeamDetail(team, season);
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={`/${country}`} className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
          ← {data.team.countryName}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {data.team.website ? (
            <a href={data.team.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {data.team.name}
            </a>
          ) : (
            data.team.name
          )}
        </h1>
        <div className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          {data.leagueName} ·{" "}
          {data.team.venueName ? (
            data.team.venueWebsite ? (
              <a href={data.team.venueWebsite} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {data.team.venueName}
              </a>
            ) : (
              data.team.venueName
            )
          ) : null}
          {data.team.city ? `, ${data.team.city}` : ""}
          {data.team.capacity ? ` · Kapacitet ${data.team.capacity.toLocaleString("da-DK")}` : ""}
        </div>
      </div>

      <SeasonSelector basePath={`/${country}/${team}`} seasons={data.seasons} selected={data.selectedSeasonLabel} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-5" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            Gns. tilskuere/hjemmekamp{data.isAllSeasons ? " (alle sæsoner)" : ""}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {data.avgAttendance?.toLocaleString("da-DK") ?? "–"}
          </div>
        </div>
        <div className="rounded-lg border p-5" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Belægning</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {data.avgAttendance && data.team.capacity
              ? `${Math.round((data.avgAttendance / data.team.capacity) * 100)}%`
              : "–"}
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Tilskuertal pr. {data.isAllSeasons ? "kamp (alle sæsoner)" : "runde"} (hjemmekampe)
        </h2>
        <AttendanceLineChart data={data.chartData} xAxisLabel={data.isAllSeasons ? "Kamp #" : "Runde"} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Alle kampe
        </h2>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
                {data.isAllSeasons && (
                  <th className="px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Sæson</th>
                )}
                <th className="px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Runde</th>
                <th className="px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Dato</th>
                <th className="px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Kamp</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--text-muted)" }}>Resultat</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--text-muted)" }}>Tilskuere</th>
              </tr>
            </thead>
            <tbody>
              {data.matches.map((m) => (
                <tr key={m.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  {data.isAllSeasons && (
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>{m.seasonLabel}</td>
                  )}
                  <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>{m.round}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>{m.date}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span>
                        <span className={m.isHome ? "font-medium" : ""}>{m.home}</span>
                        {" – "}
                        <span className={!m.isHome ? "font-medium" : ""}>{m.away}</span>
                      </span>
                      {m.note && <NoteBadge tooltip={m.note} />}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {m.homeScore ?? "–"}–{m.awayScore ?? "–"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {m.isHome ? m.attendance?.toLocaleString("da-DK") ?? "–" : "—"}
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
