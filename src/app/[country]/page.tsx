import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeagueByCountryCode } from "@/lib/queries";
import { AttendanceBarChart } from "@/components/AttendanceBarChart";

const VALID_CODES = ["dk", "se", "no"];

// Data changes as scrapers run — render fresh per request instead of baking
// it in at build time.
export const dynamic = "force-dynamic";

export default async function CountryPage({ params }: { params: Promise<{ country: string }> }) {
  const { country } = await params;
  if (!VALID_CODES.includes(country)) notFound();

  const data = await getLeagueByCountryCode(country);
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>
          {data.country.name} · {data.season.label}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{data.league.name}</h1>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Gennemsnitligt tilskuertal pr. hjemmekamp
        </h2>
        <AttendanceBarChart data={data.teams} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Alle hold
        </h2>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
                <th className="px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>#</th>
                <th className="px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Hold</th>
                <th className="px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Stadion</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--text-muted)" }}>Kapacitet</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--text-muted)" }}>Gns. tilskuere</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--text-muted)" }}>Belægning</th>
              </tr>
            </thead>
            <tbody>
              {data.teams.map((t, i) => (
                <tr key={t.slug} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                  <td className="px-3 py-2">
                    <Link href={`/${country}/${t.slug}`} className="font-medium hover:underline">
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                    {t.venueName} {t.city ? `· ${t.city}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {t.capacity?.toLocaleString("da-DK") ?? "–"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {t.avgAttendance?.toLocaleString("da-DK") ?? "–"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {t.fillRate != null ? `${Math.round(t.fillRate * 100)}%` : "–"}
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
