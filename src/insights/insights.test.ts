// Kør med: npm run test:insights
// Tester værktøjer, taltjek og agent-loopet med en falsk Claude-klient, der
// afspiller et fast manuskript - uden database, API-nøgle eller udgifter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runAgent, type AgentDeps } from "./agent";
import { compareAttendance, seasonOverview, teamAttendanceTrend, type Dataset, type MatchRow } from "./tools";
import { parseDanishNumber, ungroundedNumbers } from "./verify";

const TEAMS: Record<string, string> = { fck: "FC København", agf: "AGF", bif: "Brøndby IF" };
function m(id: string, season: string, round: number, kickoff: string, home: string, away: string, attendance: number): MatchRow {
  return {
    id, season, round, kickoff: new Date(kickoff), home: TEAMS[home], homeSlug: home, away: TEAMS[away], awaySlug: away,
    homeScore: 1, awayScore: 0, attendance, capacity: home === "agf" ? 20000 : null, note: null,
  };
}

function dataset(): Dataset {
  return {
    league: "Superliga",
    matches: [
      m("h1", "2024/2025", 1, "2024-07-20T16:00:00Z", "fck", "agf", 25000),
      m("h2", "2024/2025", 1, "2024-07-21T12:00:00Z", "agf", "bif", 11000),
      m("h3", "2024/2025", 2, "2024-07-27T16:00:00Z", "bif", "fck", 21000),
      m("h4", "2024/2025", 2, "2024-07-28T12:00:00Z", "agf", "fck", 12000),
      m("n1", "2025/2026", 1, "2025-07-19T16:00:00Z", "fck", "agf", 26000),
      m("n2", "2025/2026", 1, "2025-07-20T12:00:00Z", "agf", "bif", 19500),
      m("n3", "2025/2026", 2, "2025-07-26T16:00:00Z", "bif", "fck", 20000),
    ],
    newMatchIds: ["n1", "n2", "n3"],
    recentDrafts: [],
  };
}

// ------------------------------------------------------------------ verify

test("danske tal parses korrekt", () => {
  assert.deepEqual(parseDanishNumber("12.456"), { value: 12456, decimals: 0 });
  assert.deepEqual(parseDanishNumber("23,4"), { value: 23.4, decimals: 1 });
  assert.deepEqual(parseDanishNumber("1.234,5"), { value: 1234.5, decimals: 1 });
});

test("tal fra værktøjerne godkendes, også afrundet", () => {
  const result = { match: { kickoff: "20.07.2025 14.00", score: "2-1", attendance: 19500 }, pct_vs_mean: -23.4 };
  assert.deepEqual(ungroundedNumbers("AGF-Brøndby (2-1) havde 19.500 tilskuere, 23,4 % under snittet, den 20/7 2025.", [result]), []);
  assert.deepEqual(ungroundedNumbers("hele 23 % færre", [result]), []);
});

test("tal i noter og datoer kan bruges i begge skrivemåder", () => {
  const result = { kickoff: "20.07.2025 14.00", note: "1.200 pladser lukket" };
  assert.deepEqual(ungroundedNumbers("Den 20. juli (20/7) var 1.200 pladser lukket", [result]), []);
});

test("opfundne tal fanges, og cifre i id'er tæller ikke", () => {
  const result = { match_id: "cm20000x30", attendance: 19500 };
  assert.deepEqual(ungroundedNumbers("Hele 20.000 kom, 30 % flere", [result]), ["20.000", "30"]);
});

// ------------------------------------------------------------------- tools

test("compare_attendance finder holdrekord og tidligere rekord", () => {
  const r = compareAttendance(dataset(), { match_id: "n2", scope: "home_team_all" });
  assert.equal(r.matches_in_group, 3);
  assert.equal(r.rank_highest_first, 1);
  assert.equal(r.is_highest_so_far, true);
  assert.equal(r.previous_highest?.attendance, 12000);
  assert.equal(r.match.pct_of_capacity, 97.5);
  assert.ok(r.warning);
});

test("compare_attendance ser kun på kampe til og med kickoff", () => {
  const r = compareAttendance(dataset(), { match_id: "h1", scope: "league_all" });
  assert.equal(r.matches_in_group, 1);
  assert.equal(r.previous_highest, null);
});

test("compare_attendance afviser ukendt scope", () => {
  assert.throws(() => compareAttendance(dataset(), { match_id: "n2", scope: "galaxy" }));
});

test("team_attendance_trend sammenligner med samme tidspunkt sidste sæson", () => {
  const r = teamAttendanceTrend(dataset(), { team: "agf", season: "2025/2026" });
  assert.equal(r.home_matches_played, 1);
  assert.equal(r.previous_season_avg_same_point, 11000);
  assert.equal(r.pct_vs_previous_season_same_point, 77.3);
});

test("season_overview sammenligner samme antal runder", () => {
  const r = seasonOverview(dataset(), { season: "2025/2026" });
  assert.equal(r.up_to_round, 2);
  assert.equal(r.current.total_attendance, 65500);
  assert.equal(r.previous_same_rounds?.total_attendance, 69000);
  assert.equal(r.pct_change_total_attendance, -5.1);
});

// ------------------------------------------------------------------- agent

type Block = { type: "tool_use"; id: string; name: string; input: unknown } | { type: "text"; text: string };
const toolUse = (id: string, name: string, input: unknown): Block => ({ type: "tool_use", id, name, input });
const reply = (stop_reason: string, ...content: Block[]) => ({
  stop_reason, content, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
});

function fakeClient(script: ReturnType<typeof reply>[]) {
  const requests: unknown[][] = [];
  const client = {
    beta: {
      messages: {
        create: async (params: { messages: unknown[] }) => {
          requests.push(JSON.parse(JSON.stringify(params.messages)));
          const next = script.shift();
          if (!next) throw new Error("Manuskriptet er slut");
          return next;
        },
      },
    },
  } as unknown as AgentDeps["client"];
  return { client, requests };
}

const draft = (headline: string, toolUseId = "t2") => ({
  kind: "record", headline, body: "AGF havde aldrig haft flere tilskuere til en hjemmekamp i databasen.",
  match_ids: ["n2"], evidence: [{ claim: "Rang 1 af 3 hjemmekampe", tool_use_id: toolUseId }],
});

test("agenten undersøger, indsender et udkast og afslutter", async () => {
  const saved: unknown[] = [];
  const { client } = fakeClient([
    reply("tool_use", toolUse("t1", "list_new_matches", {})),
    reply("tool_use", toolUse("t2", "compare_attendance", { match_id: "n2", scope: "home_team_all" })),
    reply("tool_use", toolUse("t3", "submit_draft", draft("Ny AGF-rekord: 19.500 tilskuere"))),
    reply("end_turn", { type: "text", text: "Ét udkast indsendt." }),
  ]);
  const r = await runAgent({ client, dataset: dataset(), saveDraft: async (d) => (saved.push(d), `d${saved.length}`) });

  assert.equal(r.status, "done");
  assert.deepEqual(r.draftIds, ["d1"]);
  assert.equal(r.finalText, "Ét udkast indsendt.");
  assert.equal((saved[0] as { evidence: { tool: string }[] }).evidence[0].tool, "compare_attendance");
});

test("et opfundet tal afvises, og modellen kan rette det", async () => {
  const saved: unknown[] = [];
  const { client, requests } = fakeClient([
    reply("tool_use", toolUse("t2", "compare_attendance", { match_id: "n2", scope: "home_team_all" })),
    reply("tool_use", toolUse("t3", "submit_draft", draft("Ny AGF-rekord: 21.500 tilskuere"))),
    reply("tool_use", toolUse("t4", "submit_draft", draft("Ny AGF-rekord: 19.500 tilskuere"))),
    reply("end_turn", { type: "text", text: "Rettet." }),
  ]);
  const r = await runAgent({ client, dataset: dataset(), saveDraft: async (d) => (saved.push(d), "d1") });

  // Fejlen blev sendt tilbage som tool_result med is_error
  const lastMsg = requests[2].at(-1) as { content: { tool_use_id: string; is_error: boolean; content: string }[] };
  assert.equal(lastMsg.content[0].tool_use_id, "t3");
  assert.equal(lastMsg.content[0].is_error, true);
  assert.match(lastMsg.content[0].content, /21\.500/);
  assert.equal(saved.length, 1);
  assert.equal(r.status, "done");
});

test("evidence skal pege på et rigtigt værktøjskald", async () => {
  const { client } = fakeClient([
    reply("tool_use", toolUse("t3", "submit_draft", draft("Rekord", "findes-ikke"))),
    reply("end_turn", { type: "text", text: "Ok." }),
  ]);
  const r = await runAgent({ client, dataset: dataset(), saveDraft: async () => "x" });
  assert.equal(r.draftIds.length, 0);
  assert.ok(r.toolCalls[0].isError);
});

test("agenten stopper ved max_turns", async () => {
  const { client } = fakeClient([1, 2, 3].map((i) => reply("tool_use", toolUse(`t${i}`, "list_new_matches", {}))));
  const r = await runAgent({ client, dataset: dataset(), saveDraft: async () => "x", maxTurns: 3 });
  assert.equal(r.status, "max_turns");
});
