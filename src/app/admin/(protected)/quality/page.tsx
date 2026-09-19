import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function Section({
  title,
  hint,
  count,
  children,
}: {
  title: string;
  hint: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
          style={{ background: "var(--status-critical)" }}
        >
          {count}
        </span>
      </div>
      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{hint}</p>
      <div className="mt-3 flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

function Row({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded border px-2.5 py-1.5 text-sm hover:underline" style={{ borderColor: "var(--border)" }}>
      {label}
    </Link>
  );
}

export default async function DataQualityPage() {
  const [
    teamsNoVenue,
    teamsNoWebsite,
    teamsNoSeason,
    venuesNoCapacity,
    venuesNoWebsite,
    seasonsNoRoster,
    matchesNoAttendanceBySeason,
  ] = await Promise.all([
    prisma.team.findMany({ where: { homeVenueId: null }, include: { country: true }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ where: { website: null }, include: { country: true }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ where: { seasons: { none: {} } }, include: { country: true }, orderBy: { name: "asc" } }),
    prisma.venue.findMany({ where: { capacity: null }, include: { country: true }, orderBy: { name: "asc" } }),
    prisma.venue.findMany({ where: { website: null }, include: { country: true }, orderBy: { name: "asc" } }),
    prisma.season.findMany({
      where: { seasonTeams: { none: {} } },
      include: { league: { include: { country: true } } },
      orderBy: { startDate: "desc" },
    }),
    prisma.match.groupBy({ by: ["seasonId"], where: { attendance: null }, _count: { _all: true } }),
  ]);

  const seasonIdsWithGaps = matchesNoAttendanceBySeason.map((m) => m.seasonId);
  const seasonsForGaps = seasonIdsWithGaps.length
    ? await prisma.season.findMany({
        where: { id: { in: seasonIdsWithGaps } },
        include: { league: { include: { country: true } } },
      })
    : [];
  const gapsBySeasonId = new Map(matchesNoAttendanceBySeason.map((m) => [m.seasonId, m._count._all]));

  const totalIssues =
    teamsNoVenue.length +
    teamsNoWebsite.length +
    teamsNoSeason.length +
    venuesNoCapacity.length +
    venuesNoWebsite.length +
    seasonsNoRoster.length +
    seasonsForGaps.length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Datakvalitet</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Overblik over manglende data på tværs af hold, stadions, sæsoner og kampe.
        </p>
      </div>

      {totalIssues === 0 && (
        <p className="text-sm" style={{ color: "var(--status-good)" }}>
          Alt ser udfyldt ud — ingen mangler fundet.
        </p>
      )}

      <Section
        title="Hold ikke tilknyttet nogen sæson"
        hint="Vises ikke på nogen liga-oversigt, da de mangler en rolle i sæsontruppen. Tilføj dem under en sæsons trup."
        count={teamsNoSeason.length}
      >
        {teamsNoSeason.map((t) => (
          <Row key={t.id} href="/admin/seasons" label={`${t.country.code} · ${t.name}`} />
        ))}
      </Section>

      <Section
        title="Sæsoner uden hold i truppen"
        hint="Ingen hold er markeret som aktive i disse sæsoner — liga-oversigten vil derfor være tom for dem."
        count={seasonsNoRoster.length}
      >
        {seasonsNoRoster.map((s) => (
          <Row
            key={s.id}
            href={`/admin/seasons/${s.id}/roster`}
            label={`${s.league.country.code} · ${s.league.name} · ${s.label}`}
          />
        ))}
      </Section>

      <Section
        title="Hold uden stadion"
        hint="Uden et tilknyttet stadion mangler klubben kapacitet og belægningstal på oversigterne."
        count={teamsNoVenue.length}
      >
        {teamsNoVenue.map((t) => (
          <Row key={t.id} href="/admin/teams" label={`${t.country.code} · ${t.name}`} />
        ))}
      </Section>

      <Section
        title="Kampe uden tilskuertal"
        hint="Disse sæsoner har registrerede kampe uden et tilskuertal — gennemsnit og udvikling bliver upræcise."
        count={seasonsForGaps.length}
      >
        {seasonsForGaps.map((s) => (
          <Row
            key={s.id}
            href={`/admin/matches?season=${s.id}`}
            label={`${s.league.country.code} · ${s.league.name} · ${s.label} — ${gapsBySeasonId.get(s.id)} kamp(e)`}
          />
        ))}
      </Section>

      <Section
        title="Hold uden website"
        hint="Klubnavnet på holdets side bliver ikke et link uden en URL."
        count={teamsNoWebsite.length}
      >
        {teamsNoWebsite.map((t) => (
          <Row key={t.id} href="/admin/teams" label={`${t.country.code} · ${t.name}`} />
        ))}
      </Section>

      <Section
        title="Stadions uden kapacitet"
        hint="Uden kapacitet kan belægningsprocent ikke beregnes."
        count={venuesNoCapacity.length}
      >
        {venuesNoCapacity.map((v) => (
          <Row key={v.id} href="/admin/venues" label={`${v.country.code} · ${v.name}`} />
        ))}
      </Section>

      <Section
        title="Stadions uden website"
        hint="Stadionnavnet på klubsiden bliver ikke et link uden en URL."
        count={venuesNoWebsite.length}
      >
        {venuesNoWebsite.map((v) => (
          <Row key={v.id} href="/admin/venues" label={`${v.country.code} · ${v.name}`} />
        ))}
      </Section>
    </div>
  );
}
