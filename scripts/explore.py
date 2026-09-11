"""One-off exploration script: dumps the HTML structure of candidate
superstats.dk pages so we can figure out real selectors before writing
the real scraper. Meant to be run once via the explore.yml workflow and
then deleted once scraper.py is working.
"""
import sys

import requests
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tilskuerstats-explorer/1.0)"}

CANDIDATE_URLS = [
    "https://superstats.dk/program?aar=2024%2F2025&tur=1",
    "https://superstats.dk/program?aar=2024/2025",
    "https://superstats.dk/program",
    "https://superstats.dk/",
]


def dump(url: str) -> None:
    print("=" * 100)
    print("URL:", url)
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
    except Exception as exc:
        print("REQUEST FAILED:", exc)
        return
    print("status:", resp.status_code, "final url:", resp.url)
    if resp.status_code != 200:
        print(resp.text[:500])
        return

    soup = BeautifulSoup(resp.text, "html.parser")
    title = soup.find("title")
    print("title:", title.get_text(strip=True) if title else None)

    tables = soup.find_all("table")
    print(f"found {len(tables)} <table> elements")
    for i, table in enumerate(tables[:5]):
        print(f"--- table {i} ---")
        print("classes/id:", table.get("class"), table.get("id"))
        rows = table.find_all("tr")
        print(f"  {len(rows)} rows")
        for row in rows[:4]:
            cells = row.find_all(["th", "td"])
            texts = [c.get_text(strip=True) for c in cells]
            print("   row:", texts)

    # Look for links that might point to season/tournament selectors or match pages
    interesting_links = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if any(k in href.lower() for k in ["program", "kamp", "tilskuer", "aar", "superliga"]):
            interesting_links.add(href)
    print(f"interesting links ({len(interesting_links)}):")
    for link in sorted(interesting_links)[:40]:
        print("  ", link)

    # Dump any <select> / <option> that might encode season or division ids
    for select in soup.find_all("select"):
        print("select name=", select.get("name"), "id=", select.get("id"))
        for opt in select.find_all("option")[:20]:
            print("   option:", opt.get("value"), "->", opt.get_text(strip=True))


if __name__ == "__main__":
    for url in CANDIDATE_URLS:
        dump(url)
        sys.stdout.flush()
