import type { PrismaClient } from "@/generated/prisma/client";
import { LEAGUES } from "../../prisma/seed-data";

// Deterministic PRNG so re-seeding produces the same demo numbers.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Circle-method round-robin: returns rounds of [homeIndex, awayIndex] pairs,
// alternating home advantage each cycle so it isn't the same team always at home.
function roundRobinPairs(n: number): [number, number][][] {
  const teams = Array.from({ length: n }, (_, i) => i);
  if (n % 2 !== 0) teams.push(-1); // bye
  const rounds: [number, number][][] = [];
  const size = teams.length;
  for (let round = 0; round < size - 1; round++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < size / 2; i++) {
      const a = teams[i];
      const b = teams[size - 1 - i];
      if (a === -1 || b === -1) continue;
      const home = round % 2 === 0 ? a : b;
      const away = round % 2 === 0 ? b : a;
      pairs.push([home, away]);
    }
    rounds.push(pairs);
    // rotate, keep first fixed
    teams.splice(1, 0, teams.pop()!);
  }
  return rounds;
}

export type SeedSummary = {
  league: string;
  season: string;
  teams: number;
  matches: number;
  skipped: boolean;
}[];

// Shared by prisma/seed.ts (CLI) and src/app/api/setup/route.ts (one-click
// browser bootstrap) so the two never drift apart.
export async function runSeed(prisma: PrismaClient): Promise<SeedSummary> {
  const rand = mulberry32(20250817);
  const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
  const summary: SeedSummary = [];

  for (const league of LEAGUES) {
    // update: {} everywhere below is deliberate — once a row exists, admin
    // may have hand-edited its name/venue/etc., and re-running this seed
    // (e.g. from /api/setup after a schema change) must not clobber that.
    // Only brand-new rows get the seed's demo values.
    const country = await prisma.country.upsert({
      where: { code: league.countryCode },
      update: {},
      create: { code: league.countryCode, name: league.countryName },
    });

    const leagueRow = await prisma.league.upsert({
      where: { slug: league.leagueSlug },
      update: {},
      create: {
        slug: league.leagueSlug,
        name: league.leagueName,
        countryId: country.id,
        tier: 1,
      },
    });

    // Teams/venues don't change between seasons in this demo dataset, so
    // they're upserted once per league, outside the season loop below.
    const teamRows = [];
    for (const t of league.teams) {
      const venue = await prisma.venue.upsert({
        where: { id: `${league.leagueSlug}-${t.slug}-venue` },
        update: {},
        create: {
          id: `${league.leagueSlug}-${t.slug}-venue`,
          name: t.venue,
          city: t.city,
          capacity: t.capacity,
          countryId: country.id,
        },
      });
      const team = await prisma.team.upsert({
        where: { slug: t.slug },
        update: {},
        create: {
          slug: t.slug,
          name: t.name,
          shortName: t.shortName,
          countryId: country.id,
          homeVenueId: venue.id,
        },
      });
      teamRows.push({ ...t, id: team.id, venueId: venue.id });
    }

    for (const seasonDef of league.seasons) {
      const season = await prisma.season.upsert({
        where: { leagueId_label: { leagueId: leagueRow.id, label: seasonDef.label } },
        update: {},
        create: {
          leagueId: leagueRow.id,
          label: seasonDef.label,
          startDate: new Date(seasonDef.seasonStart),
        },
      });

      // Roster: this synthetic dataset has every team play every season, but
      // in general this is where promotion/relegation would differ per season.
      for (const t of teamRows) {
        await prisma.seasonTeam.upsert({
          where: { seasonId_teamId: { seasonId: season.id, teamId: t.id } },
          update: {},
          create: { seasonId: season.id, teamId: t.id },
        });
      }

      // Skip if matches already seeded for this season.
      const existingMatches = await prisma.match.count({ where: { seasonId: season.id } });
      if (existingMatches > 0) {
        summary.push({
          league: league.leagueName,
          season: seasonDef.label,
          teams: teamRows.length,
          matches: 0,
          skipped: true,
        });
        continue;
      }

      const rounds = roundRobinPairs(teamRows.length);
      const kickoffBase = new Date(seasonDef.seasonStart);
      let matchCount = 0;

      for (let r = 0; r < rounds.length; r++) {
        const kickoff = new Date(kickoffBase);
        kickoff.setDate(kickoff.getDate() + r * 7);

        for (const [homeIdx, awayIdx] of rounds[r]) {
          const home = teamRows[homeIdx];
          const away = teamRows[awayIdx];
          const variance = 0.8 + rand() * 0.45; // +/- ~20% around the team's known average
          const baseAvg = home.avgAttendance * seasonDef.attendanceFactor;
          const attendance = Math.min(home.capacity, Math.max(200, Math.round(baseAvg * variance)));

          await prisma.match.create({
            data: {
              seasonId: season.id,
              round: r + 1,
              kickoff,
              homeTeamId: home.id,
              awayTeamId: away.id,
              venueId: home.venueId,
              attendance,
              homeScore: randInt(0, 4),
              awayScore: randInt(0, 4),
              source: "seed-demo-data",
            },
          });
          matchCount++;
        }
      }
      summary.push({
        league: league.leagueName,
        season: seasonDef.label,
        teams: teamRows.length,
        matches: matchCount,
        skipped: false,
      });
    }
  }

  return summary;
}
