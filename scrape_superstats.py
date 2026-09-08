#!/usr/bin/env python3
"""Scraper til tilskuertal for Superligaen sæson 2024/25 fra superstats.dk.

Henter kampprogrammet (dato, hold, tilskuertal) og besøger hver enkelt
kampside for at hente stadionnavn. Output: CSV med kolonnerne
dato, hjemmehold, udehold, tilskuere, stadion.
"""

import csv
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://superstats.dk"
SEASON = "2024-2025"
PROGRAM_URL = f"{BASE_URL}/program?aar={SEASON}&sr=1"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tilskuerstats-scraper/1.0)"}
REQUEST_DELAY = 0.5  # sekunder mellem kald til kampsider, for ikke at belaste sitet

# Officielle klubnavne for holdene i Superligaen 2024/25.
# Forkortelserne bruges i kampprogrammet, superstats.dk viser ikke fulde
# navne der, så mapping er vedligeholdt manuelt her.
TEAM_NAMES = {
    "AGF": "AGF",
    "FCM": "FC Midtjylland",
    "FCN": "FC Nordsjælland",
    "AaB": "AaB",
    "SIF": "Silkeborg IF",
    "SJF": "SønderjyskE",
    "VB": "Vejle Boldklub",
    "RFC": "Randers FC",
    "VFF": "Viborg FF",
    "BIF": "Brøndby IF",
    "LBK": "Lyngby Boldklub",
    "FCK": "FC København",
}

DAY_ABBR = ("Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn")

# Sæsonen løber fra juli 2024 til maj 2025. Programsiden viser kun dag/måned,
# så vi udleder år ud fra måneden (jan-jun -> 2025, jul-dec -> 2024).
def infer_year(month: int) -> int:
    return 2025 if month <= 6 else 2024


def fetch(url: str) -> BeautifulSoup:
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    # superstats.dk's tabeller mangler lukketags (</tr>, </td>).
    # html.parser fejlfortolker det ved at neste alt under den første
    # celle, så lxml (som følger HTML5-parsingalgoritmen) er nødvendig
    # for at få de rigtige søskenderækker/-celler.
    return BeautifulSoup(resp.text, "lxml")


def parse_program(soup: BeautifulSoup):
    """Udtræk (match_id, dato, hjemme_kode, ude_kode, tilskuere) for hver kamp."""
    matches = []
    for row in soup.find_all("tr"):
        cells = row.find_all("td", recursive=False)
        if len(cells) < 5:
            continue
        day_text = cells[0].get_text(strip=True)
        if day_text not in DAY_ABBR:
            continue

        date_time = cells[1].get_text(strip=True)  # fx "19/07 18:00"
        date_match = re.match(r"(\d{2})/(\d{2})", date_time)
        if not date_match:
            continue
        day, month = int(date_match.group(1)), int(date_match.group(2))
        year = infer_year(month)
        iso_date = f"{year:04d}-{month:02d}-{day:02d}"

        teams_text = cells[2].get_text(strip=True)  # fx "AGF-FCM"
        team_parts = teams_text.split("-")
        if len(team_parts) != 2:
            continue
        home_code, away_code = team_parts[0].strip(), team_parts[1].strip()

        link = cells[3].find("a")
        if not link or "/kampe/" not in link.get("href", ""):
            continue
        match_id = link["href"].rstrip("/").split("/")[-1]

        attendance_text = cells[4].get_text(strip=True).replace(".", "")
        if not attendance_text.isdigit():
            continue
        attendance = int(attendance_text)

        matches.append(
            {
                "match_id": match_id,
                "dato": iso_date,
                "hjemme_kode": home_code,
                "ude_kode": away_code,
                "tilskuere": attendance,
            }
        )
    return matches


def fetch_stadium(match_id: str) -> str:
    soup = fetch(f"{BASE_URL}/kampe/{match_id}")
    link = soup.select_one("table#top a[href*='/stadion']")
    if link:
        return link.get_text(strip=True)
    return ""


def team_name(code: str) -> str:
    return TEAM_NAMES.get(code, code)


def main():
    print(f"Henter kampprogram: {PROGRAM_URL}", file=sys.stderr)
    program_soup = fetch(PROGRAM_URL)
    matches = parse_program(program_soup)
    print(f"Fandt {len(matches)} kampe.", file=sys.stderr)

    rows = []
    for i, m in enumerate(matches, start=1):
        stadion = fetch_stadium(m["match_id"])
        rows.append(
            {
                "dato": m["dato"],
                "hjemmehold": team_name(m["hjemme_kode"]),
                "udehold": team_name(m["ude_kode"]),
                "tilskuere": m["tilskuere"],
                "stadion": stadion,
            }
        )
        print(f"[{i}/{len(matches)}] {m['dato']} {m['hjemme_kode']}-{m['ude_kode']} -> {stadion}", file=sys.stderr)
        time.sleep(REQUEST_DELAY)

    rows.sort(key=lambda r: r["dato"])

    out_path = "tilskuertal_superligaen_2024_25.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["dato", "hjemmehold", "udehold", "tilskuere", "stadion"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Skrev {len(rows)} rækker til {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
