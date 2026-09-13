"""Onside prediction pipeline orchestrator.

Single entrypoint that runs the full pipeline:
  1. Load historical data (StatsBomb) if needed
  2. Ingest live fixtures (API-Football) if key is configured
  3. Build features for upcoming matches
  4. Run Dixon-Coles model
  5. Write predictions to DB
  6. Sync track record for finished matches

Usage
-----
    python run_pipeline.py                     # full pipeline
    python run_pipeline.py --skip-historical   # skip step 1
    python run_pipeline.py --backtest          # run backtest only
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Ensure pipeline/ is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db.connection import fetch_all, fetch_one, execute

log = logging.getLogger("pipeline")


# ===================================================================
# Step 1: Historical data
# ===================================================================

def step_load_historical(max_seasons: int | None = None) -> dict:
    """Load StatsBomb historical data."""
    from ingestion.statsbomb_loader import load_all, _ensure_schema

    log.info("=" * 60)
    log.info("STEP 1: Loading historical data from StatsBomb")
    log.info("=" * 60)

    _ensure_schema()

    # Check if we already have data
    existing = fetch_one("SELECT COUNT(*) AS cnt FROM historical_matches")
    if existing and existing["cnt"] > 0:
        log.info("Already have %d historical matches — skipping download", existing["cnt"])
        return {"status": "skipped", "count": existing["cnt"]}

    results = load_all(max_seasons=max_seasons)
    total = sum(results.values())
    return {"status": "loaded", "count": total, "by_competition": results}


# ===================================================================
# Step 2: Live data ingestion
# ===================================================================

def _config_value(key: str) -> str:
    """Read a config value from env or system_config table."""
    import os

    env = os.environ.get(key)
    if env:
        return env
    row = fetch_one("SELECT value FROM system_config WHERE key = %s", (key.lower(),))
    return row["value"] if row and row["value"] else ""


def step_ingest_live() -> dict:
    """Ingest current-season fixtures.

    Primary source is football-data.org (recommended free current-season API).
    Falls back to API-Football when no football-data.org token is configured.
    """
    log.info("=" * 60)
    log.info("STEP 2: Ingesting live fixtures (football-data.org, fallback API-Football)")
    log.info("=" * 60)

    if _config_value("FOOTBALL_DATA_ORG_KEY"):
        from ingestion.football_data_org_loader import run as fdorg_run

        results = fdorg_run()
        if results:
            ok = {c: r.get("count", 0) for c, r in results.items() if "error" not in r}
            errs = {c: r["error"] for c, r in results.items() if "error" in r}
            if ok:
                return {"status": "ingested", "source": "football-data.org", "results": ok, "errors": errs}
        log.warning("football-data.org ingestion produced no results — falling back to API-Football")
    else:
        log.warning("football-data.org token not configured — using API-Football fallback")

    from ingestion.api_football_loader import run as ingest_live_run, LEAGUE_ID_LA_LIGA, LEAGUE_ID_UCL

    if not _config_value("API_FOOTBALL_KEY"):
        log.warning("API-Football key not configured either — skipping live ingestion")
        return {"status": "skipped", "reason": "no_api_key"}

    results = {}
    for label, league_id in (("la_liga", LEAGUE_ID_LA_LIGA), ("ucl", LEAGUE_ID_UCL)):
        try:
            ingest_live_run(league_id=league_id)
            results[label] = "ok"
        except Exception as exc:
            log.error("Live ingestion failed for %s: %s", label, exc)
            results[label] = f"error: {exc}"
    return {"status": "ingested", "source": "api-football", "results": results}


# ===================================================================
# Step 3: Promote finished live matches into training history
# ===================================================================

def step_promote_finished() -> int:
    """Copy finished live matches into historical_matches so the model can
    learn from the current season (the self-improvement loop)."""
    from ingestion.promote_results import promote_finished

    log.info("=" * 60)
    log.info("STEP 3: Promoting finished live matches into training history")
    log.info("=" * 60)

    return promote_finished()


# ===================================================================
# Step 3b: Calibrate probabilities (temperature) on recent history
# ===================================================================

def step_calibrate_temperature() -> dict:
    """Learn the temperature that best calibrates probabilities on a held-out
    recent season and persist it, so live predictions are temperature-scaled."""
    from predict.calibrator import learn_temperature, store_temperature

    log.info("=" * 60)
    log.info("STEP 3b: Learning probability calibration (temperature)")
    log.info("=" * 60)

    t = learn_temperature()
    store_temperature(t)
    return {"temperature": t}


# ===================================================================
# Step 4: Build features
# ===================================================================

def step_build_features() -> list[dict]:
    """Build features for upcoming fixtures."""
    from features.build_features import build_features_for_fixture

    log.info("=" * 60)
    log.info("STEP 3: Building features for upcoming fixtures")
    log.info("=" * 60)

    # Get upcoming matches (scheduled, with team IDs)
    upcoming = fetch_all("""
        SELECT m.id, m.match_date, m.home_team_id, m.away_team_id,
               ht.name AS home_team, at.name AS away_team, m.competition, m.season
        FROM matches m
        JOIN teams ht ON m.home_team_id = ht.id
        JOIN teams at ON m.away_team_id = at.id
        WHERE m.status = 'scheduled'
          AND m.match_date > NOW()
        ORDER BY m.match_date ASC
        LIMIT 100
    """)

    if not upcoming:
        log.info("No upcoming fixtures found")
        return []

    # Load all historical matches for feature computation
    all_historical = fetch_all(
        "SELECT * FROM historical_matches ORDER BY match_date"
    )
    if not all_historical:
        log.warning("No historical data available for features")
        return []

    # Convert to a format compatible with features module
    import pandas as pd
    from predict.generator import resolve_fd_name

    hist_df = pd.DataFrame(all_historical)

    # Resolve current-season (fd.org) team names to the fd.co.uk names used in
    # historical_matches so rolling form / h2h / splits actually match rows.
    known_teams = sorted(
        set(hist_df["home_team"].tolist()) | set(hist_df["away_team"].tolist())
    )

    fixtures_with_features = []
    for match in upcoming:
        match_date = match["match_date"]
        if isinstance(match_date, str):
            match_date = datetime.fromisoformat(match_date.replace("Z", "+00:00"))

        home_fit = resolve_fd_name(match["home_team"], known_teams)
        away_fit = resolve_fd_name(match["away_team"], known_teams)

        features = build_features_for_fixture(
            hist_df,
            home_fit,
            away_fit,
            match_date,
            match.get("season"),
        )
        features["match_id"] = str(match["id"])
        features["home_team"] = match["home_team"]
        features["away_team"] = match["away_team"]
        features["match_date"] = match_date
        fixtures_with_features.append(features)

    log.info("Built features for %d upcoming fixtures", len(fixtures_with_features))
    return fixtures_with_features


# ===================================================================
# Step 4: Run model + write predictions
# ===================================================================

def step_predict_and_write(fixtures_with_features: list[dict]) -> int:
    """Write match predictions using the hybrid DC-SOT generator, then add player props."""
    from predict.generator import generate as generator_generate

    log.info("=" * 60)
    log.info("STEP 4: Running DC-SOT hybrid model and writing predictions")
    log.info("=" * 60)

    if not fixtures_with_features:
        log.info("No fixtures to predict")
        return 0

    # Delegate match-level predictions to the generator (DC-SOT hybrid with
    # recency). Wire the step-3 engineered features (rolling form, h2h, rest
    # days, splits) into the generator so each prediction's feature_snapshot
    # carries real explainability data instead of the bare model params.
    features_by_match = {
        str(f.get("match_id")): f for f in fixtures_with_features if f.get("match_id")
    }
    count = generator_generate(features_by_match=features_by_match)
    log.info("Generator wrote %d match predictions", count)

    if count == 0:
        return 0

    # Player props via the backtest-validated xG-share method (Understat).
    # Supersedes the former naive position-cap heuristic. If Understat is
    # unreachable the match predictions still succeed — we just log and skip.
    from predict.player_props import fetch_players
    from predict.player_props_sync import sync_players, write_props_for_predictions

    # Understat season-start year for the current season (e.g. 2026 -> 2026/27).
    season_year = timezone_now().year

    preds_without_players = fetch_all("""
        SELECT p.id AS prediction_id, p.predicted_home_score, p.predicted_away_score,
               ht.name AS home_team, at.name AS away_team
        FROM predictions p
        JOIN matches m ON p.match_id = m.id
        LEFT JOIN teams ht ON m.home_team_id = ht.id
        LEFT JOIN teams at ON m.away_team_id = at.id
        WHERE m.status = 'scheduled'
          AND NOT EXISTS (
              SELECT 1 FROM player_predictions pp WHERE pp.prediction_id = p.id
          )
    """)

    player_count = 0
    if preds_without_players:
        try:
            understat_players = fetch_players(season_year)
            player_index = sync_players(understat_players)
            player_count = write_props_for_predictions(
                understat_players, preds_without_players,
                player_index=player_index)
        except Exception as exc:
            log.error("Player props (xG-share) generation failed: %s", exc)

    log.info("Added player predictions for %d matches", player_count)
    return count


def timezone_now():
    return datetime.now(timezone.utc)


# ===================================================================
# Step 5: Sync track record
# ===================================================================

def step_sync_track_record() -> int:
    """Sync actual results for finished matches."""
    from db.write_predictions import sync_track_record

    log.info("=" * 60)
    log.info("STEP 5: Syncing track record")
    log.info("=" * 60)

    return sync_track_record()


# ===================================================================
# Step 5b: Reconcile external IDs (id_mapping)
# ===================================================================

def step_map_ids() -> dict:
    """Populate id_mapping (team/player) by name-matching across sources."""
    from mapping.id_mapper import run_mapping

    log.info("=" * 60)
    log.info("STEP 5b: Reconciling external IDs (id_mapping)")
    log.info("=" * 60)

    return run_mapping()


# ===================================================================
# Step 6: Calibration / feedback learning
# ===================================================================

def step_calibrate() -> dict:
    """Learn from past results to calibrate the outcome decision rule.

    Reads recent (probability, outcome) pairs from track_record, learns the
    draw bonus that best fits the model's own mistakes, and persists it so the
    next generator run labels matches (draws included) at realistic rates.
    """
    from predict.calibrator import learn_draw_bonus, store_draw_bonus

    log.info("=" * 60)
    log.info("STEP 6: Calibrating outcome decision from track record")
    log.info("=" * 60)

    bonus = learn_draw_bonus()
    store_draw_bonus(bonus)
    return {"draw_bonus": bonus}


# ===================================================================
# Main orchestrator
# ===================================================================

def run_pipeline(
    skip_historical: bool = False,
    skip_live: bool = False,
    backtest_only: bool = False,
) -> dict:
    """Run the full pipeline. Returns a summary dict."""
    start = time.time()
    summary: dict = {"steps": {}}

    if backtest_only:
        from backtest.validate_against_odds import run_backtest, print_report
        metrics = run_backtest()
        print_report(metrics)
        summary["backtest"] = metrics
        return summary

    # Pipeline run log — honest status for the admin page.
    run_id = None
    try:
        row = fetch_one(
            "INSERT INTO pipeline_runs (status, started_at) VALUES ('running', NOW()) RETURNING id"
        )
        run_id = row["id"] if row else None
    except Exception as exc:  # pragma: no cover - observability only, never fatal
        log.warning("Could not create pipeline_runs row: %s", exc)

    pred_count = None
    track_count = None
    fixtures_with_features: list[dict] = []

    # Step 1: Historical
    if not skip_historical:
        try:
            result = step_load_historical()
            summary["steps"]["historical"] = result
        except Exception as exc:
            log.error("Historical data loading failed: %s", exc)
            summary["steps"]["historical"] = {"status": "error", "error": str(exc)}
    else:
        summary["steps"]["historical"] = {"status": "skipped"}

    # Step 2: Live ingestion
    if not skip_live:
        try:
            result = step_ingest_live()
            summary["steps"]["live_ingestion"] = result
        except Exception as exc:
            log.error("Live ingestion failed: %s", exc)
            summary["steps"]["live_ingestion"] = {"status": "error", "error": str(exc)}
    else:
        summary["steps"]["live_ingestion"] = {"status": "skipped"}

    # Step 3: Promote finished live matches into training history
    # (the self-learning loop — model learns from the current season).
    try:
        promoted = step_promote_finished()
        summary["steps"]["promote_finished"] = {"promoted": promoted}
    except Exception as exc:
        log.error("Finished-match promotion failed: %s", exc)
        summary["steps"]["promote_finished"] = {"status": "error", "error": str(exc)}

    # Step 3b: Learn probability calibration (temperature) on recent history.
    try:
        t = step_calibrate_temperature()
        summary["steps"]["temperature"] = t
    except Exception as exc:
        log.error("Temperature calibration failed: %s", exc)
        summary["steps"]["temperature"] = {"status": "error", "error": str(exc)}

    # Step 4: Build features
    try:
        fixtures_with_features = step_build_features()
        summary["steps"]["features"] = {"count": len(fixtures_with_features)}
    except Exception as exc:
        log.error("Feature building failed: %s", exc)
        fixtures_with_features = []
        summary["steps"]["features"] = {"status": "error", "error": str(exc)}

    # Step 5: Predict + write
    try:
        pred_count = step_predict_and_write(fixtures_with_features)
        summary["steps"]["predictions"] = {"written": pred_count}
    except Exception as exc:
        log.error("Prediction writing failed: %s", exc)
        summary["steps"]["predictions"] = {"status": "error", "error": str(exc)}

    # Step 6: Sync track record
    try:
        track_count = step_sync_track_record()
        summary["steps"]["track_record"] = {"synced": track_count}
    except Exception as exc:
        log.error("Track record sync failed: %s", exc)
        summary["steps"]["track_record"] = {"status": "error", "error": str(exc)}

    # Step 6b: Reconcile external team/player IDs (id_mapping)
    try:
        id_map = step_map_ids()
        summary["steps"]["id_mapping"] = id_map
    except Exception as exc:
        log.error("ID mapping step failed: %s", exc)
        summary["steps"]["id_mapping"] = {"status": "error", "error": str(exc)}

    # Step 7: Learn from results to calibrate the decision rule.
    try:
        cal = step_calibrate()
        summary["steps"]["calibration"] = cal
    except Exception as exc:
        log.error("Calibration step failed: %s", exc)
        summary["steps"]["calibration"] = {"status": "error", "error": str(exc)}

    elapsed = time.time() - start
    summary["elapsed_seconds"] = round(elapsed, 1)
    log.info("Pipeline complete in %.1fs", elapsed)

    if run_id:
        try:
            failed = any(
                isinstance(step, dict) and step.get("status") == "error"
                for step in summary["steps"].values()
            )
            error = next(
                (
                    step.get("error")
                    for step in summary["steps"].values()
                    if isinstance(step, dict)
                    and step.get("status") == "error"
                    and step.get("error")
                ),
                None,
            )
            model_version = None
            try:
                from predict.generator import MODEL_VERSION

                model_version = MODEL_VERSION
            except Exception:
                pass
            execute(
                "UPDATE pipeline_runs SET status = %s, model_version = %s, "
                "fixtures_processed = %s, predictions_written = %s, "
                "track_record_synced = %s, error = %s, finished_at = NOW() "
                "WHERE id = %s",
                (
                    "failed" if failed else "success",
                    model_version,
                    len(fixtures_with_features),
                    pred_count,
                    track_count,
                    error,
                    run_id,
                ),
            )
        except Exception as exc:  # pragma: no cover - observability only
            log.warning("Could not finalize pipeline_runs row: %s", exc)

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Onside prediction pipeline")
    parser.add_argument("--skip-historical", action="store_true",
                        help="Skip StatsBomb data loading")
    parser.add_argument("--skip-live", action="store_true",
                        help="Skip API-Football ingestion")
    parser.add_argument("--backtest", action="store_true",
                        help="Run backtest only (no writes)")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    summary = run_pipeline(
        skip_historical=args.skip_historical,
        skip_live=args.skip_live,
        backtest_only=args.backtest,
    )

    print("\n" + json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
