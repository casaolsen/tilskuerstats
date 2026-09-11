/**
 * Reference scraper for Danish Superliga attendance data from superstats.dk.
 *
 * STATUS: unverified against the live site. This sandbox's network egress proxy
 * blocks superstats.dk (see README "Data collection"), so the CSS selectors
 * below are a best-effort guess at a typical results-table layout, not
 * confirmed against the real DOM. Before relying on this:
 *   1. Run `npm run scrape:dk-superliga -- --dry-run --round 1` from an
 *      environment with normal internet access.
 *   2. If it prints 0 matches or garbage, open the page's HTML and fix the
 *      selectors in ROUND_PAGE_SELECTORS below — the parsing logic
 *      (parseRoundPage) is isolated from fetching specifically so this is a
 *      quick, low-risk fix.
 *
 * This file is the pattern to copy for the Swedish (Allsvenskan) and
 * Norwegian (Eliteserien) scrapers, which need their own source + selectors
 * since neither site shares superstats.dk's markup.
 */
import "dotenv/config";
import * as cheerio from "cheerio";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import { PrismaClient } from "../generated/prisma/client";
import { LEAGUES } from "../../prisma/seed-data";
import { resolveSlug, type ScrapedMatch, type TeamNameMap } from "./types";

const BASE_URL = "https://superstats.dk";
const ROUND_URL = (round: number, season: string) =>
  `${BASE_URL}/program?saeson=${encodeURIComponent(season)}&runde=${round}`;

// superstats.dk uses Danish club names close to our canonical names; extend
// this map with the exact strings the site renders once verified (step 2 above).
const TEAM_NAME_MAP: TeamNameMap = Object.fromEntries(
  LEAGUES.find((l) => l.leagueSlug === "superliga")!.teams.map((t) => [t.name, t.slug])
);

// NOTE: guessed selectors — see file header. Adjust once checked against a
// real page.
const ROUND_PAGE_SELECTORS = {
  matchRow: "table.matches tr",
  homeTeam: ".home-team",
  awayTeam: ".away-team",
  attendance: ".attendance",
  score: ".score",
  date: ".match-date",
};

export function parseRoundPage(html: string, round: number, sourceUrl: string): ScrapedMatch[] {
  const $ = cheerio.load(html);
  const matches: ScrapedMatch[] = [];

  $(ROUND_PAGE_SELECTORS.matchRow).each((_, row) => {
    const $row = $(row);
    const homeTeam = $row.find(ROUND_PAGE_SELECTORS.homeTeam).text().trim();
    const awayTeam = $row.find(ROUND_PAGE_SELECTORS.awayTeam).text().trim();
    if (!homeTeam || !awayTeam) return; // header row or unrelated markup

    const attendanceText = $row.find(ROUND_PAGE_SELECTORS.attendance).text().replace(/\D/g, "");
    const scoreText = $row.find(ROUND_PAGE_SELECTORS.score).text().trim(); // e.g. "2-1"
    const [homeScoreStr, awayScoreStr] = scoreText.split(/[-–]/).map((s) => s.trim());
    const dateText = $row.find(ROUND_PAGE_SELECTORS.date).text().trim();

    matches.push({
      homeTeam,
      awayTeam,
      kickoff: dateText ? new Date(dateText) : new Date(NaN),
      attendance: attendanceText ? parseInt(attendanceText, 10) : null,
      homeScore: homeScoreStr ? parseInt(homeScoreStr, 10) : null,
      awayScore: awayScoreStr ? parseInt(awayScoreStr, 10) : null,
      round,
      sourceUrl,
    });
  });

  return matches;
}

async function fetchRound(round: number, season: string): Promise<ScrapedMatch[]> {
  const url = ROUND_URL(round, season);
  const res = await fetch(url, {
    headers: { "User-Agent": "tilskuerstats-bot/0.1 (+https://github.com/casaolsen/tilskuerstats)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  const html = await res.text();
  return parseRoundPage(html, round, url);
}

async function upsertMatches(matches: ScrapedMatch[], seasonLabel: string) {
  neonConfig.webSocketConstructor = ws;
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const season = await prisma.season.findFirst({
    where: { label: seasonLabel, league: { slug: "superliga" } },
  });
  if (!season) throw new Error(`Season ${seasonLabel} not found — run \`npm run db:seed\` first.`);

  let updated = 0;
  let skipped = 0;

  for (const m of matches) {
    const homeSlug = resolveSlug(TEAM_NAME_MAP, m.homeTeam);
    const awaySlug = resolveSlug(TEAM_NAME_MAP, m.awayTeam);
    if (!homeSlug || !awaySlug) {
      console.warn(`Unrecognized team name(s): "${m.homeTeam}" / "${m.awayTeam}" — add to TEAM_NAME_MAP.`);
      skipped++;
      continue;
    }

    const [homeTeam, awayTeam] = await Promise.all([
      prisma.team.findUniqueOrThrow({ where: { slug: homeSlug } }),
      prisma.team.findUniqueOrThrow({ where: { slug: awaySlug } }),
    ]);

    const existing = await prisma.match.findFirst({
      where: { seasonId: season.id, homeTeamId: homeTeam.id, awayTeamId: awayTeam.id, round: m.round },
    });

    const data = {
      attendance: m.attendance,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      ...(Number.isNaN(m.kickoff.getTime()) ? {} : { kickoff: m.kickoff }),
      source: m.sourceUrl,
    };

    if (existing) {
      await prisma.match.update({ where: { id: existing.id }, data });
    } else {
      await prisma.match.create({
        data: { seasonId: season.id, homeTeamId: homeTeam.id, awayTeamId: awayTeam.id, round: m.round, kickoff: m.kickoff, ...data },
      });
    }
    updated++;
  }

  await prisma.$disconnect();
  return { updated, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const roundArg = args.find((a) => a.startsWith("--round"));
  const round = roundArg ? parseInt(roundArg.split("=")[1] ?? args[args.indexOf(roundArg) + 1], 10) : 1;
  const season = LEAGUES.find((l) => l.leagueSlug === "superliga")!.seasonLabel;

  console.log(`Fetching round ${round} of Superliga ${season} from ${BASE_URL} ...`);
  const matches = await fetchRound(round, season);
  console.log(`Parsed ${matches.length} matches.`);

  if (dryRun || matches.length === 0) {
    console.log(JSON.stringify(matches, null, 2));
    if (matches.length === 0) {
      console.error("0 matches parsed — the selectors in ROUND_PAGE_SELECTORS likely need updating.");
      process.exitCode = 1;
    }
    return;
  }

  const { updated, skipped } = await upsertMatches(matches, season);
  console.log(`Upserted ${updated} matches, skipped ${skipped} (unrecognized team names).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
