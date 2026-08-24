"""Football-data.co.uk loader — full-league La Liga history into historical_matches.

Downloads season CSVs (results, match stats, closing odds) and upserts them
into ``historical_matches``. Replaces the partial StatsBomb coverage as the
training/backtest source.

Usage
-----
    python -m ingestion.football_data_loader                 # all default seasons
    python -m ingestion.football_data_loader --only 2223 2627
"""

from __future__ import annotations

import argparse
import logging

import pandas as pd
import requests

from db.connection import execute_many, fetch_one, transaction

log = logging.getLogger("football_data")

BASE_URL = "https://www.football-data.co.uk/mmz4281/{code}/SP1.csv"

DEFAULT_SEASONS: dict[str, str] = {
    "2022/2023": "2223",
    "2023/2024": "2324",
    "2024/2025": "2425",
    "2025/2026": "2526",
    "2026/2027": "2627",
}

COMPETITION = "La Liga"


def _ensure_schema() -> None:
    """Add odds columns used by this loader (idempotent)."""
    with transaction() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                ALTER TABLE historical_matches
                    ADD COLUMN IF NOT EXISTS odds_home REAL,
                    ADD COLUMN IF NOT EXISTS odds_draw REAL,
                    ADD COLUMN IF NOT EXISTS odds_away REAL,
                    ADD COLUMN IF NOT EXISTS home_shots REAL,
                    ADD COLUMN IF NOT EXISTS away_shots REAL,
                    ADD COLUMN IF NOT EXISTS home_sot REAL,
                    ADD COLUMN IF NOT EXISTS away_sot REAL,
                    ADD COLUMN IF NOT EXISTS source VARCHAR(50)
            """)
    log.info("historical_matches schema ready")


def _fetch_csv(season_code: str) -> pd.DataFrame | None:
    url = BASE_URL.format(code=season_code)
    resp = requests.get(url, timeout=60)
    if resp.status_code != 200:
        log.warning("Could not fetch %s (HTTP %d) — skipping", url, resp.status_code)
        return None
    import io

    return pd.read_csv(io.StringIO(resp.text))


def _external_id(season: str, row: pd.Series) -> str:
    return f"fd:{season}:{row['Date']}:{row['HomeTeam']}:{row['AwayTeam']}"


def _rows_from_df(df: pd.DataFrame, season: str) -> list[tuple]:
    df = df.dropna(subset=["HomeTeam", "AwayTeam", "FTHG", "FTAG", "Date"])
    df["Date"] = pd.to_datetime(df["Date"], dayfirst=True, errors="coerce")
    df = df.dropna(subset=["Date"])

    rows: list[tuple] = []
    for _, r in df.iterrows():
        def num(col: str) -> float | None:
            v = r.get(col)
            try:
                f = float(v)
                return f if f > 0 else None
            except (TypeError, ValueError):
                return None

        ext_id = _external_id(season, r)
        rows.append((
            ext_id,                       # stored in statsbomb_match_id (unique key)
            COMPETITION,
            season,
            r["Date"].date(),
            str(r["HomeTeam"]).strip(),
            str(r["AwayTeam"]).strip(),
            int(r["FTHG"]),
            int(r["FTAG"]),
            num("AvgCH") or num("AvgH"),  # closing market avg, fallback opening
            num("AvgCD") or num("AvgD"),
            num("AvgCA") or num("AvgA"),
            num("HS"),
            num("AS"),
            num("HST"),
            num("AST"),
            "football-data.co.uk",
        ))
    return rows


UPSERT_SQL = """
INSERT INTO historical_matches
    (statsbomb_match_id, competition, season, match_date,
     home_team, away_team, home_score, away_score,
     odds_home, odds_draw, odds_away,
     home_shots, away_shots, home_sot, away_sot, source)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (statsbomb_match_id) DO UPDATE SET
    home_score = EXCLUDED.home_score,
    away_score = EXCLUDED.away_score,
    odds_home = EXCLUDED.odds_home,
    odds_draw = EXCLUDED.odds_draw,
    odds_away = EXCLUDED.odds_away,
    home_shots = EXCLUDED.home_shots,
    away_shots = EXCLUDED.away_shots,
    home_sot = EXCLUDED.home_sot,
    away_sot = EXCLUDED.away_sot,
    loaded_at = NOW()
"""


def load_season(season: str, code: str) -> int:
    df = _fetch_csv(code)
    if df is None:
        return 0
    rows = _rows_from_df(df, season)
    if not rows:
        log.warning("No parseable rows for %s", season)
        return 0
    execute_many(UPSERT_SQL, rows)

    existing = fetch_one(
        "SELECT COUNT(*) AS cnt FROM historical_matches WHERE competition = %s AND season = %s",
        (COMPETITION, season),
    )
    count = existing["cnt"] if existing else len(rows)
    log.info("Loaded %s: %d matches in DB", season, count)
    return count


def load_all(seasons: dict[str, str] | None = None) -> dict[str, int]:
    _ensure_schema()
    seasons = seasons or DEFAULT_SEASONS
    results = {season: load_season(season, code) for season, code in sorted(seasons.items())}
    total_row = fetch_one("SELECT COUNT(*) AS cnt FROM historical_matches")
    log.info("Total historical_matches rows: %d", total_row["cnt"] if total_row else 0)
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Load football-data.co.uk La Liga history")
    parser.add_argument("--only", nargs="*", metavar="CODE",
                        help="Season codes to load, e.g. --only 2223 2627")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s %(message)s")

    seasons = DEFAULT_SEASONS
    if args.only:
        reverse = {v: k for k, v in DEFAULT_SEASONS.items()}
        unknown = [c for c in args.only if c not in reverse]
        if unknown:
            parser.error(f"Unknown season codes: {unknown}. Known: {sorted(reverse)}")
        seasons = {reverse[c]: c for c in args.only}

    load_all(seasons)


if __name__ == "__main__":
    main()
