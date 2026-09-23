from pathlib import Path

from tilskuerstats.scraper import parse_program, season_year

FIXTURE = Path(__file__).parent / "fixtures" / "program_snippet.html"


def test_parses_real_superstats_markup():
    matches = parse_program(FIXTURE.read_text(encoding="utf-8"), "2024/2025")
    assert len(matches) == 6
    first = matches[0]
    assert (first.id, first.round, first.kickoff) == (6654, 1, "2024-07-19T18:00")
    assert (first.home, first.away, first.home_goals, first.away_goals) == ("AGF", "FCM", 1, 1)
    assert first.attendance == 12456


def test_padded_team_codes_and_spring_dates():
    html = (
        "<tr> <th class='leftalign' colspan='2'>Runde 12</th>\n"
        "<tr> <td class='leftalign'> Søn <td class='leftalign'> 13/04 16:00 "
        "<td class='leftalign'>  OB-SJF <td class='leftalign'> <a href='/kampe/6908'> 1-1 </a> "
        "<td class='rightalign'>  9.159 <td class='leftalign'>\n"
        # Ikke spillet endnu: intet link og intet tilskuertal -> springes over
        "<tr> <td class='leftalign'> Søn <td class='leftalign'> 20/04 16:00 "
        "<td class='leftalign'> FCK-BIF <td class='leftalign'>  <td class='rightalign'>  <td class='leftalign'>\n"
    )
    [match] = parse_program(html, "2024/2025")
    assert (match.home, match.away, match.round) == ("OB", "SJF", 12)
    assert match.kickoff == "2025-04-13T16:00"
    assert match.attendance == 9159


def test_season_year():
    assert season_year("2024/2025", 7) == 2024
    assert season_year("2024/2025", 12) == 2024
    assert season_year("2024/2025", 5) == 2025
