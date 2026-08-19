"""Load StatsBomb open-data match summaries into ``historical_matches``.

StatsBomb publish free event-level data on GitHub:
  https://github.com/statsbomb/open-data

This loader only pulls the **match-level** files (not full event streams)
to keep things fast.  It downloads JSON from the raw GitHub URLs, caches
them locally under ``pipeline/data/statsbomb/``, and inserts into the
``historical_matches`` table.

Usage
-----
    python -m ingestion.statsbomb_loader              # all configured competitions
    python -m ingestion.statsbomb_loader --seasons 3   # last 3 seasons only
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import date
from pathlib import Path
from typing import Any

import requests

# ---------------------------------------------------------------------------
# StatsBomb open-data competition / season IDs
# Source: https://github.com/statsbomb/open-data/blob/master/data/competitions.json
# ---------------------------------------------------------------------------
COMPETITIONS: dict[str, dict[str, int | str]] = {
    "La Liga": {
        "competition_id": 11,
        "seasons": {
            "2020/2021": 90,
            "2021/2022": 42,
            "2022/2023": 43,
        },
    },
    "UEFA Champions League": {
        "competition_id": 7,
        "seasons": {
            "2020/2021": 90,
            "2021/2022": 42,
            "2022/2023": 43,
        },
    },
}

RAW_BASE = "https://raw.githubusercontent.com/statsbomb/open-data/master/data"
CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "statsbomb"

log = logging.getLogger("statsbomb_loader")


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _get_json(url: str, cache_path: Path) -> Any:
    """GET a JSON resource, caching to *cache_path* on first fetch."""
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    log.info("Downloading %s", url)
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    cache_path.write_text(resp.text, encoding="utf-8")
    return resp.json()


def _fetch_matches(competition_id: int, season_id: int) -> list[dict]:
    url = f"{RAW_BASE}/matches/{competition_id}/{season_id}.json"
    cache = CACHE_DIR / str(competition_id) / str(season_id) / "matches.json"
    return _get_json(url, cache)


# ------------------------------------------------------------------
# DB inserts
# ------------------------------------------------------------------

_INSERT_SQL = """
INSERT INTO historical_matches
    (statsbomb_match_id, competition, season, match_date,
     home_team, away_team, home_score, away_score,
     home_xg, away_xg, referee, venue)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (statsbomb_match_id) DO UPDATE SET
    home_score   = EXCLUDED.home_score,
    away_score   = EXCLUDED.away_score,
    home_xg      = EXCLUDED.home_xg,
    away_xg      = EXCLUDED.away_xg,
    loaded_at    = NOW()
"""


def _parse_match(m: dict, competition_name: str, season_name: str) -> tuple:
    """Extract a row tuple from a StatsBomb match dict."""
    match_id = str(m["match_id"])

    # Teams
    home_team = m["home_team"]["home_team_name"]
    away_team = m["away_team"]["away_team_name"]

    # Score
    home_score = m["home_score"]
    away_score = m["away_score"]

    # Date — StatsBomb uses "YYYY-MM-DD" or full datetime strings
    match_date_str: str = m.get("match_date", "")
    if "T" in match_date_str:
        match_date_str = match_date_str.split("T")[0]
    match_date = date.fromisoformat(match_date_str) if match_date_str else date.today()

    # xG — only present on some seasons
    home_xg: float | None = None
    away_xg: float | None = None
    if "home_team_stats" in m:
        home_xg = m["home_team_stats"].get("xg")
    if "away_team_stats" in m:
        away_xg = m["away_team_stats"].get("xg")

    referee = None
    if m.get("referee"):
        referee = m["referee"].get("name") if isinstance(m["referee"], dict) else str(m["referee"])

    venue = m.get("stadium", {}).get("name") if isinstance(m.get("stadium"), dict) else m.get("venue")

    return (
        match_id,
        competition_name,
        season_name,
        match_date,
        home_team,
        away_team,
        home_score,
        away_score,
        home_xg,
        away_xg,
        referee,
        venue,
    )


# ------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------

def load_competition(
    competition_name: str,
    seasons: dict[str, int] | None = None,
    *,
    max_seasons: int | None = None,
) -> int:
    """Load one competition into historical_matches.  Returns row count."""
    comp = COMPETITIONS[competition_name]
    comp_id = comp["competition_id"]
    available_seasons: dict[str, int] = comp["seasons"]

    if seasons is None:
        seasons = available_seasons
    else:
        # Only keep seasons that StatsBomb actually covers
        seasons = {k: v for k, v in seasons.items() if v in available_seasons.values()}

    # Optionally limit to most recent N seasons
    if max_seasons is not None:
        sorted_seasons = sorted(seasons.items(), key=lambda x: x[1], reverse=True)
        seasons = dict(sorted_seasons[:max_seasons])

    total = 0
    from db.connection import execute_many

    for season_name, season_id in sorted(seasons.items(), key=lambda x: x[1]):
        log.info("Loading %s / %s (competition_id=%d, season_id=%d)",
                 competition_name, season_name, comp_id, season_id)
        try:
            matches = _fetch_matches(comp_id, season_id)
        except requests.HTTPError as exc:
            log.warning("Could not fetch %s/%s: %s — skipping", competition_name, season_name, exc)
            continue

        rows = [_parse_match(m, competition_name, season_name) for m in matches]
        if rows:
            execute_many(_INSERT_SQL, rows)
            log.info("  Inserted %d matches for %s / %s", len(rows), competition_name, season_name)
            total += len(rows)
        else:
            log.warning("  No matches found for %s / %s", competition_name, season_name)

    return total


def load_all(*, max_seasons: int | None = None) -> dict[str, int]:
    """Load all configured competitions.  Returns {competition: rows_inserted}."""
    results: dict[str, int] = {}
    for name in COMPETITIONS:
        results[name] = load_competition(name, max_seasons=max_seasons)
    return results


# ------------------------------------------------------------------
# CLI entry point
# ------------------------------------------------------------------

def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Load StatsBomb historical data")
    parser.add_argument("--seasons", type=int, default=None,
                        help="Only load the most recent N seasons per competition")
    parser.add_argument("--competition", type=str, default=None,
                        help="Load only one competition (e.g. 'La Liga')")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    # Run schema migration first
    _ensure_schema()

    if args.competition:
        if args.competition not in COMPETITIONS:
            log.error("Unknown competition '%s'. Choose from: %s",
                      args.competition, list(COMPETITIONS.keys()))
            sys.exit(1)
        n = load_competition(args.competition, max_seasons=args.seasons)
        print(f"\n{args.competition}: loaded {n} historical matches")
    else:
        results = load_all(max_seasons=args.seasons)
        for name, count in results.items():
            print(f"  {name}: {count} matches")
        total = sum(results.values())
        print(f"\nTotal: {total} historical matches loaded")


def _ensure_schema() -> None:
    """Apply schema_additions.sql if the historical_matches table doesn't exist."""
    import psycopg2
    from db.connection import get_conn, fetch_one

    existing = fetch_one(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'historical_matches'"
    )
    if existing:
        log.info("historical_matches table already exists — skipping migration")
        return

    sql_path = Path(__file__).resolve().parent.parent / "db" / "schema_additions.sql"
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql_path.read_text(encoding="utf-8"))
        conn.commit()
        log.info("Created historical_matches table")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
