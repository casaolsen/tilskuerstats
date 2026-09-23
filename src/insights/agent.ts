// Insight-agenten: et håndskrevet tool-use-loop mod Claude API.
//
// Loopet er skrevet i hånden (i stedet for SDK'ens tool runner), så hvert
// trin er synligt:
//   1. Send beskeder + værktøjsdefinitioner til Claude.
//   2. stop_reason "tool_use" -> kør værktøjerne, send resultaterne tilbage.
//   3. stop_reason "end_turn" -> agenten er færdig.
//
// Agenten kan kun skrive via submit_draft, og udkast gemmes som "pending",
// indtil du godkender dem under /admin/insights.

import type Anthropic from "@anthropic-ai/sdk";
import { DATA_TOOLS, TOOL_SCHEMAS, type Dataset } from "./tools";
import { ungroundedNumbers } from "./verify";

export const DEFAULT_MODEL = process.env.INSIGHTS_MODEL ?? "claude-opus-5";
export const MAX_TURNS = 25;
export const MAX_DRAFTS_PER_RUN = 5;

export const SYSTEM_PROMPT = `Du er dataredaktør på et dansk site om tilskuertal i fodbold. Din opgave er at gennemgå nye kampe og finde de få ting, der faktisk er værd at fortælle: usædvanligt høje eller lave tilskuertal, rekorder (sæson, klub, opgør), udsolgte stadions og markante skift i udviklingen for et hold eller for ligaen.

Sådan arbejder du:
- Start med list_new_matches. Tjek list_recent_drafts, så du ikke gentager et insight, og tag hensyn til redaktørens noter på afviste udkast.
- Undersøg med værktøjerne, før du konkluderer. Et tal er kun interessant i forhold til noget: sammenlign med ligaen, med holdets egne hjemmekampe og med samme opgør tidligere. Tag højde for små sammenligningsgrupper (fx tidligt i sæsonen eller et nyoprykket hold).
- Læs kampenes note-felt: det forklarer ofte et afvigende tal (fx en lukket tribune) og skal nævnes, hvis det er relevant.
- Du må ikke regne selv eller skrive tal, der ikke står i et værktøjsresultat. Afrunding er i orden (23,4 % -> 23 %), men brug hele tilskuertal som i data. Skriv tal på dansk (12.456 tilskuere, 23,4 %).
- Kvalitet over kvantitet: 0-3 udkast pr. kørsel er normalt. Hvis intet er bemærkelsesværdigt, så indsend ingenting og sig det.
- Udkast skrives på dansk: en præcis overskrift og 1-3 sætninger brødtekst.

Når du er færdig, afslut med et kort resumé af hvad du undersøgte, og hvorfor du indsendte (eller ikke indsendte) udkast.`;

export type DraftInput = {
  kind: string;
  headline: string;
  body: string;
  match_ids: string[];
  evidence: { claim: string; tool_use_id: string }[];
};

export type Evidence = { claim: string; tool_use_id: string; tool: string; input: unknown; result: unknown };

export type AgentDeps = {
  // Kun den del af SDK-klienten, vi bruger - gør det nemt at teste med en falsk klient.
  client: { beta: { messages: { create: (params: Anthropic.Beta.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.BetaMessage> } } };
  dataset: Dataset;
  saveDraft: (draft: DraftInput & { evidence: Evidence[] }) => Promise<string>;
  model?: string;
  maxTurns?: number;
  log?: (line: string) => void;
};

export type AgentResult = {
  status: "done" | "max_turns" | "refusal" | "error";
  draftIds: string[];
  finalText: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  toolCalls: { turn: number; name: string; input: unknown; isError: boolean; output: string }[];
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number };
};

export async function runAgent(deps: AgentDeps): Promise<AgentResult> {
  const { client, dataset, saveDraft } = deps;
  const model = deps.model ?? DEFAULT_MODEL;
  const maxTurns = deps.maxTurns ?? MAX_TURNS;
  const log = deps.log ?? (() => {});

  // tool_use_id -> hvad værktøjet blev kaldt med og svarede. Bruges til at verificere udkast.
  const toolLog = new Map<string, { tool: string; input: unknown; result: unknown }>();
  const result: AgentResult = {
    status: "max_turns",
    draftIds: [],
    finalText: "",
    messages: [
      {
        role: "user",
        content: `Der er ${dataset.newMatchIds.length} nye kampe i ${dataset.league}. Analyser dem og indsend udkast til insights, hvis der er noget bemærkelsesværdigt.`,
      },
    ],
    toolCalls: [],
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  };

  async function submitDraft(input: DraftInput): Promise<string> {
    if (result.draftIds.length >= MAX_DRAFTS_PER_RUN) {
      throw new Error(`Max ${MAX_DRAFTS_PER_RUN} udkast pr. kørsel. Vælg de vigtigste.`);
    }
    const unknown = input.evidence.filter((e) => !toolLog.has(e.tool_use_id)).map((e) => e.tool_use_id);
    if (unknown.length) throw new Error(`evidence peger på ukendte tool_use-id'er: ${unknown.join(", ")}`);

    const allResults = [...toolLog.values()].map((t) => t.result);
    const bad = ungroundedNumbers(`${input.headline}\n${input.body}`, allResults);
    if (bad.length) {
      throw new Error(
        `Disse tal findes ikke i nogen værktøjsresultater: ${bad.join(", ")}. ` +
          "Brug kun tal fra værktøjerne (afrunding er ok), eller hent de manglende tal først."
      );
    }
    for (const e of input.evidence) {
      const badClaim = ungroundedNumbers(e.claim, [toolLog.get(e.tool_use_id)!.result]);
      if (badClaim.length) {
        throw new Error(`Påstanden "${e.claim}" har tal (${badClaim.join(", ")}), som ikke står i ${e.tool_use_id}.`);
      }
    }
    // Beviserne gemmes sammen med udkastet, så du kan se præcis hvad agenten så.
    const evidence = input.evidence.map((e) => ({ ...e, ...toolLog.get(e.tool_use_id)! }));
    const id = await saveDraft({ ...input, evidence });
    result.draftIds.push(id);
    log(`  -> udkast: ${input.headline}`);
    return `Udkast gemt til godkendelse (id ${id}).`;
  }

  async function executeTool(block: Anthropic.Beta.BetaToolUseBlock): Promise<{ content: string; isError: boolean }> {
    try {
      if (block.name === "submit_draft") {
        return { content: await submitDraft(block.input as DraftInput), isError: false };
      }
      const fn = DATA_TOOLS[block.name];
      if (!fn) throw new Error(`Ukendt værktøj: ${block.name}`);
      const output = fn(dataset, block.input);
      toolLog.set(block.id, { tool: block.name, input: block.input, result: output });
      return { content: JSON.stringify(output), isError: false };
    } catch (e) {
      // Fejlen sendes tilbage til modellen, som kan prøve igen.
      return { content: `Fejl: ${e instanceof Error ? e.message : String(e)}`, isError: true };
    }
  }

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: TOOL_SCHEMAS,
      messages: result.messages,
      thinking: { type: "adaptive" },
      // Cacher prefixet (system + tools + historik), så hver runde i loopet
      // kun betaler fuld pris for de nye beskeder.
      cache_control: { type: "ephemeral" },
      // Afviser sikkerhedsfiltrene fejlagtigt en anmodning, prøver API'et
      // igen på en anbefalet fallback-model i stedet for at fejle.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    for (const key of Object.keys(result.usage) as (keyof AgentResult["usage"])[]) {
      result.usage[key] += response.usage?.[key] ?? 0;
    }
    result.messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") {
      result.status = "refusal";
      return result;
    }
    if (response.stop_reason === "max_tokens") {
      result.status = "error";
      result.finalText = "Svaret blev afskåret (max_tokens).";
      return result;
    }

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !toolUses.length) {
      result.status = "done";
      result.finalText = response.content
        .flatMap((b) => (b.type === "text" ? [b.text] : []))
        .join("\n");
      return result;
    }

    // Alle resultater sendes samlet i én user-besked - også ved parallelle kald.
    const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      log(`[${turn}] ${tu.name}(${JSON.stringify(tu.input)})`);
      const { content, isError } = await executeTool(tu);
      result.toolCalls.push({ turn, name: tu.name, input: tu.input, isError, output: content });
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content, is_error: isError });
    }
    result.messages.push({ role: "user", content: toolResults });
  }
  return result;
}
