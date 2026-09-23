// Kobler agenten til databasen: indlæser kampdata, starter en kørsel, gemmer
// udkast og markerer kampene som set. Bruges af både cron-ruten og knappen
// "Kør agenten nu" i /admin/insights.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_MODEL, runAgent } from "./agent";
import type { Dataset, MatchRow } from "./tools";

// Kun Superligaen har rigtige tal (SE/NO er stadig demo-data, se README) -
// agenten må ikke skrive insights om syntetiske tal.
export const INSIGHT_LEAGUE_SLUG = "superliga";

// Kun kampe fra de seneste dage regnes som "nye". Så får agenten ikke hele
// historikken i hovedet første gang, og gamle kampe, hvor tilskuertallet
// bliver rettet, udløser ikke nye insights.
export const NEW_MATCH_WINDOW_DAYS = 21;

const newSince = () => new Date(Date.now() - NEW_MATCH_WINDOW_DAYS * 24 * 3600 * 1000);

/** Antal kampe, der venter på agenten (vises i /admin/insights). */
export function countNewMatches() {
  return prisma.match.count({
    where: {
      attendance: { not: null },
      insightCheckedAt: null,
      kickoff: { gte: newSince() },
      season: { league: { slug: INSIGHT_LEAGUE_SLUG } },
    },
  });
}

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

async function loadDataset(): Promise<Dataset> {
  const league = await prisma.league.findUniqueOrThrow({ where: { slug: INSIGHT_LEAGUE_SLUG } });
  const rows = await prisma.match.findMany({
    where: { attendance: { not: null }, season: { leagueId: league.id } },
    include: {
      season: true,
      homeTeam: { include: { homeVenue: true } },
      awayTeam: true,
      venue: true,
    },
    orderBy: { kickoff: "asc" },
  });

  const since = newSince();
  const matches: MatchRow[] = rows.map((m) => ({
    id: m.id,
    season: m.season.label,
    round: m.round,
    kickoff: m.kickoff,
    home: m.homeTeam.name,
    homeSlug: m.homeTeam.slug,
    away: m.awayTeam.name,
    awaySlug: m.awayTeam.slug,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    attendance: m.attendance!,
    capacity: (m.venue ?? m.homeTeam.homeVenue)?.capacity ?? null,
    note: m.note,
  }));
  const newMatchIds = rows.filter((m) => !m.insightCheckedAt && m.kickoff >= since).map((m) => m.id);

  const recentDrafts = await prisma.insightDraft.findMany({ orderBy: { createdAt: "desc" }, take: 15 });
  return { league: league.name, matches, newMatchIds, recentDrafts };
}

export async function runInsights(options: { model?: string } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY er ikke sat som environment variable på denne deployment.");
  }
  const model = options.model ?? DEFAULT_MODEL;
  const dataset = await loadDataset();
  if (!dataset.newMatchIds.length) {
    // Intet nyt -> intet API-kald, ingen udgift.
    return { status: "nothing_new" as const, newMatches: 0, drafts: 0 };
  }

  const run = await prisma.insightRun.create({
    data: { model, status: "running", matchIds: dataset.newMatchIds },
  });

  try {
    const result = await runAgent({
      client: new Anthropic(),
      dataset,
      model,
      log: (line) => console.log(line),
      saveDraft: async (d) => {
        const draft = await prisma.insightDraft.create({
          data: {
            runId: run.id,
            kind: d.kind,
            headline: d.headline,
            body: d.body,
            matchIds: d.match_ids,
            evidence: json(d.evidence),
          },
        });
        return draft.id;
      },
    });

    await prisma.insightRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: result.status,
        summary: result.finalText,
        toolCalls: json(result.toolCalls),
        transcript: json(result.messages),
        usage: result.usage,
      },
    });
    // Kampene markeres kun som set, når agenten nåede ordentligt til ende.
    // Ellers kommer de med igen i næste kørsel.
    if (result.status === "done") {
      await prisma.match.updateMany({
        where: { id: { in: dataset.newMatchIds } },
        data: { insightCheckedAt: new Date() },
      });
    }
    return { status: result.status, newMatches: dataset.newMatchIds.length, drafts: result.draftIds.length, runId: run.id };
  } catch (e) {
    await prisma.insightRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status: "error", summary: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}
