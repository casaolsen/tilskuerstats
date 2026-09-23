"""Henter kampprogram og tilskuertal fra superstats.dk.

Siden bruger ikke-lukkede <td>-tags, så BeautifulSoup nester cellerne
forkert. Hver kamp står dog på én linje i HTML'en, så vi parser linje for
linje med regex i stedet.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import requests

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tilskuerstats/1.0)"}
PROGRAM_URL = "https://superstats.dk/program"

ROUND_RE = re.compile(r"<th[^>]*>\s*Runde\s+(\d+)\s*</th>")
MATCH_RE = re.compile(
    r"<td class='leftalign'>\s*\S+\s*"                      # ugedag
    r"<td class='leftalign'>\s*(\d{2})/(\d{2})\s+(\d{2}):(\d{2})\s*"  # dato + tid
    r"<td class='leftalign'>\s*([^<]+?)\s*"                  # "AGF-FCM"
    r"<td class='leftalign'>\s*<a href='/kampe/(\d+)'>\s*(\d+)-(\d+)\s*</a>\s*"
    r"<td class='rightalign'>\s*([\d.]+)"                     # tilskuere, "12.456"
)


@dataclass
class Match:
    id: int
    season: str
    round: int
    kickoff: str  # "YYYY-MM-DDTHH:MM", dansk lokaltid
    home: str
    away: str
    home_goals: int
    away_goals: int
    attendance: int


def season_year(season: str, month: int) -> int:
    """Superligaen starter i juli: juli-december hører til sæsonens første år."""
    first, second = (int(y) for y in season.split("/"))
    return first if month >= 7 else second


def parse_program(html: str, season: str) -> list[Match]:
    """Parser en programside. Kampe uden resultat/tilskuertal springes over."""
    matches: list[Match] = []
    current_round = 0
    for line in html.splitlines():
        if m := ROUND_RE.search(line):
            current_round = int(m.group(1))
            continue
        m = MATCH_RE.search(line)
        if not m:
            continue
        day, month, hour, minute, teams, match_id, hg, ag, att = m.groups()
        home, away = (t.strip() for t in teams.split("-", 1))
        year = season_year(season, int(month))
        matches.append(
            Match(
                id=int(match_id),
                season=season,
                round=current_round,
                kickoff=f"{year}-{month}-{day}T{hour}:{minute}",
                home=home,
                away=away,
                home_goals=int(hg),
                away_goals=int(ag),
                attendance=int(att.replace(".", "")),
            )
        )
    return matches


def fetch_season(season: str) -> list[Match]:
    resp = requests.get(PROGRAM_URL, params={"aar": season}, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return parse_program(resp.text, season)
