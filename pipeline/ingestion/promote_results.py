"""Promote finished live matches into the historical training table.

The key missing piece of the self-learning loop: finished ``matches`` rows
(which flow in live via football-data.org / API-Football) never made it into
``historical_matches`` — the table the Dixon-Coles and feature models train on.
The CI job runs ``--skip-historical`` and step 1 skips when the table is
non-empty, so the training data was frozen at whatever a human last loaded.

This module copies finished, scored matches from ``matches`` into
``historical_matches`` (canonical fit-time team names, competition + season
carried over), idempotently via a unique constraint on
(home_team, away_team, match_date, competition).

Usage
-----
    from ingestion.promote_results import promote_finished
    n = promote_finished()
"""

from __future__ import annotations

import logging

from db.connection import execute, execute_many, fetch_all, fetch_one, transaction

from mapping.team_registry import resolve_fit_name

log = logging.getLogger("promote_results")


# Unique constraint ensures reruns never double-insert.
UNIQUE_SQL = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_historical_match'
          AND conrelid = 'historical_matches'::regclass
    ) THEN
        ALTER TABLE historical_matches
            ADD CONSTRAINT uq_historical_match
            UNIQUE (home_team, away_team, match_date, competition);
    END IF;
END $$;
"""


def _ensure_constraint() -> None:
    execute(UNIQUE_SQL)


def _fit_names() -> list[str]:
    rows = fetch_all(
        "SELECT DISTINCT home_team AS team FROM historical_matches "
        "UNION SELECT DISTINCT away_team AS team FROM historical_matches"
    )
    return [r["team"] for r in rows if r["team"]]


def promote_finished() -> int:
    """Copy finished matches into historical_matches. Returns rows inserted."""
    _ensure_constraint()

    fit_names = _fit_names()

    rows: list[tuple] = []
    with transaction() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT m.id, m.competition, m.season, m.match_date,
                       ht.name AS home_team, at.name AS away_team,
                       m.home_score, m.away_score
                FROM matches m
                JOIN teams ht ON m.home_team_id = ht.id
                JOIN teams at ON m.away_team_id = at.id
                WHERE m.status = 'finished'
                  AND m.home_score IS NOT NULL
                  AND m.away_score IS NOT NULL
            """)
            candidates = cur.fetchall()

            for (match_id, comp, season, mdate, hname, aname,
                 hscore, ascore) in candidates:
                hm = resolve_fit_name(hname, fit_names)
                am = resolve_fit_name(aname, fit_names)
                mdate_obj = mdate.date() if hasattr(mdate, "date") else None
                if mdate_obj is None:
                    continue
                rows.append((
                    f"promoted:{match_id}",
                    comp if comp else "La Liga",
                    season,
                    mdate_obj,
                    hm,
                    am,
                    int(hscore),
                    int(ascore),
                    "live-finished",
                ))

    inserted = 0
    if rows:
        before = _total()
        execute_many(
            """
            INSERT INTO historical_matches
                (statsbomb_match_id, competition, season, match_date,
                 home_team, away_team, home_score, away_score, source)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (home_team, away_team, match_date, competition)
            DO UPDATE SET
                home_score = EXCLUDED.home_score,
                away_score = EXCLUDED.away_score,
                loaded_at = NOW()
            """,
            rows,
        )
        inserted = _total() - before

    existing_total = fetch_one("SELECT COUNT(*) AS cnt FROM historical_matches")
    log.info(
        "Promoted %d finished live match(es) into historical_matches "
        "(new total %s)", inserted,
        existing_total["cnt"] if existing_total else "?",
    )
    return inserted


def _total() -> int:
    row = fetch_one("SELECT COUNT(*) AS cnt FROM historical_matches")
    return int(row["cnt"]) if row else 0