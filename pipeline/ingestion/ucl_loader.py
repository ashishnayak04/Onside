"""UEFA Champions League history loader via fixturedownload.com.

football-data.co.uk has no UCL division, so historical results come from
fixturedownload.com's JSON feeds (one request per season, complete results
including both legs of knockout ties). Six seasons are available
(2020/21 - 2025/26 at time of writing).

Rows upsert into ``historical_matches`` with competition = 'Champions League'.
Spanish clubs are renamed to football-data.co.uk conventions ('Ath Madrid',
'Sociedad', ...) so cross-competition joins and shared team strengths work;
obvious cross-season spelling variants of other clubs are canonicalized too.

Usage
-----
    python -m ingestion.ucl_loader                 # all default seasons
    python -m ingestion.ucl_loader --only 2024 2025
"""

from __future__ import annotations

import argparse
import logging
import time
import unicodedata

import requests

import pandas as pd

from db.connection import execute_many, fetch_one
from ingestion.football_data_loader import _ensure_schema

log = logging.getLogger("ucl_loader")

COMPETITION = "Champions League"
BASE_URL = "https://fixturedownload.com/feed/json/champions-league-{year}"
DEFAULT_YEARS = [2020, 2021, 2022, 2023, 2024, 2025]  # season start years

# fixturedownload name (normalized) -> football-data.co.uk / canonical name
NAME_MAP = {
    "atletico": "Ath Madrid",
    "atletico de madrid": "Ath Madrid",
    "atleti": "Ath Madrid",
    "athletic club": "Ath Bilbao",
    "real sociedad": "Sociedad",
    "b dortmund": "Dortmund",
    "bayern munchen": "Bayern",
    "internazionale": "Inter",
    "man city": "Man City",
    "man united": "Man United",
}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(s.lower().split())


def canonical_name(name: str) -> str:
    n = _norm(name)
    mapped = NAME_MAP.get(n)
    if mapped:
        return mapped
    log.debug("No canonical mapping for '%s' — storing as-is", name)
    return name.strip()


def _fetch_year(year: int) -> list[dict]:
    url = BASE_URL.format(year=year)
    last_err: Exception | None = None
    for attempt in range(4):
        try:
            resp = requests.get(url, timeout=60,
                                headers={"User-Agent": "onside-pipeline/0.1"})
            resp.raise_for_status()
            data = resp.json()
            if not isinstance(data, list):
                raise ValueError("unexpected payload shape")
            log.info("%d/%d: %d fixtures fetched", year, year + 1, len(data))
            return data
        except (requests.RequestException, ValueError) as e:
            last_err = e
            wait = 5 * (attempt + 1)
            log.warning("Fetch %s failed (attempt %d/4): %s — retrying in %ds",
                        url, attempt + 1, e, wait)
            time.sleep(wait)
    raise RuntimeError(f"Failed to fetch {url}") from last_err


UPSERT_SQL = """
INSERT INTO historical_matches
    (statsbomb_match_id, competition, season, match_date,
     home_team, away_team, home_score, away_score, source)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (statsbomb_match_id) DO UPDATE SET
    home_team = EXCLUDED.home_team,
    away_team = EXCLUDED.away_team,
    home_score = EXCLUDED.home_score,
    away_score = EXCLUDED.away_score,
    loaded_at = NOW()
"""


def load_year(year: int) -> int:
    season_label = f"{year}/{year + 1}"
    fixtures = _fetch_year(year)

    rows: list[tuple] = []
    skipped = 0
    for fx in fixtures:
        try:
            score_h = fx["HomeTeamScore"]
            score_a = fx["AwayTeamScore"]
            if score_h is None or score_a is None:
                skipped += 1
                continue
            rows.append((
                f"ucl:fxdl:{year}:{int(fx['MatchNumber'])}",
                COMPETITION,
                season_label,
                pd.to_datetime(fx["DateUtc"]).date(),
                canonical_name(fx["HomeTeam"]),
                canonical_name(fx["AwayTeam"]),
                int(score_h),
                int(score_a),
                "fixturedownload.com",
            ))
        except (KeyError, TypeError, ValueError) as e:
            log.warning("Skipping malformed fixture %s: %s", fx.get("MatchNumber"), e)
            skipped += 1

    if not rows:
        log.warning("%s: nothing to load", season_label)
        return 0

    execute_many(UPSERT_SQL, rows)
    total = fetch_one(
        "SELECT COUNT(*) AS cnt FROM historical_matches WHERE competition = %s AND season = %s",
        (COMPETITION, season_label),
    )
    log.info("%s: loaded %d rows (%d unscored/malformed skipped), DB total %s",
             season_label, len(rows), skipped, total["cnt"] if total else "?")
    return len(rows)


def load_all(years: list[int] | None = None) -> dict[str, int]:
    _ensure_schema()
    years = years or DEFAULT_YEARS
    results = {f"{y}/{y + 1}": load_year(y) for y in sorted(years)}
    grand = fetch_one(
        "SELECT COUNT(*) AS cnt FROM historical_matches WHERE competition = %s",
        (COMPETITION,),
    )
    log.info("UCL total in DB: %s", grand["cnt"] if grand else 0)
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Load UCL history from fixturedownload.com")
    parser.add_argument("--only", nargs="*", type=int,
                        help="Season start years, e.g. --only 2024 2025")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(name)s] %(levelname)s %(message)s")

    load_all(args.only)


if __name__ == "__main__":
    main()
