/**
 * Scraper for Danish Superliga attendance data from superstats.dk.
 *
 * Verified against the live site (this is not a guess at the markup):
 * superstats.dk renders a whole season's fixtures as one HTML table per
 * `/program?aar=<YYYY-YYYY>&sr=1` request, grouped into rounds by
 * `<th colspan="2">Runde N</th>` header rows, with match rows identified by
 * a Danish weekday abbreviation in the first cell. The table's `<tr>`/`<td>`
 * tags aren't closed, but cheerio's default (htmlparser2-based) parser
 * repairs that correctly — confirmed by comparing row counts against the
 * page's own round count.
 *
 * This file is the pattern to copy for the Swedish (Allsvenskan) and
 * Norwegian (Eliteserien) scrapers, which need their own source + selectors
 * since neither site shares superstats.dk's markup.
 */
import "dotenv/config";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { LEAGUES } from "../../prisma/seed-data";
import { resolveSlug, type ScrapedMatch, type TeamNameMap } from "./types";

const BASE_URL = "https://superstats.dk";
const DAY_ABBR = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

const seasonUrl = (aarParam: string) => `${BASE_URL}/program?aar=${aarParam}&sr=1`;

// "2025/2026" (our Season.label format) -> "2025-2026" (superstats.dk's `aar` param).
function toAarParam(seasonLabel: string): string {
  return seasonLabel.replace("/", "-");
}

// First year of the label, used to resolve the missing year on each match's
// "DD/MM HH:MM" date (the season page never prints one): Jul-Dec belongs to
// the start year, Jan-Jun to the following year.
function seasonStartYear(seasonLabel: string): number {
  return parseInt(seasonLabel.split("/")[0], 10);
}

// Canonical club identity for every abbreviation superstats.dk has used
// across recent seasons, including 2025/26 promotions (AaB, FC Fredericia)
// that predate this list in prisma/seed-data.ts. Keyed by the exact
// abbreviation the site renders (e.g. in "AGF-FCM"). Used both to resolve a
// match to an existing Team and — since a club can get promoted into the
// league after this file was last touched — to create one on the fly rather
// than silently dropping its matches.
const TEAM_INFO: Record<string, { name: string; slug: string }> = {
  AGF: { name: "AGF", slug: "agf" },
  FCM: { name: "FC Midtjylland", slug: "fc-midtjylland" },
  FCN: { name: "FC Nordsjælland", slug: "fc-nordsjaelland" },
  AaB: { name: "AaB", slug: "aab" },
  SIF: { name: "Silkeborg IF", slug: "silkeborg-if" },
  SJF: { name: "SønderjyskE", slug: "sonderjyske" },
  VB: { name: "Vejle Boldklub", slug: "vejle-boldklub" },
  RFC: { name: "Randers FC", slug: "randers-fc" },
  VFF: { name: "Viborg FF", slug: "viborg-ff" },
  BIF: { name: "Brøndby IF", slug: "brondby-if" },
  LBK: { name: "Lyngby Boldklub", slug: "lyngby-boldklub" },
  FCK: { name: "FC København", slug: "fc-kobenhavn" },
  OB: { name: "OB", slug: "ob" },
  FCF: { name: "FC Fredericia", slug: "fc-fredericia" },
};

const TEAM_NAME_MAP: TeamNameMap = Object.fromEntries(
  Object.entries(TEAM_INFO).map(([abbr, info]) => [abbr, info.slug])
);

export function parseSeasonProgram(html: string, sourceUrl: string, seasonLabel: string): ScrapedMatch[] {
  const $ = cheerio.load(html);
  const matches: ScrapedMatch[] = [];
  const startYear = seasonStartYear(seasonLabel);
  let currentRound: number | null = null;

  $("tr").each((_, row) => {
    const $row = $(row);

    const roundHeader = $row.children("th[colspan='2']");
    if (roundHeader.length) {
      const m = roundHeader.text().trim().match(/Runde\s+(\d+)/);
      if (m) currentRound = parseInt(m[1], 10);
      return;
    }

    const cells = $row.children("td");
    if (cells.length < 5) return;

    const dayText = $(cells[0]).text().trim();
    if (!DAY_ABBR.includes(dayText)) return; // header/unrelated row

    const dateMatch = $(cells[1])
      .text()
      .trim()
      .match(/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
    if (!dateMatch) return;
    const [, dd, mm, hh, min] = dateMatch;
    const month = parseInt(mm, 10);
    const year = month <= 6 ? startYear + 1 : startYear;
    const kickoff = new Date(`${year}-${mm}-${dd}T${hh}:${min}:00`);

    const teamsText = $(cells[2]).text().trim(); // e.g. "AGF-FCM" or "FCM- VB"
    const teamParts = teamsText.split("-").map((s) => s.trim());
    if (teamParts.length !== 2) return;
    const [homeTeam, awayTeam] = teamParts;

    const link = $(cells[3]).find("a");
    const scoreMatch = link.text().trim().match(/(\d+)\s*-\s*(\d+)/);
    const matchId = link.attr("href")?.match(/\/kampe\/(\d+)/)?.[1];

    const attendanceDigits = $(cells[4]).text().trim().replace(/\./g, "");
    const attendance = /^\d+$/.test(attendanceDigits) ? parseInt(attendanceDigits, 10) : null;

    matches.push({
      homeTeam,
      awayTeam,
      kickoff,
      attendance,
      homeScore: scoreMatch ? parseInt(scoreMatch[1], 10) : null,
      awayScore: scoreMatch ? parseInt(scoreMatch[2], 10) : null,
      round: currentRound,
      sourceUrl: matchId ? `${BASE_URL}/kampe/${matchId}` : sourceUrl,
    });
  });

  return matches;
}

async function fetchSeasonProgram(seasonLabel: string): Promise<ScrapedMatch[]> {
  const url = seasonUrl(toAarParam(seasonLabel));
  const res = await fetch(url, {
    headers: { "User-Agent": "tilskuerstats-bot/0.1 (+https://github.com/casaolsen/tilskuerstats)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  const html = await res.text();
  return parseSeasonProgram(html, url, seasonLabel);
}

async function findOrCreateTeam(client: PrismaClient, slug: string, countryId: string) {
  const existing = await client.team.findUnique({ where: { slug } });
  if (existing) return existing;

  const info = Object.values(TEAM_INFO).find((t) => t.slug === slug);
  if (!info) throw new Error(`No TEAM_INFO entry for slug "${slug}" — this shouldn't happen.`);

  console.warn(`Team "${info.name}" (${slug}) didn't exist yet — creating it (no venue set, add one in /admin).`);
  return client.team.create({ data: { countryId, name: info.name, slug } });
}

async function upsertMatches(client: PrismaClient, matches: ScrapedMatch[], seasonLabel: string, reset: boolean) {
  const season = await client.season.findFirst({
    where: { label: seasonLabel, league: { slug: "superliga" } },
    include: { league: { include: { country: true } } },
  });
  if (!season) {
    throw new Error(
      `Season ${seasonLabel} not found for Superliga — create it in /admin (Sæsoner) before scraping it.`
    );
  }
  const countryId = season.league.country.id;
  let removed = 0;

  // The seeded demo data invents its own round numbers for a synthetic
  // round-robin, which won't line up with superstats.dk's real ones — so
  // matching on (round, homeTeamId, awayTeamId) below would leave the old
  // demo rows in place *alongside* newly-created real ones instead of
  // replacing them. --reset is the explicit, one-off fix: wipe this
  // season's matches first, then insert the real ones fresh. Never done
  // implicitly by the Cron route, only via a manual CLI run.
  if (reset) {
    const { count } = await client.match.deleteMany({ where: { seasonId: season.id } });
    removed = count;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const unresolved = new Set<string>();

  for (const m of matches) {
    const homeSlug = resolveSlug(TEAM_NAME_MAP, m.homeTeam);
    const awaySlug = resolveSlug(TEAM_NAME_MAP, m.awayTeam);
    if (!homeSlug || !awaySlug) {
      if (!homeSlug) unresolved.add(m.homeTeam);
      if (!awaySlug) unresolved.add(m.awayTeam);
      skipped++;
      continue;
    }

    const [homeTeam, awayTeam] = await Promise.all([
      findOrCreateTeam(client, homeSlug, countryId),
      findOrCreateTeam(client, awaySlug, countryId),
    ]);

    const existing = await client.match.findFirst({
      where: { seasonId: season.id, homeTeamId: homeTeam.id, awayTeamId: awayTeam.id, round: m.round },
    });

    const data = {
      attendance: m.attendance,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      kickoff: m.kickoff,
      source: m.sourceUrl,
      // A club's own ground unless/until we scrape per-match venues (neutral
      // venues, ground-sharing while a stadium is rebuilt, etc. aren't
      // handled yet — see the Norwegian/Swedish scrapers' notes on this).
      venueId: homeTeam.homeVenueId,
    };

    if (existing) {
      await client.match.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await client.match.create({
        data: { seasonId: season.id, homeTeamId: homeTeam.id, awayTeamId: awayTeam.id, round: m.round, ...data },
      });
      created++;
    }
  }

  return { removed, created, updated, skipped, unresolved: [...unresolved] };
}

function currentDkSeasonLabel(): string {
  const dkSeasons = LEAGUES.find((l) => l.leagueSlug === "superliga")!.seasons;
  return dkSeasons[dkSeasons.length - 1].label;
}

// Shared by the CLI (below) and the Vercel Cron route
// (src/app/api/cron/scrape-dk/route.ts) so the two can't drift apart.
export async function runDkScrape(options: { seasonLabel?: string; dryRun?: boolean; reset?: boolean } = {}) {
  const seasonLabel = options.seasonLabel ?? currentDkSeasonLabel();
  const matches = await fetchSeasonProgram(seasonLabel);

  if (options.dryRun) {
    return { seasonLabel, parsed: matches.length, matches, dryRun: true as const };
  }

  const result = await upsertMatches(prisma, matches, seasonLabel, options.reset ?? false);
  return { seasonLabel, parsed: matches.length, dryRun: false as const, ...result };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const reset = args.includes("--reset");
  const seasonArg = args.find((a) => a.startsWith("--season="));
  const seasonLabel = seasonArg?.split("=")[1];

  console.log(`Scraping Superliga ${seasonLabel ?? "(nyeste sæson)"} fra ${BASE_URL} ...`);
  const result = await runDkScrape({ seasonLabel, dryRun, reset });
  console.log(`Fandt ${result.parsed} kampe for sæson ${result.seasonLabel}.`);

  if (result.dryRun) {
    console.log(JSON.stringify(result.matches, null, 2));
    if (result.parsed === 0) {
      console.error("0 kampe parset — tjek at superstats.dk stadig bruger samme tabelstruktur.");
      process.exitCode = 1;
    }
    return;
  }

  console.log(
    (result.removed ? `Slettede ${result.removed} eksisterende kampe (--reset), ` : "") +
      `oprettet ${result.created}, opdateret ${result.updated}, sprunget over ${result.skipped}` +
      (result.unresolved.length ? ` (ukendte holdkoder: ${result.unresolved.join(", ")})` : "")
  );
  await prisma.$disconnect();
}

// Only auto-run when executed directly (`npm run scrape:dk-superliga`), not
// when imported by the Vercel Cron route — an import must never trigger a
// live scrape + DB write as a side effect.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
