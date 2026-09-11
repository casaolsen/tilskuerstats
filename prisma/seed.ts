import "dotenv/config";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import { PrismaClient } from "../src/generated/prisma/client";
import { LEAGUES } from "./seed-data";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

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

const rand = mulberry32(20250817);

function randInt(min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
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

async function main() {
  for (const league of LEAGUES) {
    const country = await prisma.country.upsert({
      where: { code: league.countryCode },
      update: { name: league.countryName },
      create: { code: league.countryCode, name: league.countryName },
    });

    const leagueRow = await prisma.league.upsert({
      where: { slug: league.leagueSlug },
      update: { name: league.leagueName, countryId: country.id, tier: 1 },
      create: {
        slug: league.leagueSlug,
        name: league.leagueName,
        countryId: country.id,
        tier: 1,
      },
    });

    const season = await prisma.season.upsert({
      where: { leagueId_label: { leagueId: leagueRow.id, label: league.seasonLabel } },
      update: {},
      create: {
        leagueId: leagueRow.id,
        label: league.seasonLabel,
        startDate: new Date(league.seasonStart),
      },
    });

    const teamRows = [];
    for (const t of league.teams) {
      const venue = await prisma.venue.upsert({
        where: { id: `${league.leagueSlug}-${t.slug}-venue` },
        update: { name: t.venue, city: t.city, capacity: t.capacity, countryId: country.id },
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
        update: {
          name: t.name,
          shortName: t.shortName,
          countryId: country.id,
          homeVenueId: venue.id,
        },
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

    // Skip if matches already seeded for this season.
    const existingMatches = await prisma.match.count({ where: { seasonId: season.id } });
    if (existingMatches > 0) {
      console.log(`Skipping matches for ${league.leagueName} (already seeded).`);
      continue;
    }

    const rounds = roundRobinPairs(teamRows.length);
    const kickoffBase = new Date(league.seasonStart);
    let matchCount = 0;

    for (let r = 0; r < rounds.length; r++) {
      const kickoff = new Date(kickoffBase);
      kickoff.setDate(kickoff.getDate() + r * 7);

      for (const [homeIdx, awayIdx] of rounds[r]) {
        const home = teamRows[homeIdx];
        const away = teamRows[awayIdx];
        const variance = 0.8 + rand() * 0.45; // +/- ~20% around the team's known average
        const attendance = Math.min(home.capacity, Math.max(200, Math.round(home.avgAttendance * variance)));

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
    console.log(`Seeded ${league.leagueName}: ${teamRows.length} teams, ${matchCount} matches.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
