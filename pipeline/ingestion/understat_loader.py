"""Understat xG backfill for historical_matches.

One request per season: the Understat league page embeds ``datesData``
(every match of the season with home/away xG). Matches are joined to
existing historical_matches rows by season + date (+-3 days) + fuzzy
team-name match, then home_xg/away_xg are updated in place.

Usage
-----
    python -m ingestion.understat_loader                 # all default seasons
    python -m ingestion.understat_loader --only 2022 2025
"""

from __future__ import annotations

import argparse
import difflib
import logging
import re
import time
import unicodedata
from datetime import timedelta

import pandas as pd
import requests

from db.connection import fetch_all, transaction

log = logging.getLogger("understat")

BASE = "https://understat.com/league/La_liga/{year}"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Referer": "https://understat.com/league/La_liga/2024",
    "X-Requested-With": "XMLHttpRequest",
}
DEFAULT_YEARS = [2022, 2023, 2024, 2025, 2026]  # season start years

# football-data.co.uk name (normalized) -> Understat title (normalized)
NAME_OVERRIDES = {
    "ath madrid": "atletico madrid",
    "ath bilbao": "athletic club",
    "sociedad": "real sociedad",
    "betis": "real betis",
    "vallecano": "rayo vallecano",
    "celta": "celta vigo",
    "espanol": "espanyol",
    "alaves": "deportivo alaves",
    "valladolid": "real valladolid",
    "mallorca": "rcd mallorca",
    "las palmas": "las palmas",
}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z]", "", s.lower())


def _fetch_season(year: int) -> list[dict]:
    url = f"https://understat.com/getLeagueData/La_liga/{year}"
    last_err: Exception | None = None
    for attempt in range(4):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=60)
            resp.raise_for_status()
            data = resp.json()["dates"]
            log.info("Understat %d/%d: %d matches parsed", year, year + 1, len(data))
            return data
        except (requests.RequestException, ValueError, KeyError) as e:
            last_err = e
            wait = 5 * (attempt + 1)
            log.warning("Fetch %s failed (attempt %d/4): %s — retrying in %ds", url, attempt + 1, e, wait)
            time.sleep(wait)
    raise RuntimeError(f"Failed to fetch {url}") from last_err


def _match_db_teams(db_df: pd.DataFrame, us_titles: set[str]) -> dict[str, str]:
    """Map normalized DB team names -> normalized Understat titles."""
    db_names = {_norm(t) for t in pd.concat([db_df["home_team"], db_df["away_team"]]).unique()}
    us_norms = {_norm(t) for t in us_titles}

    mapping: dict[str, str] = {}
    override_norm = {_norm(k): v for k, v in NAME_OVERRIDES.items()}
    for db in db_names:
        if db in override_norm and _norm(override_norm[db]) in us_norms:
            mapping[db] = _norm(override_norm[db])
            continue
        close = difflib.get_close_matches(db, sorted(us_norms), n=1, cutoff=0.55)
        if close:
            mapping[db] = close[0]
        else:
            log.warning("No Understat match found for DB team '%s'", db)
    return mapping


def backfill_season(year: int) -> int:
    fixtures = _fetch_season(year)
    time.sleep(3)

    season_label = f"{year}/{year + 1}"

    db_rows = fetch_all(
        "SELECT id, match_date, home_team, away_team FROM historical_matches "
        "WHERE competition = 'La Liga' AND season = %s",
        (season_label,),
    )
    if not db_rows:
        log.warning("No DB rows for %s — skipping", season_label)
        return 0
    db_df = pd.DataFrame(db_rows)
    db_df["ndate"] = pd.to_datetime(db_df["match_date"])
    us_titles = {fx["h"]["title"] for fx in fixtures} | {fx["a"]["title"] for fx in fixtures}
    team_map = _match_db_teams(db_df, us_titles)

    updates: list[tuple[float, float, str]] = []
    used_ids: set[str] = set()
    for fx in fixtures:
        try:
            fx_date = pd.to_datetime(fx["datetime"])
            hxg, axg = float(fx["xG"]["h"]), float(fx["xG"]["a"])
        except (KeyError, TypeError, ValueError):
            continue
        h_norm = _norm(fx["h"]["title"])
        a_norm = _norm(fx["a"]["title"])

        candidates = db_df[
            (db_df["ndate"] - fx_date).abs() <= timedelta(days=3)
        ]
        row = None
        for _, r in candidates.iterrows():
            rh = _norm(r["home_team"])
            ra = _norm(r["away_team"])
            rh_mapped = team_map.get(rh, rh)
            ra_mapped = team_map.get(ra, ra)
            if h_norm == rh_mapped and a_norm == ra_mapped and r["id"] not in used_ids:
                row = r
                break
        if row is None:
            log.debug("Unmatched fixture: %s vs %s (%s)", fx["h"]["title"], fx["a"]["title"], fx_date.date())
            continue
        used_ids.add(row["id"])
        updates.append((hxg, axg, row["id"]))

    with transaction() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                "UPDATE historical_matches SET home_xg = %s, away_xg = %s WHERE id = %s",
                updates,
            )
    log.info("%s/%d: matched %d/%d DB rows with xG", year, (year + 1) % 100, len(updates), len(db_rows))
    return len(updates)


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill xG from Understat")
    parser.add_argument("--only", nargs="*", type=int, help="Season start years, e.g. --only 2024 2025")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s %(message)s")

    years = args.only or DEFAULT_YEARS
    total = sum(backfill_season(y) for y in years)
    log.info("Total matches updated with xG: %d", total)


if __name__ == "__main__":
    main()
