"""Kommandolinje: hent data, kør agenten og godkend udkast.

    python -m tilskuerstats scrape --season 2024/2025 --baseline
    python -m tilskuerstats scrape --season 2025/2026
    python -m tilskuerstats analyze -v
    python -m tilskuerstats drafts
    python -m tilskuerstats show 3
    python -m tilskuerstats approve 3
    python -m tilskuerstats reject 4 --note "for tyndt"
    python -m tilskuerstats export
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import db


def cmd_scrape(conn, args) -> None:
    from .scraper import fetch_season

    for season in args.season:
        matches = fetch_season(season)
        new = db.upsert_matches(conn, matches, baseline=args.baseline)
        tag = " (baseline, markeret som analyseret)" if args.baseline else ""
        print(f"{season}: {len(matches)} kampe hentet, {new} nye{tag}")


def cmd_analyze(conn, args) -> None:
    from .agent import InsightAgent

    agent = InsightAgent(conn, model=args.model, max_turns=args.max_turns, verbose=args.verbose)
    result = agent.run()
    if result.status == "nothing_new":
        print("Ingen nye kampe at analysere.")
        return
    print(f"\nKørsel #{result.run_id}: {result.status}, {len(result.draft_ids)} nye udkast")
    print(f"Tokens: {result.usage}")
    if result.final_text:
        print(f"\n{result.final_text}")


def cmd_drafts(conn, args) -> None:
    query = "SELECT id, created_at, status, kind, headline FROM drafts"
    params: tuple = ()
    if args.status != "all":
        query += " WHERE status = ?"
        params = (args.status,)
    rows = conn.execute(query + " ORDER BY id DESC", params).fetchall()
    if not rows:
        print("Ingen udkast.")
    for r in rows:
        print(f"#{r['id']:<4} {r['status']:<9} {r['kind']:<9} {r['headline']}")


def cmd_show(conn, args) -> None:
    r = conn.execute("SELECT * FROM drafts WHERE id = ?", (args.id,)).fetchone()
    if r is None:
        sys.exit(f"Udkast #{args.id} findes ikke")
    print(f"#{r['id']} [{r['status']}] {r['kind']}  (kørsel #{r['run_id']}, {r['created_at']})")
    print(f"\n{r['headline']}\n\n{r['body']}\n")
    print(f"Kampe: {json.loads(r['match_ids'])}")
    print("\nBeviser:")
    for e in json.loads(r["evidence"]):
        print(f"  - {e['claim']}")
        print(f"    {e['tool']}({json.dumps(e['input'], ensure_ascii=False)})")
        if args.full:
            print("    " + json.dumps(e["result"], ensure_ascii=False, indent=2).replace("\n", "\n    "))
    if r["review_note"]:
        print(f"\nNote: {r['review_note']}")


def cmd_review(conn, args, status: str) -> None:
    if not db.review_draft(conn, args.id, status, args.note):
        sys.exit(f"Udkast #{args.id} findes ikke")
    print(f"Udkast #{args.id}: {status}")


def cmd_export(conn, args) -> None:
    rows = conn.execute(
        "SELECT id, kind, headline, body, match_ids, reviewed_at FROM drafts "
        "WHERE status = 'approved' ORDER BY reviewed_at DESC"
    ).fetchall()
    data = [{**dict(r), "match_ids": json.loads(r["match_ids"])} for r in rows]
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(data)} godkendte insights skrevet til {args.out}")


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="tilskuerstats")
    p.add_argument("--db", default=db.DEFAULT_DB)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("scrape", help="hent kampe fra superstats.dk")
    s.add_argument("--season", action="append", required=True, help="fx 2025/2026 (kan gentages)")
    s.add_argument("--baseline", action="store_true", help="marker nye kampe som allerede analyseret")

    from .agent import MAX_TURNS, MODEL
    a = sub.add_parser("analyze", help="kør insight-agenten på nye kampe")
    a.add_argument("--model", default=MODEL)
    a.add_argument("--max-turns", type=int, default=MAX_TURNS)
    a.add_argument("-v", "--verbose", action="store_true")

    d = sub.add_parser("drafts", help="list udkast")
    d.add_argument("--status", default="pending", choices=["pending", "approved", "rejected", "all"])

    sh = sub.add_parser("show", help="vis et udkast med beviser")
    sh.add_argument("id", type=int)
    sh.add_argument("--full", action="store_true", help="vis hele værktøjsresultatet")

    for name in ("approve", "reject"):
        r = sub.add_parser(name)
        r.add_argument("id", type=int)
        r.add_argument("--note")

    e = sub.add_parser("export", help="skriv godkendte insights til JSON til sitet")
    e.add_argument("--out", default="data/insights.json")

    args = p.parse_args(argv)
    conn = db.connect(args.db)
    handlers = {
        "scrape": cmd_scrape, "analyze": cmd_analyze, "drafts": cmd_drafts, "show": cmd_show,
        "approve": lambda c, a: cmd_review(c, a, "approved"),
        "reject": lambda c, a: cmd_review(c, a, "rejected"),
        "export": cmd_export,
    }
    handlers[args.cmd](conn, args)
