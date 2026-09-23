"""SQLite-lag: kampe, agent-kørsler og insight-udkast."""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .scraper import Match

DEFAULT_DB = os.environ.get("TILSKUER_DB", "data/tilskuerstats.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS matches (
    id          INTEGER PRIMARY KEY,   -- superstats.dk kamp-id
    season      TEXT NOT NULL,
    round       INTEGER NOT NULL,
    kickoff     TEXT NOT NULL,
    home        TEXT NOT NULL,
    away        TEXT NOT NULL,
    home_goals  INTEGER NOT NULL,
    away_goals  INTEGER NOT NULL,
    attendance  INTEGER NOT NULL,
    scraped_at  TEXT NOT NULL,
    analyzed_at TEXT                    -- NULL = agenten har ikke set kampen endnu
);

CREATE TABLE IF NOT EXISTS runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    model       TEXT NOT NULL,
    status      TEXT NOT NULL,          -- running | done | max_turns | refusal | error
    match_ids   TEXT NOT NULL,          -- JSON: kampe der var nye ved start
    transcript  TEXT,                   -- JSON: hele beskedhistorikken
    usage       TEXT                    -- JSON: summeret token-forbrug
);

CREATE TABLE IF NOT EXISTS drafts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      INTEGER REFERENCES runs(id),
    created_at  TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
    kind        TEXT NOT NULL,
    headline    TEXT NOT NULL,
    body        TEXT NOT NULL,
    match_ids   TEXT NOT NULL,          -- JSON
    evidence    TEXT NOT NULL,          -- JSON: [{claim, tool_use_id, tool, input, result}]
    reviewed_at TEXT,
    review_note TEXT
);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path: str = DEFAULT_DB) -> sqlite3.Connection:
    if path != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def upsert_matches(conn: sqlite3.Connection, matches: list[Match], baseline: bool = False) -> int:
    """Indsætter/opdaterer kampe. Returnerer antal nye kampe.

    baseline=True markerer nye kampe som allerede analyseret - bruges når man
    indlæser historik, så agenten ikke skal skrive insights om gamle sæsoner.
    """
    ts = now()
    new = 0
    for m in matches:
        exists = conn.execute("SELECT 1 FROM matches WHERE id = ?", (m.id,)).fetchone()
        if exists:
            conn.execute(
                """UPDATE matches SET season=?, round=?, kickoff=?, home=?, away=?,
                   home_goals=?, away_goals=?, attendance=? WHERE id=?""",
                (m.season, m.round, m.kickoff, m.home, m.away,
                 m.home_goals, m.away_goals, m.attendance, m.id),
            )
        else:
            conn.execute(
                """INSERT INTO matches (id, season, round, kickoff, home, away, home_goals,
                   away_goals, attendance, scraped_at, analyzed_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (m.id, m.season, m.round, m.kickoff, m.home, m.away, m.home_goals,
                 m.away_goals, m.attendance, ts, ts if baseline else None),
            )
            new += 1
    conn.commit()
    return new


def unanalyzed_match_ids(conn: sqlite3.Connection) -> list[int]:
    rows = conn.execute("SELECT id FROM matches WHERE analyzed_at IS NULL ORDER BY kickoff")
    return [r["id"] for r in rows]


def mark_analyzed(conn: sqlite3.Connection, match_ids: list[int]) -> None:
    ts = now()
    conn.executemany("UPDATE matches SET analyzed_at = ? WHERE id = ?", [(ts, i) for i in match_ids])
    conn.commit()


def start_run(conn: sqlite3.Connection, model: str, match_ids: list[int]) -> int:
    cur = conn.execute(
        "INSERT INTO runs (started_at, model, status, match_ids) VALUES (?, ?, 'running', ?)",
        (now(), model, json.dumps(match_ids)),
    )
    conn.commit()
    return cur.lastrowid


def finish_run(conn: sqlite3.Connection, run_id: int, status: str, transcript: list, usage: dict) -> None:
    conn.execute(
        "UPDATE runs SET finished_at=?, status=?, transcript=?, usage=? WHERE id=?",
        (now(), status, json.dumps(transcript, ensure_ascii=False, default=str),
         json.dumps(usage), run_id),
    )
    conn.commit()


def insert_draft(conn: sqlite3.Connection, run_id: int | None, kind: str, headline: str,
                 body: str, match_ids: list[int], evidence: list[dict]) -> int:
    cur = conn.execute(
        """INSERT INTO drafts (run_id, created_at, kind, headline, body, match_ids, evidence)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (run_id, now(), kind, headline, body, json.dumps(match_ids),
         json.dumps(evidence, ensure_ascii=False)),
    )
    conn.commit()
    return cur.lastrowid


def review_draft(conn: sqlite3.Connection, draft_id: int, status: str, note: str | None) -> bool:
    cur = conn.execute(
        "UPDATE drafts SET status=?, reviewed_at=?, review_note=? WHERE id=?",
        (status, now(), note, draft_id),
    )
    conn.commit()
    return cur.rowcount == 1
