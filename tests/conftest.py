import pytest

from tilskuerstats import db
from tilskuerstats.scraper import Match


def m(id, season, rnd, kickoff, home, away, att, hg=1, ag=0):
    return Match(id, season, rnd, kickoff, home, away, hg, ag, att)


@pytest.fixture
def conn():
    c = db.connect(":memory:")
    history = [
        m(1, "2024/2025", 1, "2024-07-20T18:00", "FCK", "AGF", 25000),
        m(2, "2024/2025", 1, "2024-07-21T14:00", "AGF", "BIF", 11000),
        m(3, "2024/2025", 2, "2024-07-27T18:00", "BIF", "FCK", 21000),
        m(4, "2024/2025", 2, "2024-07-28T14:00", "AGF", "FCK", 12000),
        m(5, "2024/2025", 3, "2024-08-03T18:00", "FCK", "BIF", 30000),
        m(6, "2024/2025", 3, "2024-08-04T14:00", "BIF", "AGF", 15000),
    ]
    new = [
        m(10, "2025/2026", 1, "2025-07-19T18:00", "FCK", "AGF", 26000),
        m(11, "2025/2026", 1, "2025-07-20T14:00", "AGF", "BIF", 19500),
        m(12, "2025/2026", 2, "2025-07-26T18:00", "BIF", "FCK", 20000),
    ]
    db.upsert_matches(c, history, baseline=True)
    db.upsert_matches(c, new)
    return c
