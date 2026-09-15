#!/usr/bin/env python3
"""Konverterer en manuelt downloadet fbref.com "Scores & Fixtures"-xls-fil
til samme CSV-format som de danske og norske tilskuerfiler.

fbref.com er beskyttet af Cloudflare og kan ikke scrapes direkte fra
dette miljø, men fbref's egen "Download table as .xls"-funktion giver
en fil (i virkeligheden en HTML-tabel, ikke et rigtigt Excel-format)
som brugeren kan hente manuelt i sin egen browser og aflevere her.

Output: CSV med kolonnerne dato, runde, hjemmehold, udehold,
hjemmemål, udemål, tilskuere, stadion. Kun rækker hvor "Round"-kolonnen
er selve liganavnet (fx "Allsvenskan") medtages — playoff- og
kvalifikationskampe fra andre turneringer i samme fil sorteres fra.

Brug: python3 convert_fbref_xls.py <sti-til-xls-fil> <liganavn> <output.csv>
Eksempel: python3 convert_fbref_xls.py sportsref_download.xls Allsvenskan tilskuertal_allsvenskan_2025.csv
"""

import csv
import re
import sys

from bs4 import BeautifulSoup

# fbref har fejlkoblet visse stadion-navne til forkerte databaseposter.
# Kendt eksempel: GAIS og IFK Göteborgs hjemmekampe (som deler stadion i
# virkeligheden) er registreret som "Salon Urheilupuisto Stadion" - et
# stadion i Salo, Finland - i stedet for deres faktiske hjemmebane.
VENUE_FIXES = {
    "Salon Urheilupuisto Stadion": "Gamla Ullevi",
}


def cell_text(row, stat):
    cell = row.find(attrs={"data-stat": stat})
    return cell.get_text(strip=True) if cell else ""


def parse_rows(html: str, league_name: str):
    soup = BeautifulSoup(html, "lxml")
    tbody = soup.find("tbody")
    matches = []
    for row in tbody.find_all("tr"):
        round_cell = row.find("th")
        if not round_cell or round_cell.get_text(strip=True) != league_name:
            continue

        gameweek = cell_text(row, "gameweek")
        if not gameweek.isdigit():
            continue

        date = cell_text(row, "date")  # allerede ISO-format hos fbref
        home = cell_text(row, "home_team")
        away = cell_text(row, "away_team")
        venue = cell_text(row, "venue")
        venue = VENUE_FIXES.get(venue, venue)

        score = cell_text(row, "score")
        score_match = re.match(r"(\d+)\s*[–‒-]\s*(\d+)", score)
        home_goals, away_goals = (
            (int(score_match.group(1)), int(score_match.group(2))) if score_match else (None, None)
        )

        attendance_text = cell_text(row, "attendance").replace(",", "").replace("\xa0", "")
        attendance = int(attendance_text) if attendance_text.isdigit() else None

        matches.append(
            {
                "dato": date,
                "runde": int(gameweek),
                "hjemmehold": home,
                "udehold": away,
                "hjemmemaal": home_goals,
                "udemaal": away_goals,
                "tilskuere": attendance,
                "stadion": venue,
            }
        )
    return matches


def main():
    if len(sys.argv) != 4:
        sys.exit("Brug: python3 convert_fbref_xls.py <input.xls> <liganavn> <output.csv>")

    input_path, league_name, output_path = sys.argv[1:4]

    with open(input_path, encoding="utf-8") as f:
        html = f.read()

    matches = parse_rows(html, league_name)
    if not matches:
        sys.exit(f"Fandt ingen rækker med Round == {league_name!r}. Tjek liganavnet i filen.")

    matches.sort(key=lambda m: m["dato"])

    fieldnames = ["dato", "runde", "hjemmehold", "udehold", "hjemmemaal", "udemaal", "tilskuere", "stadion"]
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(matches)

    print(f"Skrev {len(matches)} rækker til {output_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
