"""XGBoost challenger backtest vs the DC-SOT Dixon-Coles baseline.

Same protocol as improved_backtest/shots_backtest:
  fit seasons -> cal season (temperature) -> test season, all strictly ordered.
Features are built ONLY from matches strictly before each match's date
(rolling per-team form), so there is no leakage.

The baseline replicates predict/generator.py: recency-weighted goals model +
SOT model blended in log-rate space (w=0.4, SOT scaled by goals/SOT).

Verdict discipline: XGBoost only "wins" if the paired-bootstrap 95% CI on the
log-loss delta excludes zero in its favor.

Usage
-----
    python -m backtest.xgb_backtest --season "2025/2026"
"""

from __future__ import annotations

import argparse
import logging
import math

import numpy as np
import pandas as pd
from scipy.special import gammaln
from xgboost import XGBClassifier

from db.connection import fetch_all
from models.baseline_poisson import DixonColesModel

log = logging.getLogger("xgb_backtest")

LABELS = {"home_win": 0, "draw": 1, "away_win": 2}
FORM_N = 6


def load(competition: str = "La Liga") -> pd.DataFrame:
    rows = fetch_all(
        "SELECT * FROM historical_matches WHERE competition = %s ORDER BY match_date",
        (competition,),
    )
    return pd.DataFrame(rows)


def outcome(h: int, a: int) -> int:
    return 0 if h > a else (2 if h < a else 1)


# ---------------------------------------------------------------------------
# Leak-free rolling features
# ---------------------------------------------------------------------------

FEATURE_NAMES = [
    "home_gf", "home_ga", "home_pts", "home_xgf", "home_xga",
    "home_sot_f", "home_rest",
    "away_gf", "away_ga", "away_pts", "away_xgf", "away_xga",
    "away_sot_f", "away_rest",
]


class TeamHistory:
    """Per-team running history; features come from the last FORM_N entries."""

    def __init__(self) -> None:
        self.rows: list[dict] = []

    def add(self, gf: float, ga: float, pts: int,
            xgf: float | None, xga: float | None, sot: float | None, date) -> None:
        self.rows.append({
            "gf": gf, "ga": ga, "pts": pts, "xgf": xgf, "xga": xga,
            "sot": sot, "date": date,
        })

    def features(self) -> list[float]:
        last = self.rows[-FORM_N:]
        n = len(last)
        if n == 0:
            return [0.0] * 6 + [np.nan]
        gf = np.mean([r["gf"] for r in last])
        ga = np.mean([r["ga"] for r in last])
        pts = np.mean([r["pts"] for r in last])
        xg = [r["xgf"] for r in last if r["xgf"] is not None]
        xga = [r["xga"] for r in last if r["xga"] is not None]
        sot = [r["sot"] for r in last if r["sot"] is not None]
        return [
            gf, ga, pts,
            float(np.mean(xg)) if xg else gf,      # xG fallback: actual goals
            float(np.mean(xga)) if xga else ga,
            float(np.mean(sot)) if sot else 4.5,   # league-ish default SOT
            float((self.rows[-1]["date"] - last[0]["date"]).days),
        ]


def build_features(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """Return (X, y) with features from strictly-prior matches only."""
    df = df.sort_values("match_date").reset_index(drop=True)
    hist: dict[str, TeamHistory] = {}
    X = np.full((len(df), len(FEATURE_NAMES)), np.nan)
    y = np.full(len(df), -1, dtype=np.int64)

    for i, row in df.iterrows():
        h, a = row["home_team"], row["away_team"]
        ht = hist.setdefault(h, TeamHistory())
        at = hist.setdefault(a, TeamHistory())

        hf = ht.features()
        af = at.features()
        hg, ag = float(row["home_score"]), float(row["away_score"])
        X[i] = [
            hf[0], hf[1], hf[2], hf[3], hf[4], hf[5],
            _rest_days(ht, row["match_date"]),
            af[0], af[1], af[2], af[3], af[4], af[5],
            _rest_days(at, row["match_date"]),
        ]
        y[i] = outcome(int(row["home_score"]), int(row["away_score"]))

        # update AFTER feature computation — no leakage
        hp = 3 if hg > ag else (1 if hg == ag else 0)
        ap = 3 - hp
        ht.add(hg, ag, hp, row.get("home_xg"), row.get("away_xg"),
               row.get("home_sot"), row["match_date"])
        at.add(ag, hg, ap, row.get("away_xg"), row.get("home_xg"),
               row.get("away_sot"), row["match_date"])

    return X, y


def _rest_days(th: TeamHistory, date) -> float:
    if not th.rows:
        return 14.0
    delta = (date - th.rows[-1]["date"]).days
    return float(min(delta, 60))


# ---------------------------------------------------------------------------
# Baseline: goals+SOT blended Dixon-Coles (mirrors predict/generator.py)
# ---------------------------------------------------------------------------

def _poisson_matrix(lam: float, mu: float, max_goals: int = 8) -> np.ndarray:
    xs = np.arange(max_goals + 1)
    log_pmf_h = xs * math.log(max(lam, 1e-10)) - lam - gammaln(xs + 1)
    log_pmf_a = xs * math.log(max(mu, 1e-10)) - mu - gammaln(xs + 1)
    m = np.exp(log_pmf_h[:, None] + log_pmf_a[None, :])
    return m / m.sum()


def outcome_probs(lam: float, mu: float, max_goals: int = 8) -> tuple[float, float, float]:
    p = _poisson_matrix(lam, mu, max_goals)
    return (
        float(np.tril(p, -1).sum()),
        float(np.trace(p)),
        float(np.triu(p, 1).sum()),
    )


BLEND_W = 0.4
RECENCY_XI = 0.004


def fit_dc_sot(df: pd.DataFrame):
    g_model = DixonColesModel(recency_xi=RECENCY_XI)
    g_model.fit(df)
    sot_df = df.dropna(subset=["home_sot", "away_sot"]).copy()
    s_model = None
    conv = None
    if len(sot_df) >= 200:
        sot_df = sot_df.assign(
            home_score=sot_df["home_sot"].astype(float),
            away_score=sot_df["away_sot"].astype(float),
        )
        # FIXED rho=0: mirrors predict/generator.py — SOT is a higher-count
        # distribution whose low-score rows would otherwise drive rho to its
        # -1 bound (degenerate fit).
        s_model = DixonColesModel(recency_xi=RECENCY_XI, rho=0.0)
        s_model.fit(sot_df)
        conv = float(df["home_score"].sum() + df["away_score"].sum()) / float(
            sot_df["home_sot"].sum() + sot_df["away_sot"].sum()
        )
    return g_model, s_model, conv


def dc_probs_for(model_pack, frame: pd.DataFrame) -> np.ndarray:
    g_model, s_model, conv = model_pack
    known = sorted(set(g_model.attack) | set(g_model.defense))
    out = np.empty((len(frame), 3))
    for i, (_, r) in enumerate(frame.iterrows()):
        lam_g, mu_g = g_model.rate_params(r["home_team"], r["away_team"])
        lam, mu = lam_g, mu_g
        if s_model is not None:
            lam_s, mu_s = s_model.rate_params(r["home_team"], r["away_team"])
            lam = math.exp((1 - BLEND_W) * math.log(lam_g)
                           + BLEND_W * (math.log(lam_s) + math.log(conv)))
            mu = math.exp((1 - BLEND_W) * math.log(mu_g)
                          + BLEND_W * (math.log(mu_s) + math.log(conv)))
        out[i] = outcome_probs(lam, mu)
    return out


# ---------------------------------------------------------------------------
# Metrics + bootstrap
# ---------------------------------------------------------------------------

def log_loss(probs: np.ndarray, y: np.ndarray) -> float:
    picked = probs[np.arange(len(y)), y]
    return float(-np.mean(np.log(np.maximum(picked, 1e-10))))


def brier(probs: np.ndarray, y: np.ndarray) -> float:
    onehot = np.zeros_like(probs)
    onehot[np.arange(len(y)), y] = 1.0
    return float(np.mean(np.sum((probs - onehot) ** 2, axis=1)))


def accuracy(probs: np.ndarray, y: np.ndarray) -> float:
    return float(np.mean(np.argmax(probs, axis=1) == y))


def apply_temperature(probs: np.ndarray, t: float) -> np.ndarray:
    q = np.power(np.clip(probs, 1e-10, None), 1.0 / t)
    return q / q.sum(axis=1, keepdims=True)


def calibrate_temperature(raw: np.ndarray, y: np.ndarray) -> float:
    best_t, best_ll = 1.0, math.inf
    for t in np.arange(0.5, 3.01, 0.05):
        ll = log_loss(apply_temperature(raw, t), y)
        if ll < best_ll:
            best_ll, best_t = ll, t
    return round(best_t, 2)


def paired_bootstrap(delta_per_match: np.ndarray, n_boot: int = 2000,
                     seed: int = 7) -> tuple[float, float, float]:
    """delta_per_match: per-match signed deltas. Returns (mean, lo95, hi95)."""
    rng = np.random.default_rng(seed)
    n = len(delta_per_match)
    means = np.empty(n_boot)
    for b in range(n_boot):
        idx = rng.integers(0, n, n)
        means[b] = np.mean(delta_per_match[idx])
    return float(np.mean(delta_per_match)), float(np.percentile(means, 2.5)), \
        float(np.percentile(means, 97.5))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(test_season: str) -> dict:
    df = load()
    seasons = sorted(df["season"].unique())
    if test_season not in seasons:
        raise SystemExit(f"Test season {test_season} not in {seasons}")

    prior = [s for s in seasons if s < test_season]
    cal_season = prior[-1]
    fit_seasons = prior[:-1]

    fit_df = df[df["season"].isin(fit_seasons)]
    cal_df = df[df["season"] == cal_season]
    test_df = df[df["season"] == test_season].reset_index(drop=True)
    log.info("fit=%s (%d), cal=%s (%d), test=%s (%d)",
             fit_seasons, len(fit_df), cal_season, len(cal_df),
             test_season, len(test_df))

    # --- features ---
    full = pd.concat([fit_df, cal_df, test_df]).sort_values("match_date").reset_index(drop=True)
    X_all, y_all = build_features(full)
    idx_fit = full.index[full["season"].isin(fit_seasons)].to_numpy()
    idx_cal = full.index[full["season"] == cal_season].to_numpy()
    idx_test = full.index[full["season"] == test_season].to_numpy()

    X_fit, y_fit = X_all[idx_fit], y_all[idx_fit]
    X_cal, y_cal = X_all[idx_cal], y_all[idx_cal]
    X_test, y_test = X_all[idx_test], y_all[idx_test]

    # --- XGBoost ---
    clf = XGBClassifier(
        objective="multi:softprob", num_class=3, eval_metric="mlogloss",
        n_estimators=400, max_depth=4, learning_rate=0.05,
        subsample=0.9, colsample_bytree=0.8, reg_lambda=1.0,
        tree_method="hist", n_jobs=-1,
    )
    clf.fit(X_fit, y_fit)

    xgb_raw_cal = clf.predict_proba(X_cal)
    xgb_t = calibrate_temperature(xgb_raw_cal, y_cal)
    xgb_raw_test = clf.predict_proba(X_test)
    xgb_probs = apply_temperature(xgb_raw_test, xgb_t)
    log.info("XGB temperature=%.2f", xgb_t)

    # --- DC-SOT baseline ---
    model_pack = fit_dc_sot(fit_df)
    dc_probs = dc_probs_for(model_pack, test_df)
    dc_t = calibrate_temperature(dc_probs, y_cal)
    dc_probs_cal = apply_temperature(dc_probs, dc_t)

    results = {
        "dc_sot_raw": (accuracy(dc_probs, y_test), log_loss(dc_probs, y_test), brier(dc_probs, y_test)),
        "dc_sot_cal": (accuracy(dc_probs_cal, y_test), log_loss(dc_probs_cal, y_test), brier(dc_probs_cal, y_test)),
        "xgb_raw": (accuracy(xgb_raw_test, y_test), log_loss(xgb_raw_test, y_test), brier(xgb_raw_test, y_test)),
        "xgb_cal": (accuracy(xgb_probs, y_test), log_loss(xgb_probs, y_test), brier(xgb_probs, y_test)),
    }

    odds_mask = test_df[["odds_home", "odds_draw", "odds_away"]].notna().all(axis=1).to_numpy()
    if odds_mask.any():
        inv = 1.0 / test_df.loc[odds_mask, ["odds_home", "odds_draw", "odds_away"]].to_numpy()
        mkt = inv / inv.sum(axis=1, keepdims=True)
        y_m = y_test[odds_mask]
        results["bookies_same_subset"] = (
            accuracy(mkt, y_m), log_loss(mkt, y_m), brier(mkt, y_m))

    # --- paired bootstrap: XGB minus DC-SOT (negative delta = XGB better LL) ---
    ll_xgb_pm = -np.log(np.maximum(xgb_probs[np.arange(len(y_test)), y_test], 1e-10))
    ll_dc_pm = -np.log(np.maximum(dc_probs_cal[np.arange(len(y_test)), y_test], 1e-10))
    mean_d, lo, hi = paired_bootstrap(ll_dc_pm - ll_xgb_pm)
    acc_xgb_pm = (np.argmax(xgb_probs, axis=1) == y_test).astype(float)
    acc_dc_pm = (np.argmax(dc_probs_cal, axis=1) == y_test).astype(float)
    amean_d, alo, ahi = paired_bootstrap(acc_xgb_pm - acc_dc_pm)

    # --- report ---
    print("\n" + "=" * 66)
    print("  XGBOOST CHALLENGER vs DC-SOT BASELINE — La Liga (test: %s)" % test_season)
    print("=" * 66)
    print("  %-22s %8s %10s %8s" % ("model", "acc", "log-loss", "brier"))
    for name, (acc, ll, br) in results.items():
        print("  %-22s %7.1f%% %10.4f %8.4f" % (name, acc * 100, ll, br))
    print("  %-22s %7.1f%%" % ("always home win", float(np.mean(y_test == 0)) * 100))
    print("-" * 66)
    print("  PAIRED BOOTSTRAP (2000 resamples)")
    print("    log-loss delta (DC-SOT - XGB): %+0.4f  95%% CI [%+0.4f, %+0.4f]"
          % (mean_d, lo, hi))
    print("    acc delta     (XGB - DC-SOT): %+0.3f  95%% CI [%+0.3f, %+0.3f]"
          % (amean_d, alo, ahi))
    xgb_wins = lo > 0
    verdict = ("XGBOOST WINS" if xgb_wins else
               "NO SIGNIFICANT WINNER — well-calibrated Dixon-Coles holds")
    print("  VERDICT: %s" % verdict)
    print("-" * 66)

    imp = pd.Series(clf.feature_importances_, index=FEATURE_NAMES).sort_values(ascending=False)
    print("  TOP FEATURES:")
    for fname, v in imp.head(8).items():
        print("    %-14s %.3f" % (fname, v))
    print("=" * 66)

    return {
        "results": {k: [round(x, 4) for x in v] for k, v in results.items()},
        "bootstrap_ll_delta": [round(mean_d, 4), round(lo, 4), round(hi, 4)],
        "verdict": verdict,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", default="2025/2026")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(name)s %(levelname)s %(message)s")
    run(args.season)


if __name__ == "__main__":
    main()
