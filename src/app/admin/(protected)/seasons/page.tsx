import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { buttonClass, buttonStyle, inputClass, inputStyle } from "@/lib/admin-ui";

export const dynamic = "force-dynamic";

async function createSeason(formData: FormData) {
  "use server";
  const leagueId = String(formData.get("leagueId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const startDateRaw = String(formData.get("startDate") ?? "");
  if (!leagueId || !label) return;
  await prisma.season.create({
    data: {
      leagueId,
      label,
      startDate: startDateRaw ? new Date(startDateRaw) : null,
    },
  });
  revalidatePath("/admin/seasons");
}

export default async function SeasonsAdminPage() {
  const leagues = await prisma.league.findMany({
    include: {
      country: true,
      seasons: {
        orderBy: { startDate: "desc" },
        include: { _count: { select: { seasonTeams: true, matches: true } } },
      },
    },
    orderBy: [{ country: { code: "asc" } }, { tier: "asc" }],
  });

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-xl font-semibold">Sæsoner</h1>

      {leagues.map((league) => (
        <section key={league.id} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            {league.country.code} · {league.name}
          </h2>

          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
                  <th className="px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Sæson</th>
                  <th className="px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>Start</th>
                  <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--text-muted)" }}>Hold</th>
                  <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--text-muted)" }}>Kampe</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {league.seasons.map((s) => (
                  <tr key={s.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2 font-medium">{s.label}</td>
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                      {s.startDate ? s.startDate.toISOString().slice(0, 10) : "–"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s._count.seasonTeams}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s._count.matches}</td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/admin/seasons/${s.id}/roster`} className="text-sm hover:underline">
                        Hold i sæson →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={createSeason} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input type="hidden" name="leagueId" value={league.id} />
            <input name="label" placeholder="2026/2027" required className={inputClass} style={inputStyle} />
            <input name="startDate" type="date" className={inputClass} style={inputStyle} />
            <button type="submit" className={buttonClass} style={buttonStyle}>Opret sæson</button>
          </form>
        </section>
      ))}
    </div>
  );
}
