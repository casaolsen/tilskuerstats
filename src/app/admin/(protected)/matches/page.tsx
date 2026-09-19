import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { buttonClass, buttonStyle, dangerButtonClass, dangerButtonStyle, inputClass, inputStyle } from "@/lib/admin-ui";

export const dynamic = "force-dynamic";

async function updateMatch(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const attendanceRaw = String(formData.get("attendance") ?? "");
  const homeScoreRaw = String(formData.get("homeScore") ?? "");
  const awayScoreRaw = String(formData.get("awayScore") ?? "");
  const kickoffRaw = String(formData.get("kickoff") ?? "");

  await prisma.match.update({
    where: { id },
    data: {
      attendance: attendanceRaw ? Number(attendanceRaw) : null,
      homeScore: homeScoreRaw ? Number(homeScoreRaw) : null,
      awayScore: awayScoreRaw ? Number(awayScoreRaw) : null,
      ...(kickoffRaw ? { kickoff: new Date(kickoffRaw) } : {}),
    },
  });
  revalidatePath(`/admin/matches`);
}

async function deleteMatch(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  await prisma.match.delete({ where: { id } });
  revalidatePath("/admin/matches");
}

async function clearSeason(formData: FormData) {
  "use server";
  const seasonId = String(formData.get("seasonId"));
  const confirmLabel = String(formData.get("confirmLabel") ?? "").trim();
  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!season || confirmLabel !== season.label) {
    redirect(`/admin/matches?season=${seasonId}&clearError=1`);
  }
  await prisma.match.deleteMany({ where: { seasonId } });
  revalidatePath("/admin/matches");
  redirect(`/admin/matches?season=${seasonId}&cleared=1`);
}

async function createMatch(formData: FormData) {
  "use server";
  const seasonId = String(formData.get("seasonId"));
  const homeTeamId = String(formData.get("homeTeamId"));
  const awayTeamId = String(formData.get("awayTeamId"));
  const kickoffRaw = String(formData.get("kickoff") ?? "");
  const roundRaw = String(formData.get("round") ?? "");
  if (!seasonId || !homeTeamId || !awayTeamId || homeTeamId === awayTeamId || !kickoffRaw) return;

  const homeTeam = await prisma.team.findUnique({ where: { id: homeTeamId } });
  await prisma.match.create({
    data: {
      seasonId,
      homeTeamId,
      awayTeamId,
      kickoff: new Date(kickoffRaw),
      round: roundRaw ? Number(roundRaw) : null,
      venueId: homeTeam?.homeVenueId ?? null,
    },
  });
  revalidatePath(`/admin/matches`);
}

// Simple comma-split — fine for club names, which don't contain commas.
function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim()));
}

async function importCsv(formData: FormData) {
  "use server";
  const seasonId = String(formData.get("seasonId"));
  const file = formData.get("file");
  if (!seasonId || !(file instanceof File) || file.size === 0) return;

  const rows = parseCsv(await file.text());
  const [header, ...dataRows] = rows;
  const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name);
  const iDate = col("dato");
  const iHome = col("hjemmehold");
  const iAway = col("udehold");
  const iAttendance = col("tilskuere");
  const iHomeScore = col("hjemmemaal");
  const iAwayScore = col("udemaal");
  const iRound = col("runde");

  const teams = await prisma.team.findMany({ select: { id: true, name: true, homeVenueId: true } });
  const byName = new Map(teams.map((t) => [t.name.toLowerCase(), t]));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const missingTeams = new Set<string>();

  for (const row of dataRows) {
    const homeName = iHome >= 0 ? row[iHome] : undefined;
    const awayName = iAway >= 0 ? row[iAway] : undefined;
    const home = homeName ? byName.get(homeName.toLowerCase()) : undefined;
    const away = awayName ? byName.get(awayName.toLowerCase()) : undefined;
    const dateStr = iDate >= 0 ? row[iDate] : undefined;
    const kickoff = dateStr ? new Date(dateStr) : null;

    if (!home && homeName) missingTeams.add(homeName);
    if (!away && awayName) missingTeams.add(awayName);

    if (!home || !away || !kickoff || Number.isNaN(kickoff.getTime())) {
      skipped++;
      continue;
    }

    const attendance = iAttendance >= 0 && row[iAttendance] ? Number(row[iAttendance]) : null;
    const homeScore = iHomeScore >= 0 && row[iHomeScore] ? Number(row[iHomeScore]) : null;
    const awayScore = iAwayScore >= 0 && row[iAwayScore] ? Number(row[iAwayScore]) : null;
    const round = iRound >= 0 && row[iRound] ? Number(row[iRound]) : null;

    const existing = await prisma.match.findFirst({
      where: { seasonId, homeTeamId: home.id, awayTeamId: away.id, kickoff },
    });

    if (existing) {
      await prisma.match.update({
        where: { id: existing.id },
        data: { attendance, homeScore, awayScore, round: round ?? existing.round, source: "csv-import" },
      });
      updated++;
    } else {
      await prisma.match.create({
        data: {
          seasonId,
          homeTeamId: home.id,
          awayTeamId: away.id,
          kickoff,
          attendance,
          homeScore,
          awayScore,
          round,
          venueId: home.homeVenueId,
          source: "csv-import",
        },
      });
      created++;
    }
  }

  revalidatePath("/admin/matches");
  const missingParam = missingTeams.size ? `&missing=${encodeURIComponent([...missingTeams].join(","))}` : "";
  redirect(`/admin/matches?season=${seasonId}&imported=${created}&updated=${updated}&skipped=${skipped}${missingParam}`);
}

export default async function MatchesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    season?: string;
    imported?: string;
    updated?: string;
    skipped?: string;
    missing?: string;
    cleared?: string;
    clearError?: string;
  }>;
}) {
  const { season: seasonParam, imported, updated, skipped, missing, cleared, clearError } = await searchParams;

  const leagues = await prisma.league.findMany({
    include: { country: true, seasons: { orderBy: { startDate: { sort: "desc", nulls: "last" } } } },
    orderBy: [{ country: { code: "asc" } }, { tier: "asc" }],
  });
  const allSeasons = leagues.flatMap((l) =>
    l.seasons.map((s) => ({ id: s.id, label: s.label, leagueName: l.name, countryCode: l.country.code }))
  );
  const selectedSeasonId = seasonParam ?? allSeasons[0]?.id;

  const selectedSeason = selectedSeasonId
    ? await prisma.season.findUnique({ where: { id: selectedSeasonId }, include: { league: { include: { country: true } } } })
    : null;

  const teams = selectedSeason
    ? await prisma.team.findMany({ where: { countryId: selectedSeason.league.countryId }, orderBy: { name: "asc" } })
    : [];

  const matches = selectedSeasonId
    ? await prisma.match.findMany({
        where: { seasonId: selectedSeasonId },
        include: { homeTeam: true, awayTeam: true },
        orderBy: [{ round: "asc" }, { kickoff: "asc" }],
      })
    : [];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Kampe</h1>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <select name="season" defaultValue={selectedSeasonId} className={inputClass} style={{ ...inputStyle, maxWidth: 320 }}>
          {allSeasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.countryCode} · {s.leagueName} · {s.label}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonClass} style={buttonStyle}>Vis</button>
      </form>

      {cleared && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Alle kampe i sæsonen er slettet.
        </p>
      )}
      {clearError && (
        <p className="text-sm" style={{ color: "#e34948" }}>
          Bekræftelsesteksten matchede ikke sæsonens navn — intet blev slettet.
        </p>
      )}
      {(imported || updated || skipped) && (
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          <p>
            Import: {imported} nye, {updated} opdateret, {skipped} sprunget over (hold ikke fundet eller ugyldig dato).
          </p>
          {missing && (
            <p className="mt-1" style={{ color: "#e34948" }}>
              Ukendte holdnavne i filen: {missing.split(",").join(", ")} — opret dem under &quot;Hold&quot; og
              importér filen igen (allerede importerede kampe springes automatisk over anden gang).
            </p>
          )}
        </div>
      )}

      {selectedSeason && (
        <>
          <section>
            <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              {matches.length} kampe i {selectedSeason.league.name} {selectedSeason.label}
            </h2>
            <div className="overflow-x-auto">
              <div className="flex min-w-[880px] flex-col gap-2">
                {matches.map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <form
                      action={updateMatch}
                      className="grid flex-1 grid-cols-[36px_130px_1fr_56px_16px_56px_80px_auto] items-center gap-2 rounded border p-2 text-sm"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="seasonId" value={selectedSeasonId} />
                      <div style={{ color: "var(--text-muted)" }}>{m.round ?? "–"}</div>
                      <input
                        name="kickoff"
                        type="date"
                        defaultValue={m.kickoff.toISOString().slice(0, 10)}
                        className={inputClass}
                        style={inputStyle}
                      />
                      <div className="truncate">
                        {m.homeTeam.name} – {m.awayTeam.name}
                      </div>
                      <input
                        name="homeScore"
                        type="number"
                        defaultValue={m.homeScore ?? ""}
                        placeholder="H"
                        className={inputClass}
                        style={inputStyle}
                      />
                      <div className="text-center" style={{ color: "var(--text-muted)" }}>–</div>
                      <input
                        name="awayScore"
                        type="number"
                        defaultValue={m.awayScore ?? ""}
                        placeholder="U"
                        className={inputClass}
                        style={inputStyle}
                      />
                      <input
                        name="attendance"
                        type="number"
                        defaultValue={m.attendance ?? ""}
                        placeholder="Tilskuere"
                        className={inputClass}
                        style={inputStyle}
                      />
                      <button type="submit" className={buttonClass} style={buttonStyle}>Gem</button>
                    </form>
                    <form action={deleteMatch}>
                      <input type="hidden" name="id" value={m.id} />
                      <button type="submit" className={dangerButtonClass} style={dangerButtonStyle}>Slet</button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Opret kamp</h2>
            <form action={createMatch} className="grid grid-cols-[1fr_1fr_140px_80px_auto] gap-2">
              <input type="hidden" name="seasonId" value={selectedSeasonId} />
              <select name="homeTeamId" required className={inputClass} style={inputStyle}>
                <option value="">Hjemmehold</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <select name="awayTeamId" required className={inputClass} style={inputStyle}>
                <option value="">Udehold</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <input name="kickoff" type="date" required className={inputClass} style={inputStyle} />
              <input name="round" type="number" min={1} placeholder="Runde" className={inputClass} style={inputStyle} />
              <button type="submit" className={buttonClass} style={buttonStyle}>Opret</button>
            </form>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Bulk-import (CSV)</h2>
            <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
              Kommasepareret fil med header:{" "}
              <code>dato,hjemmehold,udehold,tilskuere,hjemmemaal,udemaal,runde</code> — de sidste tre kolonner er
              valgfrie. Holdnavne skal matche præcis (som de hedder under &quot;Hold&quot;). Findes kampen allerede
              (samme hold + dato), opdateres den i stedet for at oprette en ny.
            </p>
            <form action={importCsv} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="seasonId" value={selectedSeasonId} />
              <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
              <button type="submit" className={buttonClass} style={buttonStyle}>Importér</button>
            </form>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Ryd sæson</h2>
            <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
              Sletter alle {matches.length} kampe i {selectedSeason.label} permanent — brug det til at fjerne
              demo-data før en rigtig import. Skriv sæsonens navn (<code>{selectedSeason.label}</code>) for at
              bekræfte.
            </p>
            <form action={clearSeason} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="seasonId" value={selectedSeasonId} />
              <input
                name="confirmLabel"
                placeholder={selectedSeason.label}
                required
                className={inputClass}
                style={{ ...inputStyle, maxWidth: 200 }}
              />
              <button type="submit" className={dangerButtonClass} style={dangerButtonStyle}>
                Slet alle kampe i sæsonen
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
