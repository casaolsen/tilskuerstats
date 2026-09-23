// De værktøjer insight-agenten må bruge.
//
// Princip: værktøjerne regner, modellen vurderer og formulerer. Alle tal i et
// udkast skal kunne findes i et værktøjsresultat (se verify.ts), så de
// afledte tal (gennemsnit, rang, procentvis ændring) beregnes her og ikke af
// modellen.
//
// Værktøjerne er rene funktioner over et `Dataset` (alle kampe i ligaen
// indlæst én gang pr. kørsel), så de kan testes uden database.

import type Anthropic from "@anthropic-ai/sdk";

export type MatchRow = {
  id: string;
  season: string; // "2025/2026"
  round: number | null;
  kickoff: Date;
  home: string; // holdnavn
  homeSlug: string;
  away: string;
  awaySlug: string;
  homeScore: number | null;
  awayScore: number | null;
  attendance: number;
  capacity: number | null;
  note: string | null;
};

export type RecentDraft = {
  id: string;
  createdAt: Date;
  status: string;
  kind: string;
  headline: string;
  reviewNote: string | null;
};

export type Dataset = {
  league: string;
  matches: MatchRow[]; // kun kampe med tilskuertal, sorteret efter kickoff
  newMatchIds: string[];
  recentDrafts: RecentDraft[];
};

// ------------------------------------------------------------------ helpers

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const avg = (xs: number[]) => (xs.length ? Math.round(mean(xs)) : null);
const round1 = (x: number) => Math.round(x * 10) / 10;
const pct = (now: number | null, before: number | null) =>
  now != null && before ? round1(((now - before) / before) * 100) : null;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stdev(xs: number[]): number | null {
  if (xs.length < 3) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function previousSeason(season: string): string {
  const [a, b] = season.split("/").map(Number);
  return b ? `${a - 1}/${b - 1}` : String(a - 1);
}

const dkTime = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

/** Dansk tid som "19.07.2025 18.00", så modellen ikke skal omregne fra UTC. */
export const formatKickoff = (d: Date) => dkTime.format(d).replace(",", "");

function matchInfo(m: MatchRow) {
  return {
    match_id: m.id,
    season: m.season,
    round: m.round,
    kickoff: formatKickoff(m.kickoff),
    home: m.home,
    away: m.away,
    score: m.homeScore != null && m.awayScore != null ? `${m.homeScore}-${m.awayScore}` : null,
    attendance: m.attendance,
    stadium_capacity: m.capacity,
    pct_of_capacity: m.capacity ? round1((m.attendance / m.capacity) * 100) : null,
    // Admin-note om særlige forhold, fx en lukket tribune - vigtig kontekst!
    note: m.note,
  };
}

function findMatch(ds: Dataset, id: string): MatchRow {
  const m = ds.matches.find((x) => x.id === id);
  if (!m) throw new Error(`Ukendt match_id ${id}`);
  return m;
}

function findTeamSlug(ds: Dataset, team: string): string {
  const t = team.toLowerCase();
  const m = ds.matches.find((x) => x.homeSlug === t || x.home.toLowerCase() === t);
  if (!m) throw new Error(`Ukendt hold "${team}". Brug slug fra list_available_data.`);
  return m.homeSlug;
}

// -------------------------------------------------------------------- tools

export function listNewMatches(ds: Dataset) {
  const ids = new Set(ds.newMatchIds);
  const rows = ds.matches.filter((m) => ids.has(m.id));
  return { league: ds.league, count: rows.length, matches: rows.map(matchInfo) };
}

export function listAvailableData(ds: Dataset) {
  const seasons = new Map<string, MatchRow[]>();
  const teams = new Map<string, string>();
  for (const m of ds.matches) {
    seasons.set(m.season, [...(seasons.get(m.season) ?? []), m]);
    teams.set(m.homeSlug, m.home);
  }
  return {
    league: ds.league,
    seasons: [...seasons].map(([season, ms]) => ({
      season,
      matches: ms.length,
      last_round: Math.max(0, ...ms.map((m) => m.round ?? 0)),
      total_attendance: ms.reduce((a, m) => a + m.attendance, 0),
    })),
    teams: [...teams].map(([slug, name]) => ({ slug, name })),
  };
}

const SCOPES = {
  league_season: "alle ligakampe i samme sæson",
  league_all: "alle ligakampe i databasen (alle sæsoner)",
  home_team_season: "hjemmeholdets hjemmekampe i samme sæson",
  home_team_all: "hjemmeholdets hjemmekampe i alle sæsoner",
  fixture_history: "samme opgør (samme hjemme- og udehold) på tværs af sæsoner",
} as const;
type Scope = keyof typeof SCOPES;

/**
 * Placerer en kamps tilskuertal i en sammenligningsgruppe. Kun kampe spillet
 * til og med denne kamps kickoff tæller med, så "rekord" betyder rekord på
 * tidspunktet - og svaret ændrer sig ikke, hvis agenten kører igen senere.
 */
export function compareAttendance(ds: Dataset, input: { match_id: string; scope: string }) {
  const scope = input.scope as Scope;
  if (!(scope in SCOPES)) throw new Error(`scope skal være en af ${Object.keys(SCOPES).join(", ")}`);
  const m = findMatch(ds, input.match_id);
  const inScope: Record<Scope, (x: MatchRow) => boolean> = {
    league_season: (x) => x.season === m.season,
    league_all: () => true,
    home_team_season: (x) => x.homeSlug === m.homeSlug && x.season === m.season,
    home_team_all: (x) => x.homeSlug === m.homeSlug,
    fixture_history: (x) => x.homeSlug === m.homeSlug && x.awaySlug === m.awaySlug,
  };
  const group = ds.matches.filter((x) => inScope[scope](x) && x.kickoff <= m.kickoff);
  const values = group.map((x) => x.attendance);
  const earlier = group.filter((x) => x.id !== m.id);
  const byAtt = [...earlier].sort((a, b) => b.attendance - a.attendance);
  const prevHigh = byAtt[0];
  const prevLow = byAtt[byAtt.length - 1];
  const mu = mean(values);
  const sd = stdev(values);

  return {
    match: matchInfo(m),
    scope,
    comparison_group: SCOPES[scope],
    matches_in_group: values.length,
    rank_highest_first: 1 + values.filter((v) => v > m.attendance).length,
    mean_attendance: Math.round(mu),
    median_attendance: Math.round(median(values)),
    diff_vs_mean: Math.round(m.attendance - mu),
    pct_vs_mean: pct(m.attendance, mu),
    z_score: sd ? Math.round(((m.attendance - mu) / sd) * 100) / 100 : null,
    is_highest_so_far: !prevHigh || m.attendance > prevHigh.attendance,
    is_lowest_so_far: !prevLow || m.attendance < prevLow.attendance,
    previous_highest: prevHigh ? matchInfo(prevHigh) : null,
    previous_lowest: prevLow ? matchInfo(prevLow) : null,
    warning: values.length < 5 ? "Grupper med under 5 kampe siger meget lidt." : null,
  };
}

/** Et holds hjemmekampe i en sæson, udviklingen i de seneste kampe og
 *  sammenligning med samme antal hjemmekampe sidste sæson. */
export function teamAttendanceTrend(ds: Dataset, input: { team: string; season: string; window?: number }) {
  const slug = findTeamSlug(ds, input.team);
  const window = input.window ?? 3;
  const home = ds.matches.filter((m) => m.homeSlug === slug && m.season === input.season);
  if (!home.length) throw new Error(`Ingen hjemmekampe for ${input.team} i ${input.season}`);
  const values = home.map((m) => m.attendance);
  const n = values.length;
  const last = values.slice(-window);
  const before = values.slice(-2 * window, -window);
  const hasBefore = before.length === window;

  const prevLabel = previousSeason(input.season);
  const prev = ds.matches
    .filter((m) => m.homeSlug === slug && m.season === prevLabel)
    .slice(0, n)
    .map((m) => m.attendance);
  const samePoint = prev.length === n;

  return {
    team: home[0].home,
    season: input.season,
    home_matches: home.map((m) => ({
      match_id: m.id, kickoff: formatKickoff(m.kickoff), opponent: m.away, attendance: m.attendance, note: m.note,
    })),
    home_matches_played: n,
    season_avg: avg(values),
    window,
    avg_last_window: avg(last),
    avg_previous_window: hasBefore ? avg(before) : null,
    pct_change_last_vs_previous_window: hasBefore ? pct(avg(last), avg(before)) : null,
    previous_season: prevLabel,
    previous_season_avg_same_point: samePoint ? avg(prev) : null,
    pct_vs_previous_season_same_point: samePoint ? pct(avg(values), avg(prev)) : null,
    warning: samePoint ? null : `Ingen sammenlignelige data for ${prevLabel} (fx op-/nedrykning).`,
  };
}

/** Ligaen til og med en runde, sammenlignet med sidste sæson til og med samme runde. */
export function seasonOverview(ds: Dataset, input: { season: string; up_to_round?: number }) {
  const inSeason = (s: string) => ds.matches.filter((m) => m.season === s && m.round != null);
  const cur = inSeason(input.season);
  if (!cur.length) throw new Error(`Ingen kampe med runde i ${input.season}`);
  const upTo = input.up_to_round ?? Math.max(...cur.map((m) => m.round!));

  const summary = (rows: MatchRow[]) => {
    const r = rows.filter((m) => m.round! <= upTo);
    if (!r.length) return null;
    const byTeam = new Map<string, number[]>();
    for (const m of r) byTeam.set(m.home, [...(byTeam.get(m.home) ?? []), m.attendance]);
    return {
      matches: r.length,
      total_attendance: r.reduce((a, m) => a + m.attendance, 0),
      avg_attendance: avg(r.map((m) => m.attendance)),
      home_avg_by_team: Object.fromEntries(
        [...byTeam].map(([t, v]) => [t, avg(v)!] as const).sort((a, b) => b[1] - a[1])
      ),
    };
  };

  const current = summary(cur)!;
  const prevLabel = previousSeason(input.season);
  const previous = summary(inSeason(prevLabel));
  return {
    season: input.season,
    up_to_round: upTo,
    current,
    previous_season: prevLabel,
    previous_same_rounds: previous,
    pct_change_avg_attendance: previous ? pct(current.avg_attendance, previous.avg_attendance) : null,
    pct_change_total_attendance: previous ? pct(current.total_attendance, previous.total_attendance) : null,
  };
}

export function roundSummary(ds: Dataset, input: { season: string; round_number: number }) {
  const season = ds.matches.filter((m) => m.season === input.season && m.round != null);
  const rows = season.filter((m) => m.round === input.round_number).sort((a, b) => b.attendance - a.attendance);
  if (!rows.length) throw new Error(`Ingen kampe i runde ${input.round_number} af ${input.season}`);
  const byRound = new Map<number, number[]>();
  for (const m of season) byRound.set(m.round!, [...(byRound.get(m.round!) ?? []), m.attendance]);
  const thisAvg = mean(rows.map((m) => m.attendance));
  return {
    season: input.season,
    round: input.round_number,
    matches: rows.map(matchInfo),
    total_attendance: rows.reduce((a, m) => a + m.attendance, 0),
    avg_attendance: Math.round(thisAvg),
    rounds_played_in_season: byRound.size,
    rank_of_round_by_avg: 1 + [...byRound.values()].filter((v) => mean(v) > thisAvg).length,
  };
}

export function listRecentDrafts(ds: Dataset) {
  return {
    drafts: ds.recentDrafts.map((d) => ({
      created: formatKickoff(d.createdAt), status: d.status, kind: d.kind,
      headline: d.headline, review_note: d.reviewNote,
    })),
  };
}

// ------------------------------------------------------------------ schemas
// Beskrivelserne er modellens eneste dokumentation af værktøjerne - de er en
// del af prompten og værd at skrive omhyggeligt.

const noInput = { type: "object" as const, properties: {}, additionalProperties: false };

export const TOOL_SCHEMAS: Anthropic.Beta.BetaTool[] = [
  {
    name: "list_new_matches",
    description: "De kampe, der er kommet til siden sidste analyse. Start her.",
    input_schema: noInput,
  },
  {
    name: "list_available_data",
    description: "Sæsoner i databasen (antal kampe, seneste runde, samlet tilskuertal) og holdenes slug + navn.",
    input_schema: noInput,
  },
  {
    name: "compare_attendance",
    description:
      "Placerer én kamps tilskuertal i en sammenligningsgruppe: rang, gennemsnit, median, procentvis " +
      "afvigelse, z-score, udnyttelse af stadionkapacitet, og om det er det højeste/laveste hidtil (med den " +
      "tidligere rekord). Kun kampe til og med kampens kickoff tæller. Brug flere scopes for at se, om noget " +
      "er usædvanligt for ligaen, for holdet eller for netop dette opgør.",
    input_schema: {
      type: "object",
      properties: {
        match_id: { type: "string" },
        scope: { type: "string", enum: Object.keys(SCOPES) },
      },
      required: ["match_id", "scope"],
      additionalProperties: false,
    },
  },
  {
    name: "team_attendance_trend",
    description:
      "Et holds hjemmekampe i en sæson med gennemsnit, udvikling i de seneste `window` kampe mod de " +
      "`window` før, og sammenligning med samme antal hjemmekampe sidste sæson.",
    input_schema: {
      type: "object",
      properties: {
        team: { type: "string", description: "Holdets slug, fx 'fc-kobenhavn'" },
        season: { type: "string", description: "Fx '2026/2027'" },
        window: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["team", "season"],
      additionalProperties: false,
    },
  },
  {
    name: "season_overview",
    description:
      "Ligaens samlede og gennemsnitlige tilskuertal til og med en runde, pr. hold, og sammenlignet med " +
      "sidste sæson til og med samme runde.",
    input_schema: {
      type: "object",
      properties: {
        season: { type: "string" },
        up_to_round: { type: "integer", description: "Udelad for seneste spillede runde" },
      },
      required: ["season"],
      additionalProperties: false,
    },
  },
  {
    name: "round_summary",
    description: "Alle kampe i én runde med samlet og gennemsnitligt tilskuertal, og rundens placering blandt sæsonens runder.",
    input_schema: {
      type: "object",
      properties: { season: { type: "string" }, round_number: { type: "integer" } },
      required: ["season", "round_number"],
      additionalProperties: false,
    },
  },
  {
    name: "list_recent_drafts",
    description:
      "De seneste insight-udkast med status og redaktørens note. Tjek dem, så du ikke gentager et insight, " +
      "og lær af begrundelserne for afviste udkast.",
    input_schema: noInput,
  },
  {
    name: "submit_draft",
    description:
      "Gem et insight-udkast til godkendelse. Hvert tal i headline og body skal stå i et af dine " +
      "værktøjsresultater, ellers afvises udkastet med en fejl, du kan rette. evidence skal pege på " +
      "\"ref\"-feltet (fx \"R3\") i de værktøjssvar, tallene kommer fra.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["record", "outlier", "trend", "milestone", "other"] },
        headline: { type: "string", description: "Kort overskrift, max ca. 80 tegn" },
        body: { type: "string", description: "1-3 sætninger på dansk" },
        match_ids: { type: "array", items: { type: "string" } },
        evidence: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              claim: { type: "string", description: "Påstanden, beviset understøtter" },
              ref: { type: "string", description: "\"ref\"-feltet fra værktøjssvaret, fx \"R3\"" },
            },
            required: ["claim", "ref"],
            additionalProperties: false,
          },
        },
      },
      required: ["kind", "headline", "body", "match_ids", "evidence"],
      additionalProperties: false,
    },
  },
];

// submit_draft håndteres i agent-loopet, fordi det skal kende kørslens
// tidligere værktøjsresultater. Resten er rene dataværktøjer.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DATA_TOOLS: Record<string, (ds: Dataset, input: any) => unknown> = {
  list_new_matches: listNewMatches,
  list_available_data: listAvailableData,
  compare_attendance: compareAttendance,
  team_attendance_trend: teamAttendanceTrend,
  season_overview: seasonOverview,
  round_summary: roundSummary,
  list_recent_drafts: listRecentDrafts,
};
