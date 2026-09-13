import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { buttonClass, buttonStyle } from "@/lib/admin-ui";

export const dynamic = "force-dynamic";

async function saveRoster(formData: FormData) {
  "use server";
  const seasonId = String(formData.get("seasonId"));
  const selectedTeamIds = formData.getAll("teamId").map(String);

  const current = await prisma.seasonTeam.findMany({ where: { seasonId }, select: { teamId: true } });
  const currentIds = new Set(current.map((c) => c.teamId));
  const selectedIds = new Set(selectedTeamIds);

  const toAdd = selectedTeamIds.filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !selectedIds.has(id));

  await prisma.$transaction([
    ...toAdd.map((teamId) => prisma.seasonTeam.create({ data: { seasonId, teamId } })),
    ...(toRemove.length
      ? [prisma.seasonTeam.deleteMany({ where: { seasonId, teamId: { in: toRemove } } })]
      : []),
  ]);

  revalidatePath(`/admin/seasons/${seasonId}/roster`);
  revalidatePath("/admin/seasons");
}

export default async function SeasonRosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const season = await prisma.season.findUnique({
    where: { id },
    include: { league: { include: { country: true } }, seasonTeams: { select: { teamId: true } } },
  });
  if (!season) notFound();

  const teams = await prisma.team.findMany({
    where: { countryId: season.league.countryId },
    orderBy: { name: "asc" },
  });
  const memberIds = new Set(season.seasonTeams.map((st) => st.teamId));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/seasons" className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
          ← Sæsoner
        </Link>
        <h1 className="mt-1 text-xl font-semibold">
          Hold i {season.league.name} {season.label}
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Marker hvilke af {season.league.country.name}s hold der spiller i denne liga-sæson. Bruges til at håndtere
          op- og nedrykning — samme hold kan være markeret i en anden liga en anden sæson.
        </p>
      </div>

      <form action={saveRoster} className="flex flex-col gap-4">
        <input type="hidden" name="seasonId" value={season.id} />
        <div className="grid gap-2 sm:grid-cols-2">
          {teams.map((t) => (
            <label
              key={t.id}
              className="flex items-center gap-2 rounded border p-2 text-sm"
              style={{ borderColor: "var(--border)" }}
            >
              <input type="checkbox" name="teamId" value={t.id} defaultChecked={memberIds.has(t.id)} />
              {t.name}
            </label>
          ))}
        </div>
        <div>
          <button type="submit" className={buttonClass} style={buttonStyle}>Gem hold i sæson</button>
        </div>
      </form>
    </div>
  );
}
