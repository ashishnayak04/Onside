"""Write prediction results into the database tables.

Conforms to the exact schema consumed by the Next.js dashboard:
  - predictions
  - player_predictions
  - track_record

Usage
-----
    from db.write_predictions import write_predictions
    write_predictions(predictions_list)
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from db.connection import get_conn

log = logging.getLogger("write_predictions")

# Predicted outcome values (must match VARCHAR(20) in predictions table)
OUTCOME_HOME_WIN = "home_win"
OUTCOME_DRAW = "draw"
OUTCOME_AWAY_WIN = "away_win"


def write_prediction(
    match_id: str,
    predicted_home_score: float,
    predicted_away_score: float,
    predicted_outcome: str,
    home_win_prob: float,
    draw_prob: float,
    away_win_prob: float,
    confidence: float,
    feature_snapshot: dict | None = None,
    model_version: str = "dixon_coles_v1",
) -> str:
    """Write a single prediction and return the prediction ID.

    Parameters
    ----------
    match_id : str
        UUID of the match in the matches table.
    predicted_home_score, predicted_away_score : float
        Expected goals.
    predicted_outcome : str
        One of 'home_win', 'draw', 'away_win'.
    home_win_prob, draw_prob, away_win_prob : float
        Probabilities (0.0 to 1.0).
    confidence : float
        Max of the three outcome probabilities.
    feature_snapshot : dict
        Stats that drove the prediction (JSONB).
    model_version : str
        Identifier for the model used.

    Returns
    -------
    str
        The UUID of the inserted prediction.
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO predictions
                    (match_id, predicted_home_score, predicted_away_score,
                     predicted_outcome, home_win_prob, draw_prob, away_win_prob,
                     confidence, feature_snapshot, model_version)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                match_id,
                round(predicted_home_score, 2),
                round(predicted_away_score, 2),
                predicted_outcome,
                round(home_win_prob, 4),
                round(draw_prob, 4),
                round(away_win_prob, 4),
                round(confidence, 4),
                json.dumps(feature_snapshot) if feature_snapshot else None,
                model_version,
            ))
            prediction_id = str(cur.fetchone()[0])
            conn.commit()
            return prediction_id
    finally:
        conn.close()


def write_predictions_batch(predictions: list[dict]) -> int:
    """Write multiple predictions. Each dict must have:
        match_id, predicted_home_score, predicted_away_score, predicted_outcome,
        home_win_prob, draw_prob, away_win_prob, confidence,
        feature_snapshot (optional), model_version (optional)

    Returns the number of predictions written.
    """
    conn = get_conn()
    count = 0
    try:
        with conn.cursor() as cur:
            for pred in predictions:
                cur.execute("""
                    INSERT INTO predictions
                        (match_id, predicted_home_score, predicted_away_score,
                         predicted_outcome, home_win_prob, draw_prob, away_win_prob,
                         confidence, feature_snapshot, model_version)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    pred["match_id"],
                    round(pred["predicted_home_score"], 2),
                    round(pred["predicted_away_score"], 2),
                    pred["predicted_outcome"],
                    round(pred["home_win_prob"], 4),
                    round(pred["draw_prob"], 4),
                    round(pred["away_win_prob"], 4),
                    round(pred["confidence"], 4),
                    json.dumps(pred.get("feature_snapshot")) if pred.get("feature_snapshot") else None,
                    pred.get("model_version", "dixon_coles_v1"),
                ))
                count += 1
            conn.commit()
    finally:
        conn.close()

    log.info("Wrote %d predictions", count)
    return count


def write_player_prediction(
    prediction_id: str,
    player_id: str,
    goal_prob: float,
    assist_prob: float,
    shots_on_target_prob: float,
) -> str:
    """Write a single player prediction. Returns the row ID."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO player_predictions
                    (prediction_id, player_id, goal_prob, assist_prob, shots_on_target_prob)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
            """, (
                prediction_id,
                player_id,
                round(goal_prob, 4),
                round(assist_prob, 4),
                round(shots_on_target_prob, 4),
            ))
            row_id = str(cur.fetchone()[0])
            conn.commit()
            return row_id
    finally:
        conn.close()


def write_player_predictions_batch(prediction_id: str, player_preds: list[dict]) -> int:
    """Write multiple player predictions for a single match prediction.

    Each dict: {player_id, goal_prob, assist_prob, shots_on_target_prob}
    Returns count written.
    """
    conn = get_conn()
    count = 0
    try:
        with conn.cursor() as cur:
            for pp in player_preds:
                cur.execute("""
                    INSERT INTO player_predictions
                        (prediction_id, player_id, goal_prob, assist_prob, shots_on_target_prob)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    prediction_id,
                    pp["player_id"],
                    round(pp.get("goal_prob", 0), 4),
                    round(pp.get("assist_prob", 0), 4),
                    round(pp.get("shots_on_target_prob", 0), 4),
                ))
                count += 1
            conn.commit()
    finally:
        conn.close()

    log.info("Wrote %d player predictions for prediction %s", count, prediction_id)
    return count


def update_track_record(
    match_id: str,
    prediction_id: str,
    actual_home_score: int,
    actual_away_score: int,
) -> str:
    """Record the actual outcome for a match and compare to prediction.

    Writes into track_record. Returns the row ID.
    """
    # Determine actual outcome
    if actual_home_score > actual_away_score:
        actual_outcome = OUTCOME_HOME_WIN
    elif actual_home_score < actual_away_score:
        actual_outcome = OUTCOME_AWAY_WIN
    else:
        actual_outcome = OUTCOME_DRAW

    # Fetch predicted outcome
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT predicted_outcome FROM predictions WHERE id = %s",
                (prediction_id,),
            )
            row = cur.fetchone()
            if not row:
                log.warning("Prediction %s not found — cannot update track record", prediction_id)
                return ""
            predicted_outcome = row[0]

            was_correct = predicted_outcome == actual_outcome

            cur.execute("""
                INSERT INTO track_record
                    (prediction_id, match_id, predicted_outcome, actual_outcome,
                     was_correct, actual_home_score, actual_away_score)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (prediction_id, match_id) DO UPDATE SET
                    actual_outcome = EXCLUDED.actual_outcome,
                    was_correct = EXCLUDED.was_correct,
                    actual_home_score = EXCLUDED.actual_home_score,
                    actual_away_score = EXCLUDED.actual_away_score
                RETURNING id
            """, (
                prediction_id, match_id, predicted_outcome, actual_outcome,
                was_correct, actual_home_score, actual_away_score,
            ))
            row_id = str(cur.fetchone()[0])
            conn.commit()
            return row_id
    finally:
        conn.close()


def sync_track_record() -> int:
    """For all finished matches with predictions but no track_record entry,
    write the actual result. Returns count of records written.
    """
    conn = get_conn()
    count = 0
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT p.id AS prediction_id, p.match_id, p.predicted_outcome,
                       m.home_score, m.away_score
                FROM predictions p
                JOIN matches m ON p.match_id = m.id
                WHERE m.status = 'finished'
                  AND m.home_score IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM track_record tr
                      WHERE tr.prediction_id = p.id
                  )
            """)
            rows = cur.fetchall()

            for pred_id, match_id, predicted_outcome, home_score, away_score in rows:
                if home_score > away_score:
                    actual_outcome = OUTCOME_HOME_WIN
                elif home_score < away_score:
                    actual_outcome = OUTCOME_AWAY_WIN
                else:
                    actual_outcome = OUTCOME_DRAW

                was_correct = predicted_outcome == actual_outcome

                cur.execute("""
                    INSERT INTO track_record
                        (prediction_id, match_id, predicted_outcome, actual_outcome,
                         was_correct, actual_home_score, actual_away_score)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (
                    pred_id, match_id, predicted_outcome, actual_outcome,
                    was_correct, home_score, away_score,
                ))
                count += 1

            conn.commit()
    finally:
        conn.close()

    if count > 0:
        log.info("Synced %d track record entries", count)
    return count
