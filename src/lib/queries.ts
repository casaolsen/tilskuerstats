import { prisma } from "./db";

function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
}

// % change from `previous` to `current`, or null when there's nothing to
// compare against (no previous season, or it had no recorded attendances).
function pctChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export async function getCountriesOverview() {
  const countries = await prisma.country.findMany({
    orderBy: { code: "asc" },
    include: {
      leagues: {
        include: {
          seasons: {
            // nulls: "last" — a season created without a start date must never
            // be mistaken for "latest" (Postgres' default DESC order puts
            // NULLs first, which silently broke the season-over-season trend).
            orderBy: { startDate: { sort: "desc", nulls: "last" } },
            take: 2, // latest + previous, for the season-over-season trend
            include: {
              matches: { select: { attendance: true } },
              _count: { select: { matches: true } },
            },
          },
        },
      },
    },
  });

  return countries.map((country) => {
    const league = country.leagues[0];
    const season = league?.seasons[0];
    const previousSeason = league?.seasons[1];
    const avgAttendance = average(season?.matches.map((m) => m.attendance) ?? []);
    const previousAvgAttendance = average(previousSeason?.matches.map((m) => m.attendance) ?? []);
    return {
      code: country.code,
      name: country.name,
      leagueName: league?.name ?? null,
      seasonLabel: season?.label ?? null,
      matchCount: season?._count.matches ?? 0,
      avgAttendance,
      changePct: pctChange(avgAttendance, previousAvgAttendance),
    };
  });
}

// Top clubs across all three countries, ranked by their latest season's
// average home attendance, each with its season-over-season trend.
export async function getTopClubs(limit = 10) {
  const countries = await prisma.country.findMany({
    include: {
      leagues: {
        include: {
          seasons: { orderBy: { startDate: { sort: "desc", nulls: "last" } }, take: 2 },
        },
      },
    },
  });

  const rows: {
    slug: string;
    name: string;
    countryCode: string;
    countryName: string;
    venueName: string | null;
    city: string | null;
    avgAttendance: number | null;
    changePct: number | null;
  }[] = [];

  for (const country of countries) {
    const league = country.leagues[0];
    const latestSeason = league?.seasons[0];
    if (!league || !latestSeason) continue;
    const previousSeason = league.seasons[1];
    const seasonIds = [latestSeason.id, previousSeason?.id].filter((id): id is string => !!id);

    const teams = await prisma.team.findMany({
      where: { countryId: country.id, seasons: { some: { seasonId: latestSeason.id } } },
      include: {
        homeVenue: true,
        homeMatches: {
          where: { seasonId: { in: seasonIds } },
          select: { attendance: true, seasonId: true },
        },
      },
    });

    for (const team of teams) {
      const avgAttendance = average(
        team.homeMatches.filter((m) => m.seasonId === latestSeason.id).map((m) => m.attendance)
      );
      const previousAvgAttendance = previousSeason
        ? average(team.homeMatches.filter((m) => m.seasonId === previousSeason.id).map((m) => m.attendance))
        : null;

      rows.push({
        slug: team.slug,
        name: team.name,
        countryCode: country.code,
        countryName: country.name,
        venueName: team.homeVenue?.name ?? null,
        city: team.homeVenue?.city ?? null,
        avgAttendance,
        changePct: pctChange(avgAttendance, previousAvgAttendance),
      });
    }
  }

  return rows
    .filter((r) => r.avgAttendance != null)
    .sort((a, b) => (b.avgAttendance ?? 0) - (a.avgAttendance ?? 0))
    .slice(0, limit);
}

// seasonParam: undefined -> latest season (default); "all" -> aggregate across
// every season on record; otherwise the exact Season.label to filter to.
export async function getLeagueByCountryCode(code: string, seasonParam?: string) {
  const country = await prisma.country.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      leagues: {
        include: {
          seasons: { orderBy: { startDate: { sort: "desc", nulls: "last" } } },
        },
      },
    },
  });
  if (!country || country.leagues.length === 0) return null;

  const league = country.leagues[0];
  const seasons = league.seasons;
  if (seasons.length === 0) return null;

  const latestSeason = seasons[0];
  const isAllSeasons = seasonParam === "all";
  const selectedSeason = isAllSeasons ? null : (seasons.find((s) => s.label === seasonParam) ?? latestSeason);
  // Season immediately before the selected one, for the trend column — not
  // meaningful in "all seasons" view, so left null there.
  const previousSeason = isAllSeasons
    ? null
    : (seasons[seasons.findIndex((s) => s.id === selectedSeason!.id) + 1] ?? null);

  const teams = await prisma.team.findMany({
    where: {
      countryId: country.id,
      seasons: {
        some: isAllSeasons ? { season: { leagueId: league.id } } : { seasonId: selectedSeason!.id },
      },
    },
    include: {
      homeVenue: true,
      homeMatches: {
        where: isAllSeasons
          ? { season: { leagueId: league.id } }
          : { seasonId: previousSeason ? { in: [selectedSeason!.id, previousSeason.id] } : selectedSeason!.id },
        select: {
          attendance: true,
          seasonId: true,
          note: true,
          kickoff: true,
          awayTeam: { select: { name: true } },
        },
      },
    },
  });

  const teamStats = teams
    .map((team) => {
      const currentMatches = isAllSeasons
        ? team.homeMatches
        : team.homeMatches.filter((m) => m.seasonId === selectedSeason!.id);
      const avgAttendance = average(currentMatches.map((m) => m.attendance));
      const previousAvgAttendance = previousSeason
        ? average(team.homeMatches.filter((m) => m.seasonId === previousSeason.id).map((m) => m.attendance))
        : null;
      const capacity = team.homeVenue?.capacity ?? null;
      const fillRate = avgAttendance && capacity ? avgAttendance / capacity : null;
      const notes = currentMatches
        .filter((m): m is typeof m & { note: string } => !!m.note)
        .map((m) => `${m.kickoff.toISOString().slice(0, 10)} vs. ${m.awayTeam.name}: ${m.note}`);
      return {
        slug: team.slug,
        name: team.name,
        shortName: team.shortName,
        venueName: team.homeVenue?.name ?? null,
        city: team.homeVenue?.city ?? null,
        capacity,
        avgAttendance,
        changePct: pctChange(avgAttendance, previousAvgAttendance),
        fillRate,
        matchesPlayed: currentMatches.length,
        notes,
      };
    })
    .sort((a, b) => (b.avgAttendance ?? 0) - (a.avgAttendance ?? 0));

  return {
    country: { code: country.code, name: country.name },
    league: { name: league.name, slug: league.slug },
    seasons: seasons.map((s) => s.label), // newest first
    selectedSeasonLabel: isAllSeasons ? "all" : selectedSeason!.label,
    isAllSeasons,
    teams: teamStats,
  };
}

// seasonParam: undefined -> latest season (default); "all" -> full history;
// otherwise the exact Season.label to filter to.
export async function getTeamDetail(slug: string, seasonParam?: string) {
  const team = await prisma.team.findUnique({
    where: { slug },
    include: { country: true, homeVenue: true },
  });
  if (!team) return null;

  const league = await prisma.league.findFirst({
    where: { countryId: team.countryId },
    include: { seasons: { orderBy: { startDate: { sort: "desc", nulls: "last" } } } },
  });
  if (!league || league.seasons.length === 0) return null;

  const seasons = league.seasons;
  const latestSeason = seasons[0];
  const isAllSeasons = seasonParam === "all";
  const selectedSeason = isAllSeasons ? null : (seasons.find((s) => s.label === seasonParam) ?? latestSeason);

  const matches = await prisma.match.findMany({
    where: {
      OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
      ...(isAllSeasons ? { season: { leagueId: league.id } } : { seasonId: selectedSeason!.id }),
    },
    include: { homeTeam: true, awayTeam: true, season: true },
    orderBy: [{ season: { startDate: "asc" } }, { kickoff: "asc" }],
  });

  const homeMatches = matches.filter((m) => m.homeTeamId === team.id);
  const attendances = homeMatches.map((m) => m.attendance).filter((a): a is number => a != null);
  const avgAttendance = attendances.length
    ? Math.round(attendances.reduce((a, b) => a + b, 0) / attendances.length)
    : null;

  return {
    team: {
      slug: team.slug,
      name: team.name,
      website: team.website,
      countryCode: team.country.code,
      countryName: team.country.name,
      venueName: team.homeVenue?.name ?? null,
      venueWebsite: team.homeVenue?.website ?? null,
      city: team.homeVenue?.city ?? null,
      capacity: team.homeVenue?.capacity ?? null,
    },
    leagueName: league.name,
    seasons: seasons.map((s) => s.label), // newest first
    selectedSeasonLabel: isAllSeasons ? "all" : selectedSeason!.label,
    isAllSeasons,
    avgAttendance,
    chartData: homeMatches.map((m, i) => ({
      x: isAllSeasons ? i + 1 : (m.round ?? i + 1),
      round: m.round,
      seasonLabel: m.season.label,
      opponent: m.awayTeam.name,
      attendance: m.attendance,
      date: m.kickoff.toISOString().slice(0, 10),
      note: m.note,
    })),
    matches: matches.map((m) => ({
      id: m.id,
      round: m.round,
      seasonLabel: m.season.label,
      date: m.kickoff.toISOString().slice(0, 10),
      home: m.homeTeam.name,
      away: m.awayTeam.name,
      isHome: m.homeTeamId === team.id,
      attendance: m.attendance,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      note: m.note,
    })),
  };
}
