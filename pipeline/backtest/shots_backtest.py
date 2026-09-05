"""Shots-based hybrid backtest.

Combines two recency-weighted Dixon-Coles fits per match rate:
  lambda = (1-w)*log-rate(goals model) + w*log-rate(SOT model scaled by goals/SOT)

w is tuned on a held-out calibration season; final numbers come from the
untouched test season. Includes paired-bootstrap CIs because 380-match
accuracy deltas of 1-2pts are noise.

Usage
-----
    python -m backtest.shots_backtest --season "2025/2026" [--signal sot|xg]
"""

from __future__ import annotations

import argparse
import logging
import math

import numpy as np
import pandas as pd
from scipy.special import gammaln

from db.connection import fetch_all
from models.baseline_poisson import DixonColesModel

log = logging.getLogger("shots_backtest")

LABELS = {"home_win": 0, "draw": 1, "away_win": 2}


def outcome(h: int, a: int) -> str:
    return "home_win" if h > a else ("away_win" if h < a else "draw")


def load(competition: str = "La Liga") -> pd.DataFrame:
    rows = fetch_all(
        "SELECT * FROM historical_matches WHERE competition = %s ORDER BY match_date",
        (competition,),
    )
    return pd.DataFrame(rows)


def poisson_matrix(lam: float, mu: float, max_goals: int = 8) -> np.ndarray:
    """Independent Poisson product over the scoreline grid."""
    xs = np.arange(max_goals + 1)
    log_pmf_h = xs * math.log(max(lam, 1e-10)) - lam - gammaln(xs + 1)
    log_pmf_a = xs * math.log(max(mu, 1e-10)) - mu - gammaln(xs + 1)
    m = np.exp(log_pmf_h[:, None] + log_pmf_a[None, :])
    s = m.sum()
    return (m / s).ravel()  # order: (x,y) -> x*(G+1)+y


def probs_from_rates(
    lam_vec: np.ndarray, mu_vec: np.ndarray, max_goals: int = 8
) -> np.ndarray:
    out = np.empty((len(lam_vec), 3))
    hw = np.arange(max_goals + 1)
    for i, (lam, mu) in enumerate(zip(lam_vec, mu_vec)):
        p = poisson_matrix(lam, mu, max_goals).reshape(max_goals + 1, max_goals + 1)
        out[i, 0] = np.tril(p, -1).sum()                      # x > y (home)
        out[i, 1] = np.trace(p)                               # x == y
        out[i, 2] = np.triu(p, 1).sum()                       # x < y (away)
    return out


def metrics(probs: np.ndarray, actual_idx: np.ndarray) -> dict:
    ll = float(-np.mean(np.log(np.maximum(
        probs[np.arange(len(actual_idx)), actual_idx], 1e-10))))
    acc = float(np.mean(np.argmax(probs, axis=1) == actual_idx))
    onehot = np.zeros_like(probs)
    onehot[np.arange(len(actual_idx)), actual_idx] = 1.0
    brier = float(np.mean(np.sum((probs - onehot) ** 2, axis=1)))
    return {"accuracy": acc, "log_loss": ll, "brier": brier,
            "_ll_per_match": -np.log(np.maximum(
                probs[np.arange(len(actual_idx)), actual_idx], 1e-10))}


def draw_report(name: str, probs: np.ndarray, actual_idx: np.ndarray) -> None:
    picks = np.argmax(probs, axis=1)
    n = len(actual_idx)
    ad = int((actual_idx == 1).sum())
    pd_ = int((picks == 1).sum())
    tp = int(((picks == 1) & (actual_idx == 1)).sum())
    print("    %-22s avgP(draw)=%.3f (act %.3f) | picks=%2d prec=%.2f recall=%.2f | LL@draws=%.3f" % (
        name, float(probs[:, 1].mean()), ad / n, pd_,
        tp / pd_ if pd_ else 0.0, tp / ad if ad else 0.0,
        float(-np.mean(np.log(np.maximum(
            probs[actual_idx == 1, 1], 1e-10)))) if ad else float("nan")))


def run(test_season: str, xi: float = 0.004, signal: str = "sot") -> None:
    df = load()
    seasons = sorted(df["season"].unique())
    cal_season = [s for s in seasons if s < test_season][-1]
    fit_df = df[df["season"].isin([s for s in seasons if s < cal_season])]
    cal_df = df[df["season"] == cal_season]
    test_df = df[df["season"] == test_season]
    log.info("fit=%d matches, cal=%s (%d), test=%s (%d)",
             len(fit_df), cal_season, len(cal_df), test_season, len(test_df))

    # --- Goals model ---
    g_model = DixonColesModel(recency_xi=xi)
    g_model.fit(fit_df)

    # --- Secondary-signal model (same machinery, different counts) ---
    if signal == "xg":
        sub_cols = ["home_xg", "away_xg"]
        sub_df = fit_df.dropna(subset=sub_cols).copy()
        sub_df["home_score"] = sub_df["home_xg"].astype(float)
        sub_df["away_score"] = sub_df["away_xg"].astype(float)
        s_model = DixonColesModel(recency_xi=xi, rho=0.0)
        s_model.fit(sot_df := sub_df)
        conv = 1.0
        log.info("xG model fitted on %d matches (rates used directly)", len(sot_df))
    else:
        sub_cols = ["home_sot", "away_sot"]
        sot_df = fit_df.dropna(subset=sub_cols).copy()
        sot_df["home_score"] = sot_df["home_sot"].astype(float)
        sot_df["away_score"] = sot_df["away_sot"].astype(float)
        s_model = DixonColesModel(recency_xi=xi, rho=0.0)
        s_model.fit(sot_df)

        conv = float(fit_df["home_score"].sum() + fit_df["away_score"].sum()) / \
            float(sot_df["home_sot"].sum() + sot_df["away_sot"].sum())
        log.info("goals-per-SOT conversion: %.4f", conv)

    def frame_rates(model: DixonColesModel, frame: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        lam, mu = zip(*[model.rate_params(r["home_team"], r["away_team"])
                        for _, r in frame.iterrows()])
        return np.array(lam), np.array(mu)

    def hybrid_lambdas(frame: pd.DataFrame, w: float) -> tuple[np.ndarray, np.ndarray]:
        lam_g, mu_g = frame_rates(g_model, frame)
        if w == 0.0:
            return lam_g, mu_g
        mask = frame[sub_cols[0]].notna().to_numpy()
        sub = frame[mask]
        lam_s, mu_s = frame_rates(s_model, sub)
        lam = np.log(lam_g).copy()
        mu = np.log(mu_g).copy()
        lam[mask] = (1 - w) * lam[mask] + w * (np.log(lam_s) + math.log(conv))
        mu[mask] = (1 - w) * mu[mask] + w * (np.log(mu_s) + math.log(conv))
        return np.exp(lam), np.exp(mu)

    # --- Tune w on calibration season ---
    cal_actual = np.array([LABELS[outcome(int(h), int(a))] for h, a in
                           zip(cal_df["home_score"], cal_df["away_score"])])
    best_w, best_ll = 0.0, math.inf
    for w in np.arange(0.0, 0.61, 0.1):
        lam, mu = hybrid_lambdas(cal_df, float(w))
        pr = probs_from_rates(lam, mu)
        ll = metrics(pr, cal_actual)["log_loss"]
        log.info("w=%.1f -> cal log-loss %.4f", w, ll)
        if ll < best_ll:
            best_ll, best_w = ll, float(w)
    log.info("selected w=%.1f", best_w)

    # --- Test evaluation ---
    test_actual = np.array([LABELS[outcome(int(h), int(a))] for h, a in
                            zip(test_df["home_score"], test_df["away_score"])])

    lam_g, mu_g = zip(*[g_model.rate_params(r["home_team"], r["away_team"])
                        for _, r in test_df.iterrows()])
    base_probs = probs_from_rates(np.array(lam_g), np.array(mu_g))
    hyb_lam, hyb_mu = hybrid_lambdas(test_df, best_w)
    hyb_probs = probs_from_rates(hyb_lam, hyb_mu)

    base_m = metrics(base_probs, test_actual)
    hyb_m = metrics(hyb_probs, test_actual)

    odds_mask = test_df[["odds_home", "odds_draw", "odds_away"]].notna().all(axis=1).to_numpy()
    inv = 1.0 / test_df.loc[odds_mask, ["odds_home", "odds_draw", "odds_away"]].to_numpy()
    mkt = inv / inv.sum(axis=1, keepdims=True)
    idx_m = test_actual[odds_mask]
    mkt_m = metrics(mkt, idx_m)

    # --- Paired bootstrap on log-loss differences ---
    rng = np.random.default_rng(42)

    def boot_ci(ll_a: np.ndarray, ll_b: np.ndarray, n_boot: int = 2000) -> tuple[float, float, float]:
        n = len(ll_a)
        diffs = np.empty(n_boot)
        for b in range(n_boot):
            idx = rng.integers(0, n, n)
            diffs[b] = ll_a[idx].mean() - ll_b[idx].mean()
        return float(diffs.mean()), *tuple(np.percentile(diffs, [2.5, 97.5]))

    d_base_hyb = boot_ci(base_m["_ll_per_match"], hyb_m["_ll_per_match"])
    d_hyb_mkt = boot_ci(hyb_m["_ll_per_match"][odds_mask], mkt_m["_ll_per_match"])

    print("\n" + "=" * 66)
    print("  %s-BASED HYBRID BACKTEST — La Liga (test: %s)" % (signal.upper(), test_season))
    print("=" * 66)
    print("  blend weight selected on %s: w=%.1f" % (cal_season, best_w))
    print("-" * 66)
    print("  %-26s %8s %10s %8s" % ("model", "acc", "log-loss", "brier"))
    for name, m in (("goals only (base)", base_m),
                    ("+ %s hybrid (w=%.1f)" % (signal.upper(), best_w), hyb_m),
                    ("bookies (same subset)", mkt_m)):
        print("  %-26s %7.1f%% %10.4f %8.4f" %
              (name, m["accuracy"] * 100, m["log_loss"], m["brier"]))
    print("  always home win            %7.1f%%" % (100 * float(np.mean(test_actual == 0))))
    print("-" * 66)
    print("  PAIRED BOOTSTRAP (2000x, log-loss diff, negative = first model better)")
    lo, hi = d_base_hyb[1], d_base_hyb[2]
    print("    base vs hybrid:   mean %+.4f  95%%CI [%+.4f, %+.4f] %s" %
          (d_base_hyb[0], lo, hi, "<-- hybrid wins" if hi < 0 else ("<-- base wins" if lo > 0 else "(tie)")))
    lo2, hi2 = d_hyb_mkt[1], d_hyb_mkt[2]
    print("    hybrid vs bookies: mean %+.4f 95%%CI [%+.4f, %+.4f] %s" %
          (d_hyb_mkt[0], lo2, hi2, "<-- hybrid wins" if hi2 < 0 else ("<-- bookies win" if lo2 > 0 else "(tie)")))
    print("-" * 66)
    print("  DRAW DIAGNOSTICS")
    draw_report("goals only", base_probs, test_actual)
    draw_report("+ %s hybrid" % signal.upper(), hyb_probs, test_actual)
    draw_report("bookies (subset)", mkt, idx_m)
    print("=" * 66)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", default="2025/2026")
    parser.add_argument("--xi", type=float, default=0.004)
    parser.add_argument("--signal", choices=["sot", "xg"], default="sot")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    run(args.season, xi=args.xi, signal=args.signal)


if __name__ == "__main__":
    main()
