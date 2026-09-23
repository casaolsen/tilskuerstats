"""Tester agent-loopet med en falsk Claude-klient, der afspiller et manuskript."""
import json
from types import SimpleNamespace as NS

from tilskuerstats.agent import InsightAgent

USAGE = NS(input_tokens=100, output_tokens=20, cache_read_input_tokens=0, cache_creation_input_tokens=0)


def tool_use(id, name, input):
    return NS(type="tool_use", id=id, name=name, input=input)


def reply(stop_reason, *blocks):
    return NS(stop_reason=stop_reason, content=list(blocks), usage=USAGE)


class FakeClient:
    def __init__(self, script):
        self.script = list(script)
        self.requests = []
        self.beta = NS(messages=NS(create=self.create))

    def create(self, **kwargs):
        self.requests.append(json.loads(json.dumps(kwargs["messages"], default=vars)))
        return self.script.pop(0)


def draft(headline, tool_use_id="t2"):
    return {
        "kind": "record", "headline": headline,
        "body": "AGF havde aldrig haft flere tilskuere til en hjemmekamp i databasen.",
        "match_ids": [11], "evidence": [{"claim": "Rang 1 af 3", "tool_use_id": tool_use_id}],
    }


def test_happy_path_creates_draft_and_marks_matches(conn):
    client = FakeClient([
        reply("tool_use", tool_use("t1", "list_new_matches", {})),
        reply("tool_use", tool_use("t2", "compare_attendance", {"match_id": 11, "scope": "home_team_all"})),
        reply("tool_use", tool_use("t3", "submit_draft", draft("Ny AGF-rekord: 19.500 tilskuere"))),
        reply("end_turn", NS(type="text", text="Ét udkast indsendt.")),
    ])
    result = InsightAgent(conn, client=client).run()

    assert result.status == "done"
    assert result.draft_ids == [1]
    row = conn.execute("SELECT * FROM drafts").fetchone()
    assert row["status"] == "pending"
    assert json.loads(row["evidence"])[0]["tool"] == "compare_attendance"
    assert conn.execute("SELECT COUNT(*) FROM matches WHERE analyzed_at IS NULL").fetchone()[0] == 0


def test_invented_number_is_rejected_and_model_can_retry(conn):
    client = FakeClient([
        reply("tool_use", tool_use("t2", "compare_attendance", {"match_id": 11, "scope": "home_team_all"})),
        reply("tool_use", tool_use("t3", "submit_draft", draft("Ny AGF-rekord: 20.000 tilskuere"))),
        reply("tool_use", tool_use("t4", "submit_draft", draft("Ny AGF-rekord: 19.500 tilskuere"))),
        reply("end_turn", NS(type="text", text="Rettet.")),
    ])
    result = InsightAgent(conn, client=client).run()

    # Fejlen blev sendt tilbage som tool_result med is_error
    error = client.requests[2][-1]["content"][0]
    assert error["tool_use_id"] == "t3" and error["is_error"] is True
    assert "20.000" in error["content"]
    assert result.draft_ids == [1]
    assert conn.execute("SELECT headline FROM drafts").fetchone()[0].endswith("19.500 tilskuere")


def test_unknown_evidence_id_is_rejected(conn):
    agent = InsightAgent(conn, client=FakeClient([]))
    content, is_error = agent.execute_tool("submit_draft", draft("Rekord", tool_use_id="nope"), "t9")
    assert is_error and "nope" in content


def test_max_turns_does_not_mark_matches(conn):
    client = FakeClient([reply("tool_use", tool_use(f"t{i}", "list_new_matches", {})) for i in range(3)])
    result = InsightAgent(conn, client=client, max_turns=3).run()
    assert result.status == "max_turns"
    assert conn.execute("SELECT COUNT(*) FROM matches WHERE analyzed_at IS NULL").fetchone()[0] == 3
    assert conn.execute("SELECT status FROM runs").fetchone()[0] == "max_turns"


def test_nothing_new_skips_the_api(conn):
    conn.execute("UPDATE matches SET analyzed_at = 'x'")
    client = FakeClient([])
    assert InsightAgent(conn, client=client).run().status == "nothing_new"
    assert client.requests == []
