#!/usr/bin/env python3
"""Scraper til tilskuertal for Eliteserien (Norge) fra fotball.no.

fotball.no er Norges Fotballforbunds officielle kampdatabase (FIKS).
Modsat superstats.dk kræver hver sæson et opslået "fiksId", som findes
via turneringssiden på fotball.no (søg fx "fotball.no Eliteserien 2025").

Henter kampprogrammet (runde, dato, hold, resultat, stadion) fra
turneringssidens kampliste og besøger hver enkelt kampside for at hente
tilskuertallet. Output: CSV med kolonnerne dato, runde, hjemmehold,
udehold, hjemmemål, udemål, tilskuere, stadion.

Brug: python3 scrape_fotball_no.py [sæson, fx 2025]
Default-sæson er 2025.
"""

import csv
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.fotball.no"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tilskuerstats-scraper/1.0)"}
REQUEST_DELAY = 0.5  # sekunder mellem kald til kampsider, for ikke at belaste sitet

# fotball.no bruger interne "fiksId"'er for hver sæson af hver turnering,
# som ikke kan udledes af årstal. Fundet ved at slå de enkelte sæsoner op
# på fotball.no (Eliteserien {år}).
SEASON_FIKS_IDS = {
    "2025": "199603",
    "2026": "206092",
}


def fetch(url: str) -> BeautifulSoup:
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "lxml")


def parse_matches(soup: BeautifulSoup):
    """Udtræk (match_id, dato, runde, hjemmehold, udehold, mål, stadion) for hver kamp."""
    matches = []
    for table in soup.find_all("table"):
        header_cells = [th.get_text(strip=True) for th in table.find_all("th")]
        if not any("Runde" in h or h == "R" for h in header_cells):
            continue

        for row in table.find_all("tr"):
            cells = row.find_all("td", recursive=False)
            if len(cells) != 9:
                continue

            round_text = cells[0].get_text(strip=True)
            if not round_text.isdigit():
                continue
            runde = int(round_text)

            date_link = cells[1].find("a")
            if not date_link:
                continue
            date_match = re.match(r"(\d{2})\.(\d{2})\.(\d{4})", date_link.get_text(strip=True))
            if not date_match:
                continue
            day, month, year = date_match.groups()
            iso_date = f"{year}-{month}-{day}"

            match_id_href = date_link.get("href", "")
            id_match = re.search(r"fiksId=(\d+)", match_id_href)
            if not id_match:
                continue
            match_id = id_match.group(1)

            home_team = cells[4].get_text(strip=True)
            away_team = cells[6].get_text(strip=True)

            score_text = cells[5].get_text(strip=True)
            score_match = re.match(r"(\d+)\s*-\s*(\d+)", score_text)
            home_goals, away_goals = (
                (int(score_match.group(1)), int(score_match.group(2))) if score_match else (None, None)
            )

            stadium_link = cells[7].find("a")
            stadion = stadium_link.get_text(strip=True) if stadium_link else cells[7].get_text(strip=True)

            matches.append(
                {
                    "match_id": match_id,
                    "dato": iso_date,
                    "runde": runde,
                    "hjemmehold": home_team,
                    "udehold": away_team,
                    "hjemmemaal": home_goals,
                    "udemaal": away_goals,
                    "stadion": stadion,
                }
            )
        break  # den første tabel med "Runde"-header er kamplisten
    return matches


def fetch_attendance(match_id: str):
    soup = fetch(f"{BASE_URL}/fotballdata/kamp/?fiksId={match_id}")
    label = soup.find(string=re.compile(r"Tilskuere:"))
    if not label:
        return None
    # Teksten "Tilskuere: 1\xa0806" ligger i samme <p> som label-spannet.
    container = label.find_parent("p")
    text = container.get_text() if container else label
    number_match = re.search(r"Tilskuere:\s*([\d\s\xa0]+)", text)
    if not number_match:
        return None
    digits = re.sub(r"[^\d]", "", number_match.group(1))
    return int(digits) if digits else None


def main():
    season = sys.argv[1] if len(sys.argv) > 1 else "2025"
    fiks_id = SEASON_FIKS_IDS.get(season)
    if not fiks_id:
        sys.exit(
            f"Ukendt sæson: {season!r}. Kendte sæsoner: {', '.join(SEASON_FIKS_IDS)}. "
            "Slå fiksId op på fotball.no og tilføj den til SEASON_FIKS_IDS."
        )

    program_url = f"{BASE_URL}/fotballdata/turnering/hjem/?fiksId={fiks_id}&underside=kamper"
    print(f"Henter kampprogram: {program_url}", file=sys.stderr)
    program_soup = fetch(program_url)
    matches = parse_matches(program_soup)
    print(f"Fandt {len(matches)} kampe.", file=sys.stderr)

    rows = []
    for i, m in enumerate(matches, start=1):
        tilskuere = fetch_attendance(m["match_id"])
        rows.append(
            {
                "dato": m["dato"],
                "runde": m["runde"],
                "hjemmehold": m["hjemmehold"],
                "udehold": m["udehold"],
                "hjemmemaal": m["hjemmemaal"],
                "udemaal": m["udemaal"],
                "tilskuere": tilskuere,
                "stadion": m["stadion"],
            }
        )
        print(
            f"[{i}/{len(matches)}] runde {m['runde']} {m['dato']} {m['hjemmehold']}-{m['udehold']} -> {tilskuere}",
            file=sys.stderr,
        )
        time.sleep(REQUEST_DELAY)

    rows.sort(key=lambda r: r["dato"])

    out_path = f"tilskuertal_eliteserien_{season}.csv"
    fieldnames = ["dato", "runde", "hjemmehold", "udehold", "hjemmemaal", "udemaal", "tilskuere", "stadion"]
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Skrev {len(rows)} rækker til {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
