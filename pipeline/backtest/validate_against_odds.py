"""Backtest the Dixon-Coles baseline against a historical La Liga season.

Reads from ``historical_matches``, fits on all prior seasons, predicts on
the held-out season, and prints accuracy / log-loss / Brier score.

Usage
-----
    python -m backtest.validate_against_odds
    python -m backtest.validate_against_odds --season "2022/2023"
"""

from __future__ import annotations

import argparse
import logging
import math
import sys

import pandas as pd

from db.connection import fetch_all
from models.baseline_poisson import DixonColesModel

log = logging.getLogger("backtest")


def load_historical(season: str | None = None, competition: str = "La Liga") -> pd.DataFrame:
    """Load historical matches from the database."""
    if season:
        rows = fetch_all(
            "SELECT * FROM historical_matches WHERE competition = %s AND season = %s "
            "ORDER BY match_date",
            (competition, season),
        )
    else:
        rows = fetch_all(
            "SELECT * FROM historical_matches WHERE competition = %s ORDER BY match_date",
            (competition,),
        )
    if not rows:
        log.error("No historical matches found for %s (season=%s)", competition, season)
        sys.exit(1)
    return pd.DataFrame(rows)


def run_backtest(
    competition: str = "La Liga",
    test_season: str = "2022/2023",
) -> dict:
    """Run backtest and return metrics dict.

    Fits on all seasons before *test_season*, then predicts on *test_season*.
    """
    df = load_historical(competition=competition)

    # Split train / test by season
    seasons = sorted(df["season"].unique())
    if test_season not in seasons:
        log.error("Test season '%s' not in data. Available: %s", test_season, seasons)
        sys.exit(1)

    train_df = df[df["season"] != test_season].copy()
    test_df = df[df["season"] == test_season].copy()

    log.info("Training on %d matches, testing on %d matches", len(train_df), len(test_df))

    # Fit model
    model = DixonColesModel()
    model.fit(train_df)

    # Predict on test set
    correct = 0
    total = 0
    log_losses: list[float] = []
    brier_scores: list[float] = []

    for _, row in test_df.iterrows():
        home_team = row["home_team"]
        away_team = row["away_team"]
        actual_home = int(row["home_score"])
        actual_away = int(row["away_score"])

        # Actual outcome
        if actual_home > actual_away:
            actual_outcome = "home_win"
        elif actual_home < actual_away:
            actual_outcome = "away_win"
        else:
            actual_outcome = "draw"

        try:
            pred = model.predict(home_team, away_team)
        except Exception:
            continue

        # Accuracy
        if pred.outcome == actual_outcome:
            correct += 1
        total += 1

        # Log-loss
        if actual_outcome == "home_win":
            p_actual = max(pred.home_win_prob, 1e-10)
        elif actual_outcome == "away_win":
            p_actual = max(pred.away_win_prob, 1e-10)
        else:
            p_actual = max(pred.draw_prob, 1e-10)
        log_losses.append(-math.log(p_actual))

        # Brier score for 3-way outcome
        for outcome, p_pred in [
            ("home_win", pred.home_win_prob),
            ("draw", pred.draw_prob),
            ("away_win", pred.away_win_prob),
        ]:
            target = 1.0 if outcome == actual_outcome else 0.0
            brier_scores.append((p_pred - target) ** 2)

    accuracy = correct / total if total > 0 else 0
    avg_log_loss = sum(log_losses) / len(log_losses) if log_losses else 0
    avg_brier = sum(brier_scores) / len(brier_scores) if brier_scores else 0

    return {
        "competition": competition,
        "test_season": test_season,
        "train_seasons": [s for s in seasons if s != test_season],
        "train_matches": len(train_df),
        "test_matches": total,
        "correct": correct,
        "accuracy": round(accuracy, 4),
        "avg_log_loss": round(avg_log_loss, 4),
        "avg_brier_score": round(avg_brier, 4),
        "model_params": model.get_params(),
    }


def print_report(metrics: dict) -> None:
    """Print a human-readable backtest report."""
    print("\n" + "=" * 60)
    print("  BACKTEST REPORT — Dixon-Coles Baseline")
    print("=" * 60)
    print(f"  Competition:      {metrics['competition']}")
    print(f"  Train seasons:    {', '.join(metrics['train_seasons'])}")
    print(f"  Test season:      {metrics['test_season']}")
    print(f"  Train matches:    {metrics['train_matches']}")
    print(f"  Test matches:     {metrics['test_matches']}")
    print("-" * 60)
    print(f"  Correct picks:    {metrics['correct']} / {metrics['test_matches']}")
    print(f"  Accuracy:         {metrics['accuracy'] * 100:.1f}%")
    print(f"  Avg log-loss:     {metrics['avg_log_loss']:.4f}")
    print(f"  Avg Brier score:  {metrics['avg_brier_score']:.4f}")
    print("-" * 60)
    print("  Model parameters:")
    params = metrics["model_params"]
    print(f"    rho (correlation):  {params['rho']:.4f}")
    print(f"    home_advantage:     {params['home_advantage']:.4f}")
    print(f"    teams fitted:       {len(params['attack'])}")
    print("=" * 60)

    # Interpretation guide
    print("\n  INTERPRETATION:")
    print("  - Accuracy > 50% is a reasonable baseline (random is ~33% for 3-way)")
    print("  - Log-loss < 1.0 is decent; < 0.9 is good")
    print("  - Brier score < 0.20 is decent; < 0.18 is good")
    print("  - These numbers tell us whether the model adds value vs guessing.\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backtest Dixon-Coles baseline")
    parser.add_argument("--season", type=str, default="2022/2023",
                        help="Season to hold out for testing (default: 2022/2023)")
    parser.add_argument("--competition", type=str, default="La Liga")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    metrics = run_backtest(args.competition, args.season)
    print_report(metrics)


if __name__ == "__main__":
    main()
