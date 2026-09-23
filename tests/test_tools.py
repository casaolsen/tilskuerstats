import pytest

from tilskuerstats import db, tools


def test_baseline_matches_are_not_new(conn):
    assert db.unanalyzed_match_ids(conn) == [10, 11, 12]
    assert tools.list_new_matches(conn)["count"] == 3


def test_compare_home_team_record(conn):
    # AGF 19.500 hjemme: klart højeste i AGF's historik (11.000, 12.000)
    r = tools.compare_attendance(conn, 11, "home_team_all")
    assert r["matches_in_group"] == 3
    assert r["rank_highest_first"] == 1
    assert r["is_highest_so_far"] is True
    assert r["previous_highest"]["attendance"] == 12000
    assert r["note"]  # lille gruppe advares


def test_compare_only_counts_matches_up_to_kickoff(conn):
    # Kamp 1 (første i databasen) må ikke sammenlignes med senere kampe
    r = tools.compare_attendance(conn, 1, "league_all")
    assert r["matches_in_group"] == 1
    assert r["previous_highest"] is None


def test_compare_rejects_unknown_scope(conn):
    with pytest.raises(ValueError):
        tools.compare_attendance(conn, 11, "galaxy")


def test_team_trend_same_point_last_season(conn):
    r = tools.team_attendance_trend(conn, "AGF", "2025/2026")
    assert r["home_matches_played"] == 1
    assert r["previous_season_avg_same_point"] == 11000
    assert r["pct_vs_previous_season_same_point"] == 77.3


def test_season_overview_like_for_like(conn):
    r = tools.season_overview(conn, "2025/2026")
    assert r["up_to_round"] == 2
    assert r["current"]["total_attendance"] == 65500
    assert r["previous_same_rounds"]["total_attendance"] == 69000  # kun runde 1-2
    assert r["pct_change_total_attendance"] == -5.1


def test_round_summary(conn):
    r = tools.round_summary(conn, "2025/2026", 1)
    assert r["total_attendance"] == 45500
    assert r["rank_of_round_by_avg"] == 1


def test_every_schema_has_a_handler():
    names = {s["name"] for s in tools.TOOL_SCHEMAS}
    assert names - {"submit_draft"} == set(tools.DATA_TOOLS)
