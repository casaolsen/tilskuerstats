"""De værktøjer agenten må bruge.

Princip: værktøjerne regner, modellen vurderer og formulerer. Alle tal i et
udkast skal kunne findes i et værktøjsresultat (se verify.py), så de
afledte tal (gennemsnit, rang, procentvis ændring) beregnes her og ikke af
modellen.

Hvert værktøj er en almindelig Python-funktion `fn(conn, **input) -> dict`
plus et JSON-schema, som sendes til Claude i `tools`-parameteren.
"""
from __future__ import annotations

import json
import sqlite3
import statistics
from typing import Any, Callable

# Kun klubber vi er sikre på. Ukendte forkortelser vises bare som koden.
TEAM_NAMES = {
    "AGF": "AGF", "AaB": "AaB", "BIF": "Brøndby IF", "FCK": "FC København",
    "FCM": "FC Midtjylland", "FCN": "FC Nordsjælland", "LBK": "Lyngby Boldklub",
    "OB": "OB", "RFC": "Randers FC", "SIF": "Silkeborg IF", "SJF": "Sønderjyske",
    "VB": "Vejle Boldklub", "VFF": "Viborg FF", "FCF": "FC Fredericia",
    "EFB": "Esbjerg fB", "ACH": "AC Horsens",
}


# ---------------------------------------------------------------- helpers

def _match_dict(row: sqlite3.Row) -> dict:
    return {
        "match_id": row["id"],
        "season": row["season"],
        "round": row["round"],
        "kickoff": row["kickoff"],
        "home": row["home"],
        "away": row["away"],
        "score": f"{row['home_goals']}-{row['away_goals']}",
        "attendance": row["attendance"],
    }


def _get_match(conn: sqlite3.Connection, match_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM matches WHERE id = ?", (match_id,)).fetchone()
    if row is None:
        raise ValueError(f"Ukendt match_id {match_id}")
    return row


def _pct(new: float, old: float) -> float | None:
    return round((new - old) / old * 100, 1) if old else None


def _avg(values: list[int]) -> int | None:
    return round(statistics.mean(values)) if values else None


def _previous_season(season: str) -> str:
    a, b = (int(y) for y in season.split("/"))
    return f"{a - 1}/{b - 1}"


# ------------------------------------------------------------------ tools

def list_new_matches(conn: sqlite3.Connection) -> dict:
    rows = conn.execute(
        "SELECT * FROM matches WHERE analyzed_at IS NULL ORDER BY kickoff LIMIT 60"
    ).fetchall()
    return {"count": len(rows), "matches": [_match_dict(r) for r in rows]}


def list_available_data(conn: sqlite3.Connection) -> dict:
    seasons = conn.execute(
        """SELECT season, COUNT(*) AS matches, MAX(round) AS last_round,
                  SUM(attendance) AS total_attendance
           FROM matches GROUP BY season ORDER BY season"""
    ).fetchall()
    teams = [r["home"] for r in conn.execute("SELECT DISTINCT home FROM matches ORDER BY home")]
    return {
        "seasons": [dict(s) for s in seasons],
        "teams": [{"code": t, "name": TEAM_NAMES.get(t, t)} for t in teams],
    }


COMPARE_SCOPES = {
    "league_season": ("season = :season", "alle ligakampe i samme sæson"),
    "league_all": ("1 = 1", "alle ligakampe i databasen (alle sæsoner)"),
    "home_team_season": ("home = :home AND season = :season", "hjemmeholdets hjemmekampe i samme sæson"),
    "home_team_all": ("home = :home", "hjemmeholdets hjemmekampe i alle sæsoner"),
    "fixture_history": ("home = :home AND away = :away", "samme opgør (samme hjemme- og udehold) på tværs af sæsoner"),
}


def compare_attendance(conn: sqlite3.Connection, match_id: int, scope: str) -> dict:
    """Placerer en kamps tilskuertal i en sammenligningsgruppe.

    Kun kampe spillet til og med denne kamps kickoff tæller med, så et
    'rekord'-resultat betyder rekord på tidspunktet - og svaret ændrer sig
    ikke, hvis agenten kører igen senere.
    """
    if scope not in COMPARE_SCOPES:
        raise ValueError(f"scope skal være en af {sorted(COMPARE_SCOPES)}")
    m = _get_match(conn, match_id)
    where, description = COMPARE_SCOPES[scope]
    params = {"season": m["season"], "home": m["home"], "away": m["away"], "kickoff": m["kickoff"]}
    rows = conn.execute(
        f"SELECT * FROM matches WHERE {where} AND kickoff <= :kickoff ORDER BY kickoff", params
    ).fetchall()

    values = [r["attendance"] for r in rows]
    att = m["attendance"]
    earlier = [r for r in rows if r["id"] != m["id"]]
    prev_high = max(earlier, key=lambda r: r["attendance"], default=None)
    prev_low = min(earlier, key=lambda r: r["attendance"], default=None)
    mean = statistics.mean(values)
    stdev = statistics.stdev(values) if len(values) >= 3 else None

    return {
        "match": _match_dict(m),
        "scope": scope,
        "comparison_group": description,
        "matches_in_group": len(values),
        "rank_highest_first": 1 + sum(v > att for v in values),
        "mean_attendance": round(mean),
        "median_attendance": round(statistics.median(values)),
        "diff_vs_mean": round(att - mean),
        "pct_vs_mean": _pct(att, mean),
        "z_score": round((att - mean) / stdev, 2) if stdev else None,
        "is_highest_so_far": prev_high is None or att > prev_high["attendance"],
        "is_lowest_so_far": prev_low is None or att < prev_low["attendance"],
        "previous_highest": _match_dict(prev_high) if prev_high else None,
        "previous_lowest": _match_dict(prev_low) if prev_low else None,
        "note": "Grupper med under 5 kampe siger meget lidt." if len(values) < 5 else None,
    }


def team_attendance_trend(conn: sqlite3.Connection, team: str, season: str, window: int = 3) -> dict:
    """Hjemmekampe for et hold i en sæson + udvikling og sammenligning med
    samme tidspunkt sidste sæson (samme antal hjemmekampe)."""
    rows = conn.execute(
        "SELECT * FROM matches WHERE home = ? AND season = ? ORDER BY kickoff", (team, season)
    ).fetchall()
    if not rows:
        raise ValueError(f"Ingen hjemmekampe for {team} i {season}")
    values = [r["attendance"] for r in rows]
    n = len(values)

    last, before = values[-window:], values[-2 * window:-window]
    prev_season = _previous_season(season)
    prev_rows = conn.execute(
        "SELECT attendance FROM matches WHERE home = ? AND season = ? ORDER BY kickoff LIMIT ?",
        (team, prev_season, n),
    ).fetchall()
    prev_values = [r["attendance"] for r in prev_rows]
    same_point = len(prev_values) == n

    return {
        "team": team,
        "team_name": TEAM_NAMES.get(team, team),
        "season": season,
        "home_matches": [
            {"match_id": r["id"], "kickoff": r["kickoff"], "opponent": r["away"],
             "attendance": r["attendance"]} for r in rows
        ],
        "home_matches_played": n,
        "season_avg": _avg(values),
        f"avg_last_{window}": _avg(last),
        f"avg_previous_{window}": _avg(before) if len(before) == window else None,
        "pct_change_last_vs_previous": _pct(_avg(last), _avg(before)) if len(before) == window else None,
        "previous_season": prev_season,
        "previous_season_avg_same_point": _avg(prev_values) if same_point else None,
        "pct_vs_previous_season_same_point": _pct(_avg(values), _avg(prev_values)) if same_point else None,
        "note": None if same_point else f"Ingen sammenlignelige data for {prev_season} (fx op-/nedrykning).",
    }


def season_overview(conn: sqlite3.Connection, season: str, up_to_round: int | None = None) -> dict:
    """Ligaens samlede tilskuertal til og med en runde, sammenlignet med
    sidste sæson til og med samme runde (like-for-like)."""
    if up_to_round is None:
        up_to_round = conn.execute(
            "SELECT MAX(round) FROM matches WHERE season = ?", (season,)
        ).fetchone()[0]
        if up_to_round is None:
            raise ValueError(f"Ingen kampe i {season}")

    def summary(s: str) -> dict | None:
        rows = conn.execute(
            "SELECT * FROM matches WHERE season = ? AND round <= ?", (s, up_to_round)
        ).fetchall()
        if not rows:
            return None
        by_team: dict[str, list[int]] = {}
        for r in rows:
            by_team.setdefault(r["home"], []).append(r["attendance"])
        return {
            "matches": len(rows),
            "total_attendance": sum(r["attendance"] for r in rows),
            "avg_attendance": _avg([r["attendance"] for r in rows]),
            "home_avg_by_team": dict(sorted(
                ((t, _avg(v)) for t, v in by_team.items()), key=lambda kv: -kv[1]
            )),
        }

    cur = summary(season)
    if cur is None:
        raise ValueError(f"Ingen kampe i {season}")
    prev_season = _previous_season(season)
    prev = summary(prev_season)
    return {
        "season": season,
        "up_to_round": up_to_round,
        "current": cur,
        "previous_season": prev_season,
        "previous_same_rounds": prev,
        "pct_change_avg_attendance": _pct(cur["avg_attendance"], prev["avg_attendance"]) if prev else None,
        "pct_change_total_attendance": _pct(cur["total_attendance"], prev["total_attendance"]) if prev else None,
    }


def round_summary(conn: sqlite3.Connection, season: str, round_number: int) -> dict:
    rows = conn.execute(
        "SELECT * FROM matches WHERE season = ? AND round = ? ORDER BY attendance DESC",
        (season, round_number),
    ).fetchall()
    if not rows:
        raise ValueError(f"Ingen kampe i runde {round_number} af {season}")
    per_round = conn.execute(
        "SELECT round, AVG(attendance) AS avg FROM matches WHERE season = ? GROUP BY round",
        (season,),
    ).fetchall()
    this_avg = statistics.mean(r["attendance"] for r in rows)
    return {
        "season": season,
        "round": round_number,
        "matches": [_match_dict(r) for r in rows],
        "total_attendance": sum(r["attendance"] for r in rows),
        "avg_attendance": round(this_avg),
        "rounds_played_in_season": len(per_round),
        "rank_of_round_by_avg": 1 + sum(r["avg"] > this_avg for r in per_round),
    }


def list_recent_drafts(conn: sqlite3.Connection, limit: int = 15) -> dict:
    rows = conn.execute(
        "SELECT id, created_at, status, kind, headline, review_note FROM drafts ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return {"drafts": [dict(r) for r in rows]}


# ---------------------------------------------------------------- schemas
# Beskrivelserne er modellens eneste dokumentation af værktøjerne - de er
# en del af prompten og værd at skrive omhyggeligt.

TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "list_new_matches",
        "description": "Returnerer de kampe, der er kommet til siden sidste analyse. Start her.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "list_available_data",
        "description": "Oversigt over sæsoner i databasen (antal kampe, seneste runde, samlet tilskuertal) og holdkoder med klubnavne.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "compare_attendance",
        "description": (
            "Placerer én kamps tilskuertal i en sammenligningsgruppe: rang, gennemsnit, median, "
            "procentvis afvigelse, z-score og om det er den højeste/laveste hidtil (med den tidligere "
            "rekord). Kun kampe til og med kampens kickoff tæller med. Brug flere scopes for at se, "
            "om noget er usædvanligt for ligaen, for holdet eller for netop dette opgør."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "match_id": {"type": "integer"},
                "scope": {"type": "string", "enum": sorted(COMPARE_SCOPES)},
            },
            "required": ["match_id", "scope"],
            "additionalProperties": False,
        },
    },
    {
        "name": "team_attendance_trend",
        "description": (
            "Et holds hjemmekampe i en sæson med gennemsnit, udvikling i de seneste `window` kampe "
            "mod de `window` før, og sammenligning med samme antal hjemmekampe sidste sæson."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "team": {"type": "string", "description": "Holdkode, fx 'FCK'"},
                "season": {"type": "string", "description": "Fx '2025/2026'"},
                "window": {"type": "integer", "minimum": 1, "maximum": 10, "default": 3},
            },
            "required": ["team", "season"],
            "additionalProperties": False,
        },
    },
    {
        "name": "season_overview",
        "description": (
            "Ligaens samlede og gennemsnitlige tilskuertal til og med en runde, pr. hold, og "
            "sammenlignet med sidste sæson til og med samme runde."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "season": {"type": "string"},
                "up_to_round": {"type": "integer", "description": "Udelad for seneste spillede runde"},
            },
            "required": ["season"],
            "additionalProperties": False,
        },
    },
    {
        "name": "round_summary",
        "description": "Alle kampe i én runde med samlet og gennemsnitligt tilskuertal, og rundens placering blandt sæsonens runder.",
        "input_schema": {
            "type": "object",
            "properties": {"season": {"type": "string"}, "round_number": {"type": "integer"}},
            "required": ["season", "round_number"],
            "additionalProperties": False,
        },
    },
    {
        "name": "list_recent_drafts",
        "description": "De seneste insight-udkast med status og redaktørens note (også godkendte/afviste). Tjek dem, så du ikke gentager et insight, og lær af begrundelserne for afviste udkast.",
        "input_schema": {
            "type": "object",
            "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 50}},
            "additionalProperties": False,
        },
    },
    {
        "name": "submit_draft",
        "description": (
            "Gem et insight-udkast til menneskelig godkendelse. Hvert tal i headline og body skal "
            "stå i et af dine værktøjsresultater, ellers afvises udkastet med en fejl, du kan rette. "
            "evidence skal pege på de tool_use-id'er, som tallene kommer fra."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": ["record", "outlier", "trend", "milestone", "other"]},
                "headline": {"type": "string", "description": "Kort overskrift, max ca. 80 tegn"},
                "body": {"type": "string", "description": "1-3 sætninger på dansk"},
                "match_ids": {"type": "array", "items": {"type": "integer"}},
                "evidence": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "properties": {
                            "claim": {"type": "string", "description": "Den påstand, beviset understøtter"},
                            "tool_use_id": {"type": "string", "description": "id på det tool_use-kald, der viser det"},
                        },
                        "required": ["claim", "tool_use_id"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["kind", "headline", "body", "match_ids", "evidence"],
            "additionalProperties": False,
        },
    },
]

# submit_draft håndteres af agent-loopet, fordi det skal kende kørslens
# tidligere værktøjsresultater. Resten er rene dataværktøjer.
DATA_TOOLS: dict[str, Callable[..., dict]] = {
    "list_new_matches": list_new_matches,
    "list_available_data": list_available_data,
    "compare_attendance": compare_attendance,
    "team_attendance_trend": team_attendance_trend,
    "season_overview": season_overview,
    "round_summary": round_summary,
    "list_recent_drafts": list_recent_drafts,
}


def run_data_tool(conn: sqlite3.Connection, name: str, tool_input: dict) -> dict:
    if name not in DATA_TOOLS:
        raise ValueError(f"Ukendt værktøj: {name}")
    return DATA_TOOLS[name](conn, **tool_input)


def to_json(result: Any) -> str:
    return json.dumps(result, ensure_ascii=False)
