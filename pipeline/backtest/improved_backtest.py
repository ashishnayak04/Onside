"""Improved backtest: recency-weighted Dixon-Coles + temperature calibration
+ optional market blend, benchmarked against closing odds on identical matches.

Usage
-----
    python -m backtest.improved_backtest --season "2025/2026"
"""

from __future__ import annotations

import argparse
import logging
import math

import numpy as np
import pandas as pd

from db.connection import fetch_all
from models.baseline_poisson import DixonColesModel

log = logging.getLogger("backtest_v2")


def load(competition: str = "La Liga") -> pd.DataFrame:
    rows = fetch_all(
        "SELECT * FROM historical_matches WHERE competition = %s ORDER BY match_date",
        (competition,),
    )
    return pd.DataFrame(rows)


def outcome(h: int, a: int) -> str:
    return "home_win" if h > a else ("away_win" if h < a else "draw")


def probs_from_pred(p) -> np.ndarray:
    return np.array([p.home_win_prob, p.draw_prob, p.away_win_prob])


def apply_temperature(probs: np.ndarray, t: float) -> np.ndarray:
    q = np.power(np.clip(probs, 1e-10, None), 1.0 / t)
    return q / q.sum(axis=1, keepdims=True)


def log_loss(probs: np.ndarray, actual_idx: np.ndarray) -> float:
    picked = probs[np.arange(len(actual_idx)), actual_idx]
    return float(-np.mean(np.log(np.maximum(picked, 1e-10))))


def brier(probs: np.ndarray, actual_idx: np.ndarray) -> float:
    onehot = np.zeros_like(probs)
    onehot[np.arange(len(actual_idx)), actual_idx] = 1.0
    return float(np.mean((probs - onehot) ** 2) * 3 / 3)


def accuracy(probs: np.ndarray, actual_idx: np.ndarray) -> float:
    return float(np.mean(np.argmax(probs, axis=1) == actual_idx))


DRAW = 1


def draw_report(name: str, probs: np.ndarray, actual_idx: np.ndarray,
                picks: np.ndarray | None = None) -> dict:
    """Draw-specific diagnostics: is the model pricing draws honestly?"""
    if picks is None:
        picks = np.argmax(probs, axis=1)
    n = len(actual_idx)
    actual_draws = int(np.sum(actual_idx == DRAW))
    picked_draws = int(np.sum(picks == DRAW))
    true_pos = int(np.sum((picks == DRAW) & (actual_idx == DRAW)))
    captured = probs[:, DRAW]
    rep = {
        "avg_p_draw": float(np.mean(captured)),
        "draw_rate_actual": actual_draws / n,
        "draw_picks": picked_draws,
        "draw_precision": true_pos / picked_draws if picked_draws else 0.0,
        "draw_recall": true_pos / actual_draws if actual_draws else 0.0,
        "ll_on_draws": log_loss(probs[actual_idx == DRAW], actual_idx[actual_idx == DRAW])
                       if actual_draws else float("nan"),
    }
    print("    %-24s avgP(draw)=%.3f (act %.3f) | picks=%2d prec=%.2f recall=%.2f | LL@draws=%.3f" % (
        name, rep["avg_p_draw"], rep["draw_rate_actual"], picked_draws,
        rep["draw_precision"], rep["draw_recall"], rep["ll_on_draws"]))
    return rep


def run(test_season: str, xi: float = 0.004, blend_weight: float | None = None) -> dict:
    df = load()
    seasons = sorted(df["season"].unique())
    if test_season not in seasons:
        raise SystemExit(f"Test season {test_season} not in {seasons}")

    cal_candidates = [s for s in seasons if s < test_season]
    cal_season = cal_candidates[-1]
    fit_seasons = [s for s in cal_candidates[:-1]]

    fit_df = df[df["season"].isin(fit_seasons)]
    cal_df = df[df["season"] == cal_season]
    test_df = df[df["season"] == test_season]
    log.info("fit=%s (%d), cal=%s (%d), test=%s (%d)",
             fit_seasons, len(fit_df), cal_season, len(cal_df), test_season, len(test_df))

    model = DixonColesModel(recency_xi=xi)
    model.fit(fit_df)

    def predict_frame(frame: pd.DataFrame) -> np.ndarray:
        return np.array([
            probs_from_pred(model.predict(r["home_team"], r["away_team"]))
            for _, r in frame.iterrows()
        ])

    # --- Calibrate temperature on the held-out calibration season ---
    cal_probs = predict_frame(cal_df)
    cal_actual = np.array([outcome(int(h), int(a)) for h, a in
                           zip(cal_df["home_score"], cal_df["away_score"])])
    label_to_idx = {"home_win": 0, "draw": 1, "away_win": 2}
    cal_idx = np.array([label_to_idx[o] for o in cal_actual])

    best_t, best_ll = 1.0, math.inf
    for t in np.arange(0.5, 3.01, 0.05):
        ll = log_loss(apply_temperature(cal_probs, t), cal_idx)
        if ll < best_ll:
            best_ll, best_t = ll, t
    log.info("Temperature=%.2f (cal log-loss %.4f)", best_t, best_ll)

    # --- Test ---
    test_probs_raw = predict_frame(test_df)
    test_actual_str = [outcome(int(h), int(a)) for h, a in
                       zip(test_df["home_score"], test_df["away_score"])]
    test_idx = np.array([label_to_idx[o] for o in test_actual_str])
    test_probs = apply_temperature(test_probs_raw, best_t)

    results = {
        "raw": {
            "accuracy": accuracy(test_probs_raw, test_idx),
            "log_loss": log_loss(test_probs_raw, test_idx),
            "brier": brier(test_probs_raw, test_idx),
        },
        "calibrated": {
            "accuracy": accuracy(test_probs, test_idx),
            "log_loss": log_loss(test_probs, test_idx),
            "brier": brier(test_probs, test_idx),
        },
    }

    # --- Market blend (odds known pre-match => legitimate input) ---
    odds_mask = test_df[["odds_home", "odds_draw", "odds_away"]].notna().all(axis=1).to_numpy()
    mkt_probs = None
    blended_probs = None
    idx_m = None
    if odds_mask.any():
        inv = 1.0 / test_df.loc[odds_mask, ["odds_home", "odds_draw", "odds_away"]].to_numpy()
        mkt_probs = inv / inv.sum(axis=1, keepdims=True)
        idx_m = test_idx[odds_mask]

        if blend_weight is not None:
            blended_probs = np.power(
                np.maximum(test_probs[odds_mask], 1e-10), 1 - blend_weight) * \
                np.power(mkt_probs, blend_weight)
            blended_probs /= blended_probs.sum(axis=1, keepdims=True)

            results["blend_%.2f" % blend_weight] = {
                "accuracy": accuracy(blended_probs, idx_m),
                "log_loss": log_loss(blended_probs, idx_m),
                "brier": brier(blended_probs, idx_m),
            }
        results["bookies_same_subset"] = {
            "accuracy": accuracy(mkt_probs, idx_m),
            "log_loss": log_loss(mkt_probs, idx_m),
            "brier": brier(mkt_probs, idx_m),
        }
        results["model_same_subset"] = {
            "accuracy": accuracy(test_probs[odds_mask], idx_m),
            "log_loss": log_loss(test_probs[odds_mask], idx_m),
            "brier": brier(test_probs[odds_mask], idx_m),
        }

    always_home = float(np.mean(test_idx == 0))
    print("\n" + "=" * 64)
    print("  IMPROVED BACKTEST — %s (test: %s)" % ("La Liga", test_season))
    print("=" * 64)
    print("  recency xi=%.4f | temperature=%.2f" % (xi, best_t))
    print("-" * 64)
    print("  %-28s %8s %10s %8s" % ("model", "acc", "log-loss", "brier"))
    order = ["raw", "calibrated", "model_same_subset",
             *[k for k in results if k.startswith("blend")],
             "bookies_same_subset"]
    display = {"raw": "raw model", "calibrated": "+ temp calibration",
               "model_same_subset": "calibrated (odds subset)",
               "bookies_same_subset": "bookies (same subset)"}
    for k in order:
        if k not in results:
            continue
        r = results[k]
        name = display.get(k, k)
        print("  %-28s %7.1f%% %10.4f %8.4f" %
              (name, r["accuracy"] * 100, r["log_loss"], r["brier"]))
    print("  %-28s %7.1f%%" % ("always home win", always_home * 100))
    print("-" * 64)
    print("  DRAW DIAGNOSTICS (actual draws: %d/%d = %.1f%%)" %
          (int(np.sum(test_idx == DRAW)), len(test_idx), 100 * np.mean(test_idx == DRAW)))
    picks_raw = np.argmax(test_probs_raw, axis=1)
    draw_report("raw model", test_probs_raw, test_idx, picks_raw)
    if not np.allclose(test_probs_raw, test_probs):
        draw_report("+ calibration", test_probs, test_idx)
    if mkt_probs is not None:
        draw_report("bookies (subset)", mkt_probs, idx_m)
    if blended_probs is not None:
        draw_report("market blend", blended_probs, idx_m)
    print("=" * 64)

    results["_temperature"] = round(best_t, 2)
    return results


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", default="2025/2026")
    parser.add_argument("--xi", type=float, default=0.004)
    parser.add_argument("--blend", type=float, default=None,
                        help="market blend weight 0..1, e.g. --blend 0.5")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    run(args.season, xi=args.xi, blend_weight=args.blend)


if __name__ == "__main__":
    main()
