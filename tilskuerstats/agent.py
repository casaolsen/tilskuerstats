"""Insight-agenten: et håndskrevet tool-use-loop mod Claude API.

Loopet er skrevet i hånden (i stedet for SDK'ens tool runner), så hvert
trin er synligt:

  1. Send beskeder + værktøjsdefinitioner til Claude.
  2. stop_reason == "tool_use"  -> kør værktøjerne, send resultaterne tilbage.
  3. stop_reason == "end_turn"  -> agenten er færdig.

Agenten kan kun skrive til databasen via submit_draft, og udkast gemmes
som 'pending', indtil et menneske godkender dem.
"""
from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass, field
from typing import Any

from . import db
from .tools import TOOL_SCHEMAS, run_data_tool, to_json
from .verify import ungrounded_numbers

MODEL = os.environ.get("TILSKUER_MODEL", "claude-opus-5")
MAX_TURNS = 25
MAX_DRAFTS_PER_RUN = 5

SYSTEM_PROMPT = """\
Du er dataredaktør på et dansk site om tilskuertal i Superligaen. Din opgave er \
at gennemgå nye kampe og finde de få ting, der faktisk er værd at fortælle: \
usædvanligt høje eller lave tilskuertal, rekorder (sæson, klub, opgør), og \
markante skift i udviklingen for et hold eller for ligaen.

Sådan arbejder du:
- Start med list_new_matches. Tjek list_recent_drafts, så du ikke gentager et insight.
- Undersøg med værktøjerne, før du konkluderer. Et tal er kun interessant i forhold \
til noget: sammenlign med ligaen, med holdets egne hjemmekampe og med samme opgør \
tidligere. Tag højde for små sammenligningsgrupper (fx tidligt i sæsonen eller et \
nyoprykket hold).
- Du må ikke regne selv eller skrive tal, der ikke står i et værktøjsresultat. \
Afrunding er i orden (23,4 % -> 23 %), men brug hele tilskuertal som i data. \
Skriv tal på dansk (12.456 tilskuere, 23,4 %).
- Kvalitet over kvantitet: 0-3 udkast pr. kørsel er normalt. Hvis intet er \
bemærkelsesværdigt, så indsend ingenting og sig det.
- Udkast skrives på dansk: en præcis overskrift og 1-3 sætninger brødtekst. \
Brug klubnavne frem for forkortelser.

Når du er færdig, afslut med et kort resumé af hvad du undersøgte, og hvorfor \
du indsendte (eller ikke indsendte) udkast."""


@dataclass
class RunResult:
    run_id: int | None
    status: str
    draft_ids: list[int] = field(default_factory=list)
    final_text: str = ""
    usage: dict = field(default_factory=dict)


def _block_to_dict(block: Any) -> dict:
    if isinstance(block, dict):
        return block
    if hasattr(block, "model_dump"):
        return block.model_dump(mode="json", exclude_none=True)
    return dict(vars(block))


def _serialize_messages(messages: list[dict]) -> list[dict]:
    out = []
    for m in messages:
        content = m["content"]
        if not isinstance(content, str):
            content = [_block_to_dict(b) for b in content]
        out.append({"role": m["role"], "content": content})
    return out


class InsightAgent:
    def __init__(self, conn: sqlite3.Connection, client: Any = None, model: str = MODEL,
                 max_turns: int = MAX_TURNS, verbose: bool = False):
        if client is None:
            import anthropic
            client = anthropic.Anthropic()
        self.conn = conn
        self.client = client
        self.model = model
        self.max_turns = max_turns
        self.verbose = verbose
        # tool_use_id -> {"tool", "input", "result"}; bruges til at verificere udkast
        self.tool_log: dict[str, dict] = {}
        self.draft_ids: list[int] = []
        self.run_id: int | None = None

    def log(self, msg: str) -> None:
        if self.verbose:
            print(msg)

    # ------------------------------------------------------------ tools

    def execute_tool(self, name: str, tool_input: dict, tool_use_id: str) -> tuple[str, bool]:
        """Kører ét værktøj. Returnerer (indhold, is_error)."""
        try:
            if name == "submit_draft":
                return self.submit_draft(**tool_input), False
            result = run_data_tool(self.conn, name, tool_input)
        except Exception as exc:  # fejlen sendes til modellen, som kan prøve igen
            return f"Fejl: {exc}", True
        self.tool_log[tool_use_id] = {"tool": name, "input": tool_input, "result": result}
        return to_json(result), False

    def submit_draft(self, kind: str, headline: str, body: str, match_ids: list[int],
                     evidence: list[dict]) -> str:
        if len(self.draft_ids) >= MAX_DRAFTS_PER_RUN:
            raise ValueError(f"Max {MAX_DRAFTS_PER_RUN} udkast pr. kørsel. Vælg de vigtigste.")

        unknown = [e["tool_use_id"] for e in evidence if e["tool_use_id"] not in self.tool_log]
        if unknown:
            raise ValueError(f"evidence peger på ukendte tool_use_id'er: {unknown}")

        all_results = [entry["result"] for entry in self.tool_log.values()]
        bad = ungrounded_numbers(f"{headline}\n{body}", all_results)
        if bad:
            raise ValueError(
                f"Disse tal findes ikke i nogen værktøjsresultater: {bad}. "
                "Brug kun tal fra værktøjerne (afrunding er ok), eller hent de manglende tal først."
            )
        for e in evidence:
            cited = self.tool_log[e["tool_use_id"]]["result"]
            bad = ungrounded_numbers(e["claim"], [cited])
            if bad:
                raise ValueError(f"Påstanden '{e['claim']}' har tal {bad}, som ikke står i {e['tool_use_id']}.")

        # Gem beviserne sammen med udkastet, så man kan se præcis hvad agenten så.
        full_evidence = [{**e, **self.tool_log[e["tool_use_id"]]} for e in evidence]
        draft_id = db.insert_draft(self.conn, self.run_id, kind, headline, body, match_ids, full_evidence)
        self.draft_ids.append(draft_id)
        self.log(f"  -> udkast #{draft_id}: {headline}")
        return f"Udkast #{draft_id} gemt til godkendelse."

    # ------------------------------------------------------------- loop

    def call_model(self, messages: list[dict]) -> Any:
        return self.client.beta.messages.create(
            model=self.model,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            tools=TOOL_SCHEMAS,
            messages=messages,
            thinking={"type": "adaptive"},
            # Cacher prefixet (system + tools + historik), så hver runde i loopet
            # kun betaler fuld pris for de nye beskeder.
            cache_control={"type": "ephemeral"},
            # Hvis sikkerhedsfiltre afviser en anmodning, prøver API'et igen
            # på en anbefalet fallback-model i stedet for at fejle.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )

    def run(self) -> RunResult:
        pending = db.unanalyzed_match_ids(self.conn)
        if not pending:
            return RunResult(run_id=None, status="nothing_new")

        self.run_id = db.start_run(self.conn, self.model, pending)
        messages: list[dict] = [{
            "role": "user",
            "content": f"Der er {len(pending)} nye kampe i databasen. Analyser dem og indsend udkast til insights, hvis der er noget bemærkelsesværdigt.",
        }]
        usage = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0,
                 "cache_creation_input_tokens": 0}
        status, final_text = "max_turns", ""

        try:
            for turn in range(self.max_turns):
                response = self.call_model(messages)
                for key in usage:
                    usage[key] += getattr(response.usage, key, 0) or 0
                messages.append({"role": "assistant", "content": response.content})

                if response.stop_reason == "refusal":
                    status = "refusal"
                    break
                if response.stop_reason == "max_tokens":
                    status = "error"
                    final_text = "Svaret blev afskåret (max_tokens)."
                    break

                tool_uses = [b for b in response.content if b.type == "tool_use"]
                if response.stop_reason != "tool_use" or not tool_uses:
                    status = "done"
                    final_text = "\n".join(b.text for b in response.content if b.type == "text")
                    break

                # Alle resultater sendes samlet i én user-besked - også ved parallelle kald.
                results = []
                for tu in tool_uses:
                    self.log(f"[{turn}] {tu.name}({json.dumps(tu.input, ensure_ascii=False)})")
                    content, is_error = self.execute_tool(tu.name, tu.input, tu.id)
                    if is_error:
                        self.log(f"  !! {content}")
                    results.append({"type": "tool_result", "tool_use_id": tu.id,
                                    "content": content, "is_error": is_error})
                messages.append({"role": "user", "content": results})
        except Exception as exc:
            status, final_text = "error", f"{type(exc).__name__}: {exc}"
            raise
        finally:
            db.finish_run(self.conn, self.run_id, status, _serialize_messages(messages), usage)
            # Kampene markeres kun som set, når agenten nåede til ende. Ellers
            # bliver de taget med igen næste gang.
            if status == "done":
                db.mark_analyzed(self.conn, pending)

        return RunResult(self.run_id, status, self.draft_ids, final_text, usage)
