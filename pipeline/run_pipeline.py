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

from db.connection import fetch_all, fetch_one
from models.baseline_poisson import DixonColesModel, MODEL_VERSION

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

def step_ingest_live() -> dict:
    """Ingest current-season fixtures from API-Football."""
    from ingestion.api_football_client import ingest_fixtures, LEAGUE_IDS

    log.info("=" * 60)
    log.info("STEP 2: Ingesting live fixtures from API-Football")
    log.info("=" * 60)

    # Check if API key is configured
    key_row = fetch_one("SELECT value FROM system_config WHERE key = 'api_football_key'")
    api_key = key_row["value"] if key_row else ""
    if not api_key:
        log.warning("API-Football key not configured — skipping live ingestion")
        return {"status": "skipped", "reason": "no_api_key"}

    try:
        results = ingest_fixtures()
        return {"status": "ingested", "results": results}
    except Exception as exc:
        log.error("Live ingestion failed: %s", exc)
        return {"status": "error", "error": str(exc)}


# ===================================================================
# Step 3: Build features
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
    hist_df = pd.DataFrame(all_historical)

    fixtures_with_features = []
    for match in upcoming:
        match_date = match["match_date"]
        if isinstance(match_date, str):
            match_date = datetime.fromisoformat(match_date.replace("Z", "+00:00"))

        features = build_features_for_fixture(
            hist_df,
            match["home_team"],
            match["away_team"],
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
    """Fit the Dixon-Coles model on historical data and write predictions."""
    from db.write_predictions import write_prediction, write_player_predictions_batch

    log.info("=" * 60)
    log.info("STEP 4: Running Dixon-Coles model and writing predictions")
    log.info("=" * 60)

    if not fixtures_with_features:
        log.info("No fixtures to predict")
        return 0

    # Load training data
    all_historical = fetch_all(
        "SELECT home_team, away_team, home_score, away_score, match_date "
        "FROM historical_matches ORDER BY match_date"
    )
    if not all_historical:
        log.error("No historical data for model training")
        return 0

    import pandas as pd
    train_df = pd.DataFrame(all_historical)

    # Fit model
    model = DixonColesModel()
    model.fit(train_df)

    # Get all players for basic player predictions
    all_players = fetch_all("""
        SELECT p.id, p.name, p.team_id, p.position, t.name AS team_name
        FROM players p
        LEFT JOIN teams t ON p.team_id = t.id
    """)
    players_by_team: dict[str, list[dict]] = {}
    for p in all_players:
        team = p.get("team_name", "")
        if team:
            players_by_team.setdefault(team, []).append(p)

    # Predict each fixture
    count = 0
    for fx in fixtures_with_features:
        home_team = fx["home_team"]
        away_team = fx["away_team"]
        match_id = fx["match_id"]

        # Check if prediction already exists
        existing = fetch_one(
            "SELECT id FROM predictions WHERE match_id = %s", (match_id,)
        )
        if existing:
            log.debug("Prediction already exists for match %s — skipping", match_id)
            continue

        # Build feature dicts for the model
        home_features = {k.replace("home_", ""): v for k, v in fx.items() if k.startswith("home_") and k != "home_team"}
        away_features = {k.replace("away_", ""): v for k, v in fx.items() if k.startswith("away_") and k != "away_team"}

        pred = model.predict(home_team, away_team, home_features, away_features)

        prediction_id = write_prediction(
            match_id=match_id,
            predicted_home_score=pred.predicted_home_score,
            predicted_away_score=pred.predicted_away_score,
            predicted_outcome=pred.outcome,
            home_win_prob=pred.home_win_prob,
            draw_prob=pred.draw_prob,
            away_win_prob=pred.away_win_prob,
            confidence=pred.confidence,
            feature_snapshot=pred.feature_snapshot,
            model_version=MODEL_VERSION,
        )

        # Basic player predictions: distribute goal probability by team
        home_players = players_by_team.get(home_team, [])
        away_players = players_by_team.get(away_team, [])

        player_preds = []
        if home_players and pred.predicted_home_score > 0:
            # Simple: strikers get higher probability
            for p in home_players:
                pos = (p.get("position") or "").upper()
                if "FWD" in pos or "STRIKER" in pos or "ATT" in pos:
                    gp = min(0.4, pred.predicted_home_score / max(len(home_players), 1) * 3)
                    ap = gp * 0.4
                elif "MID" in pos:
                    gp = min(0.15, pred.predicted_home_score / max(len(home_players), 1) * 1.5)
                    ap = gp * 0.6
                else:
                    gp = min(0.05, pred.predicted_home_score / max(len(home_players), 1) * 0.5)
                    ap = 0.01

                player_preds.append({
                    "player_id": str(p["id"]),
                    "goal_prob": round(gp, 4),
                    "assist_prob": round(ap, 4),
                    "shots_on_target_prob": round(min(gp * 2.5, 0.6), 4),
                })

        if away_players and pred.predicted_away_score > 0:
            for p in away_players:
                pos = (p.get("position") or "").upper()
                if "FWD" in pos or "STRIKER" in pos or "ATT" in pos:
                    gp = min(0.35, pred.predicted_away_score / max(len(away_players), 1) * 3)
                    ap = gp * 0.4
                elif "MID" in pos:
                    gp = min(0.12, pred.predicted_away_score / max(len(away_players), 1) * 1.5)
                    ap = gp * 0.6
                else:
                    gp = min(0.04, pred.predicted_away_score / max(len(away_players), 1) * 0.5)
                    ap = 0.01

                player_preds.append({
                    "player_id": str(p["id"]),
                    "goal_prob": round(gp, 4),
                    "assist_prob": round(ap, 4),
                    "shots_on_target_prob": round(min(gp * 2.5, 0.5), 4),
                })

        if player_preds:
            write_player_predictions_batch(prediction_id, player_preds)

        count += 1
        log.info("Predicted: %s vs %s → %s (%.1f%% confidence)",
                 home_team, away_team, pred.outcome, pred.confidence * 100)

    log.info("Wrote %d new predictions", count)
    return count


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

    # Step 3: Build features
    try:
        fixtures_with_features = step_build_features()
        summary["steps"]["features"] = {"count": len(fixtures_with_features)}
    except Exception as exc:
        log.error("Feature building failed: %s", exc)
        fixtures_with_features = []
        summary["steps"]["features"] = {"status": "error", "error": str(exc)}

    # Step 4: Predict + write
    try:
        pred_count = step_predict_and_write(fixtures_with_features)
        summary["steps"]["predictions"] = {"written": pred_count}
    except Exception as exc:
        log.error("Prediction writing failed: %s", exc)
        summary["steps"]["predictions"] = {"status": "error", "error": str(exc)}

    # Step 5: Sync track record
    try:
        track_count = step_sync_track_record()
        summary["steps"]["track_record"] = {"synced": track_count}
    except Exception as exc:
        log.error("Track record sync failed: %s", exc)
        summary["steps"]["track_record"] = {"status": "error", "error": str(exc)}

    elapsed = time.time() - start
    summary["elapsed_seconds"] = round(elapsed, 1)
    log.info("Pipeline complete in %.1fs", elapsed)

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
