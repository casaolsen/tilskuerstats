from tilskuerstats.verify import parse_danish_number, ungrounded_numbers


def test_parse_danish_numbers():
    assert parse_danish_number("12.456") == (12456, 0)
    assert parse_danish_number("23,4") == (23.4, 1)
    assert parse_danish_number("1.234,5") == (1234.5, 1)
    assert parse_danish_number("3") == (3, 0)


RESULT = {
    "match": {"kickoff": "2025-07-20T14:00", "score": "2-1", "attendance": 19500},
    "pct_vs_mean": -23.4,
    "rank_highest_first": 1,
}


def test_numbers_from_results_are_grounded():
    text = "AGF-Brøndby (2-1) samlede 19.500 tilskuere, 23,4 % under snittet, den 20/7 2025."
    assert ungrounded_numbers(text, [RESULT]) == []


def test_rounding_is_allowed():
    assert ungrounded_numbers("hele 23 % færre", [RESULT]) == []


def test_invented_numbers_are_caught():
    assert ungrounded_numbers("Hele 20.000 kom, 30 % flere", [RESULT]) == ["20.000", "30"]
