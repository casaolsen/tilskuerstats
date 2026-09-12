import { prisma } from "./db";

export async function getCountriesOverview() {
  const countries = await prisma.country.findMany({
    orderBy: { code: "asc" },
    include: {
      leagues: {
        include: {
          seasons: {
            orderBy: { startDate: "desc" },
            take: 1,
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
    const attendances = season?.matches.map((m) => m.attendance).filter((a): a is number => a != null) ?? [];
    const avgAttendance = attendances.length
      ? Math.round(attendances.reduce((a, b) => a + b, 0) / attendances.length)
      : null;
    return {
      code: country.code,
      name: country.name,
      leagueName: league?.name ?? null,
      seasonLabel: season?.label ?? null,
      matchCount: season?._count.matches ?? 0,
      avgAttendance,
    };
  });
}

// seasonParam: undefined -> latest season (default); "all" -> aggregate across
// every season on record; otherwise the exact Season.label to filter to.
export async function getLeagueByCountryCode(code: string, seasonParam?: string) {
  const country = await prisma.country.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      leagues: {
        include: {
          seasons: { orderBy: { startDate: "desc" } },
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

  const teams = await prisma.team.findMany({
    where: { countryId: country.id },
    include: {
      homeVenue: true,
      homeMatches: {
        where: isAllSeasons ? { season: { leagueId: league.id } } : { seasonId: selectedSeason!.id },
        select: { attendance: true },
      },
    },
  });

  const teamStats = teams
    .map((team) => {
      const attendances = team.homeMatches.map((m) => m.attendance).filter((a): a is number => a != null);
      const avgAttendance = attendances.length
        ? Math.round(attendances.reduce((a, b) => a + b, 0) / attendances.length)
        : null;
      const capacity = team.homeVenue?.capacity ?? null;
      const fillRate = avgAttendance && capacity ? avgAttendance / capacity : null;
      return {
        slug: team.slug,
        name: team.name,
        shortName: team.shortName,
        venueName: team.homeVenue?.name ?? null,
        city: team.homeVenue?.city ?? null,
        capacity,
        avgAttendance,
        fillRate,
        matchesPlayed: team.homeMatches.length,
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
    include: { seasons: { orderBy: { startDate: "desc" } } },
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
      countryCode: team.country.code,
      countryName: team.country.name,
      venueName: team.homeVenue?.name ?? null,
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
    })),
  };
}
