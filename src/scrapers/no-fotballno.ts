/**
 * Scraper for Norwegian Eliteserien attendance data from fotball.no — the
 * Norwegian FA's (NFF) official FIKS match database.
 *
 * Verified against the live site. Two things make this different from the
 * Danish scraper (src/scrapers/dk-superstats.ts):
 *
 * 1. fotball.no doesn't have a predictable per-season URL — each season of
 *    each competition has its own internal "fiksId", found by searching
 *    fotball.no for "Eliteserien <year>". See SEASON_FIKS_IDS below; add a
 *    new entry there (and to prisma/seed-data.ts's NO seasons) each year.
 * 2. The season's match list page has round/date/teams/score but NOT
 *    attendance — that requires a separate fetch per match
 *    (/fotballdata/kamp/?fiksId=<id>, "Tilskuere: <n>"). Fetching all ~240
 *    matches' attendance in one Vercel Cron invocation risks the function
 *    timeout, so runNoScrape() only fetches attendance for matches that
 *    don't have it yet (new matches, or old ones fotball.no never filled
 *    in), capped per run (see attendanceFetchLimit) — the weekly cron only
 *    ever has a handful of new matches to fill in, but the one-off backfill
 *    of a full season may need a few repeated calls (the response reports
 *    `remainingWithoutAttendance` so you know whether to call it again).
 */
import "dotenv/config";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { resolveSlug, type ScrapedMatch, type TeamNameMap } from "./types";

const BASE_URL = "https://www.fotball.no";

// fotball.no's internal per-season id for Eliteserien (men). Not derivable
// from the year — found by searching "fotball.no Eliteserien <year>".
const SEASON_FIKS_IDS: Record<string, string> = {
  "2024": "192924",
  "2025": "199603",
  "2026": "206092",
};

// Canonical club identity for every team name fotball.no has rendered in the
// "Hjemmelag"/"Bortelag" columns across 2024-2026, including clubs promoted
// in after prisma/seed-data.ts's NO team list was last touched (Aalesund,
// Fredrikstad, Start for 2026 — Fredrikstad in particular has been in the
// league since at least 2024, seed-data.ts just never listed it). Keyed by
// fotball.no's exact rendered name, which is usually shorter than our
// canonical Team.name (e.g. "Brann" here vs. "SK Brann" in seed-data).
const TEAM_INFO: Record<string, { name: string; slug: string }> = {
  Rosenborg: { name: "Rosenborg BK", slug: "rosenborg-bk" },
  Brann: { name: "SK Brann", slug: "sk-brann" },
  Molde: { name: "Molde FK", slug: "molde-fk" },
  Vålerenga: { name: "Vålerenga Fotball", slug: "valerenga" },
  "Bodø/Glimt": { name: "FK Bodø/Glimt", slug: "bodo-glimt" },
  Viking: { name: "Viking FK", slug: "viking-fk" },
  Lillestrøm: { name: "Lillestrøm SK", slug: "lillestrom-sk" },
  Strømsgodset: { name: "Strømsgodset IF", slug: "stromsgodset" },
  Odd: { name: "Odds BK", slug: "odds-bk" },
  "Sarpsborg 08": { name: "Sarpsborg 08 FF", slug: "sarpsborg-08" },
  Tromsø: { name: "Tromsø IL", slug: "tromso-il" },
  Haugesund: { name: "FK Haugesund", slug: "fk-haugesund" },
  HamKam: { name: "Hamarkameratene", slug: "hamkam" },
  KFUM: { name: "KFUM Oslo", slug: "kfum-oslo" },
  Bryne: { name: "Bryne FK", slug: "bryne-fk" },
  Kristiansund: { name: "Kristiansund BK", slug: "kristiansund-bk" },
  "Sandefjord Fotball": { name: "Sandefjord Fotball", slug: "sandefjord-fotball" },
  Aalesund: { name: "Aalesund FK", slug: "aalesund-fk" },
  Fredrikstad: { name: "Fredrikstad FK", slug: "fredrikstad-fk" },
  Start: { name: "IK Start", slug: "ik-start" },
};

const TEAM_NAME_MAP: TeamNameMap = Object.fromEntries(
  Object.entries(TEAM_INFO).map(([name, info]) => [name, info.slug])
);

type NoMatch = ScrapedMatch & { matchId: string };

export function parseSeasonProgram(html: string): NoMatch[] {
  const $ = cheerio.load(html);
  const matches: NoMatch[] = [];

  // The match list is the table whose header row spells out "Runde" (as
  // opposed to the many small stats tables also on this page).
  const table = $("table").filter((_, t) => $(t).find("th").text().includes("Runde")).first();

  table.find("tr").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.length < 9) return; // header row or unrelated

    const roundText = $(cells[0]).text().trim();
    if (!/^\d+$/.test(roundText)) return;

    const dateLink = $(cells[1]).find("a");
    const dateMatch = dateLink.text().trim().match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!dateMatch) return;
    const [, dd, mm, yyyy] = dateMatch;

    const matchId = (dateLink.attr("href") ?? "").match(/fiksId=(\d+)/)?.[1];
    if (!matchId) return;

    const timeMatch = $(cells[3]).text().trim().match(/^(\d{2}):(\d{2})$/);
    const [hh, min] = timeMatch ? [timeMatch[1], timeMatch[2]] : ["12", "00"];
    const kickoff = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:00`);

    const homeTeam = $(cells[4]).text().trim();
    const awayTeam = $(cells[6]).text().trim();
    const scoreMatch = $(cells[5])
      .text()
      .trim()
      .match(/(\d+)\s*-\s*(\d+)/); // "-" alone (no digits) for a match not yet played

    matches.push({
      homeTeam,
      awayTeam,
      kickoff,
      attendance: null, // filled in separately, see fetchAttendance
      homeScore: scoreMatch ? parseInt(scoreMatch[1], 10) : null,
      awayScore: scoreMatch ? parseInt(scoreMatch[2], 10) : null,
      round: parseInt(roundText, 10),
      sourceUrl: `${BASE_URL}/fotballdata/kamp/?fiksId=${matchId}`,
      matchId,
    });
  });

  return matches;
}

const FETCH_HEADERS = { "User-Agent": "tilskuerstats-bot/0.1 (+https://github.com/casaolsen/tilskuerstats)" };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchAttendance(matchId: string): Promise<number | null> {
  const res = await fetch(`${BASE_URL}/fotballdata/kamp/?fiksId=${matchId}`, { headers: FETCH_HEADERS });
  if (!res.ok) return null;
  const html = await res.text();
  const match = html.match(/Tilskuere:\s*<\/span>\s*([^<]+)/);
  if (!match) return null;
  // The thousands separator is a non-breaking space, encoded as "&#xA0;" in
  // the raw HTML — strip whole HTML entities first (an entity like "&#xA0;"
  // contains digit characters itself, e.g. the "0" in "xA0", so a naive
  // \D-only strip corrupts the number: "3&#xA0;802" -> "30802", not "3802").
  const digits = match[1].replace(/&#x?[0-9a-fA-F]+;/gi, "").replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : null;
}

async function fetchSeasonProgram(fiksId: string): Promise<NoMatch[]> {
  const url = `${BASE_URL}/fotballdata/turnering/hjem/?fiksId=${fiksId}&underside=kamper`;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return parseSeasonProgram(await res.text());
}

async function findOrCreateTeam(client: PrismaClient, slug: string, countryId: string) {
  const existing = await client.team.findUnique({ where: { slug } });
  if (existing) return existing;

  const info = Object.values(TEAM_INFO).find((t) => t.slug === slug);
  if (!info) throw new Error(`No TEAM_INFO entry for slug "${slug}" — this shouldn't happen.`);

  console.warn(`Team "${info.name}" (${slug}) didn't exist yet — creating it (no venue set, add one in /admin).`);
  return client.team.create({ data: { countryId, name: info.name, slug } });
}

async function upsertMatches(
  client: PrismaClient,
  matches: NoMatch[],
  seasonLabel: string,
  reset: boolean,
  attendanceFetchLimit: number
) {
  const season = await client.season.findFirst({
    where: { label: seasonLabel, league: { slug: "eliteserien" } },
    include: { league: { include: { country: true } } },
  });
  if (!season) {
    throw new Error(
      `Season ${seasonLabel} not found for Eliteserien — create it in /admin (Sæsoner) before scraping it.`
    );
  }
  const countryId = season.league.country.id;
  let removed = 0;

  // Same reasoning as the DK scraper's --reset: the seeded demo data's
  // synthetic round numbers won't line up with fotball.no's real ones, so a
  // plain upsert would leave old demo rows next to new real ones. Never done
  // implicitly by the Cron route.
  if (reset) {
    const { count } = await client.match.deleteMany({ where: { seasonId: season.id } });
    removed = count;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let attendanceFetches = 0;
  let remainingWithoutAttendance = 0;
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

    let attendance = existing?.attendance ?? null;
    if (attendance === null) {
      if (attendanceFetches < attendanceFetchLimit) {
        attendance = await fetchAttendance(m.matchId);
        attendanceFetches++;
        await sleep(200);
      } else {
        remainingWithoutAttendance++;
      }
    }

    const data = {
      attendance,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      kickoff: m.kickoff,
      source: m.sourceUrl,
      // A club's own ground, same tradeoff as the DK scraper — fotball.no
      // does report a per-match venue directly ("Bane" column) which would
      // be more accurate (catches neutral venues, ground-sharing), but
      // isn't wired up yet.
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

  return { removed, created, updated, skipped, remainingWithoutAttendance, unresolved: [...unresolved] };
}

function currentNoSeasonLabel(): string {
  const years = Object.keys(SEASON_FIKS_IDS)
    .map(Number)
    .sort((a, b) => a - b);
  return String(years[years.length - 1]);
}

// Shared by the CLI (below) and the Vercel Cron route
// (src/app/api/cron/scrape-no/route.ts) so the two can't drift apart.
export async function runNoScrape(
  options: { seasonLabel?: string; dryRun?: boolean; reset?: boolean; attendanceFetchLimit?: number } = {}
) {
  const seasonLabel = options.seasonLabel ?? currentNoSeasonLabel();
  const fiksId = SEASON_FIKS_IDS[seasonLabel];
  if (!fiksId) {
    throw new Error(`Ukendt sæson: "${seasonLabel}". Kendte sæsoner: ${Object.keys(SEASON_FIKS_IDS).join(", ")}.`);
  }
  const matches = await fetchSeasonProgram(fiksId);

  if (options.dryRun) {
    return { seasonLabel, parsed: matches.length, matches, dryRun: true as const };
  }

  const result = await upsertMatches(
    prisma,
    matches,
    seasonLabel,
    options.reset ?? false,
    options.attendanceFetchLimit ?? Infinity
  );
  return { seasonLabel, parsed: matches.length, dryRun: false as const, ...result };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const reset = args.includes("--reset");
  const seasonArg = args.find((a) => a.startsWith("--season="));
  const seasonLabel = seasonArg?.split("=")[1];

  console.log(`Scraping Eliteserien ${seasonLabel ?? "(nyeste sæson)"} fra ${BASE_URL} ...`);
  const result = await runNoScrape({ seasonLabel, dryRun, reset });
  console.log(`Fandt ${result.parsed} kampe for sæson ${result.seasonLabel}.`);

  if (result.dryRun) {
    console.log(JSON.stringify(result.matches, null, 2));
    if (result.parsed === 0) {
      console.error("0 kampe parset — tjek at fotball.no stadig bruger samme tabelstruktur.");
      process.exitCode = 1;
    }
    return;
  }

  console.log(
    (result.removed ? `Slettede ${result.removed} eksisterende kampe (--reset), ` : "") +
      `oprettet ${result.created}, opdateret ${result.updated}, sprunget over ${result.skipped}` +
      (result.unresolved.length ? ` (ukendte holdnavne: ${result.unresolved.join(", ")})` : "")
  );
  await prisma.$disconnect();
}

// Only auto-run when executed directly (`npm run scrape:no-eliteserien`), not
// when imported by the Vercel Cron route — an import must never trigger a
// live scrape + DB write as a side effect.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
