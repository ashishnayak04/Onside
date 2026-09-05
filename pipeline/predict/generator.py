"""Live prediction generator.

Fits the goals + SOT hybrid Dixon-Coles on all completed La Liga history,
then predicts every scheduled match in ``matches`` and upserts rows into
``predictions``.

Team names coming from API-Football ("Atletico Madrid") differ from the
football-data.co.uk strings used at fit time ("Ath Madrid"), so an alias
map + fuzzy fallback bridges them.

Usage
-----
    python -m predict.generator            # predict all scheduled matches
"""

from __future__ import annotations

import json
import logging
import math

import numpy as np
import pandas as pd
from scipy.special import gammaln

from db.connection import fetch_all, transaction
from models.baseline_poisson import DixonColesModel
from predict.calibrator import (load_draw_bonus, pick_outcome,
                                load_temperature, apply_temperature,
                                load_market_blend, market_probs,
                                blend_with_market)
from mapping.team_registry import resolve_fit_name

log = logging.getLogger("generator")

MODEL_VERSION = "dc-sot-hybrid-w0.4-xi0.004-calib-v1"
BLEND_W = 0.4
RECENCY_XI = 0.004

LABELS = ["home_win", "draw", "away_win"]


def _poisson_matrix(lam: float, mu: float, max_goals: int = 8) -> np.ndarray:
    xs = np.arange(max_goals + 1)
    log_pmf_h = xs * math.log(max(lam, 1e-10)) - lam - gammaln(xs + 1)
    log_pmf_a = xs * math.log(max(mu, 1e-10)) - mu - gammaln(xs + 1)
    m = np.exp(log_pmf_h[:, None] + log_pmf_a[None, :])
    return m / m.sum()


def outcome_probs(lam: float, mu: float, max_goals: int = 8) -> tuple[float, float, float]:
    p = _poisson_matrix(lam, mu, max_goals)
    return (
        float(np.tril(p, -1).sum()),   # home win
        float(np.trace(p)),           # draw
        float(np.triu(p, 1).sum()),   # away win
    )


def load_history() -> pd.DataFrame:
    rows = fetch_all(
        "SELECT * FROM historical_matches WHERE competition = 'La Liga' ORDER BY match_date"
    )
    return pd.DataFrame(rows)


def fit_models() -> tuple[DixonColesModel, DixonColesModel | None, float | None]:
    df = load_history()
    g_model = DixonColesModel(recency_xi=RECENCY_XI)
    g_model.fit(df)

    sot_df = df.dropna(subset=["home_sot", "away_sot"]).copy()
    s_model = None
    conv = None
    if len(sot_df) >= 200:
        # Fit the SOT model with a FIXED rho=0 (no Dixon-Coles low-score
        # correlation adjustment). SOT is a higher-count distribution
        # (values ~1-17) and its few 0-0/1-1 rows drive the fitted rho to its
        # -1 bound, a degenerate fit. We only need the attack/defense rates
        # from this model, so disabling rho is both safer and stable.
        # Keep SOT as floats (e.g. 4.7) rather than ints so nothing truncates.
        sot_df["home_score"] = sot_df["home_sot"].astype(float)
        sot_df["away_score"] = sot_df["away_sot"].astype(float)
        s_model = DixonColesModel(recency_xi=RECENCY_XI, rho=0.0)
        s_model.fit(sot_df)
        conv = float(df["home_score"].sum() + df["away_score"].sum()) / float(
            sot_df["home_sot"].sum() + sot_df["away_sot"].sum()
        )
    return g_model, s_model, conv


def _sanitize_snapshot(data) -> dict:
    """Recursively coerce feature values to JSON-serializable primitives and
    round floats, dropping non-serializable nested containers."""
    def coerce(v):
        if isinstance(v, (bool, int, str)) or v is None:
            return v
        if isinstance(v, float):
            return round(float(v), 3)
        if isinstance(v, dict):
            again = {k: coerce(x) for k, x in v.items()}
            return {k: x for k, x in again.items() if x is not None}
        return None

    out = coerce(data)
    return out if isinstance(out, dict) else {}


def resolve_fd_name(api_name: str, known_teams: list[str]) -> str:
    return resolve_fit_name(api_name, known_teams)


def generate(features_by_match: dict[str, dict] | None = None) -> int:
    """Generate and upsert predictions for all scheduled matches.

    Parameters
    ----------
    features_by_match : dict[str, dict] | None
        Optional mapping of ``match_id`` (as str) -> dict of engineered
        features (rolling form, h2h, rest days, splits ...). When present
        these are merged into each prediction's ``feature_snapshot`` for
        explainability. Falls back to the model's own minimal snapshot.
    """
    g_model, s_model, conv = fit_models()
    known_teams = sorted(set(g_model.attack) | set(g_model.defense))

    # The calibrated decision rule: learned from past track-record results so
    # draws (and wins) are called at realistic rates instead of never.
    draw_bonus = load_draw_bonus()
    temperature = load_temperature()
    market_w = load_market_blend()
    log.info("Using draw bonus %.3f, temperature %.2f, market blend %.2f",
             draw_bonus, temperature, market_w)

    fixtures = fetch_all(
        """
        SELECT m.id, m.match_date, ht.name AS home_team, at.name AS away_team,
               m.odds_home, m.odds_draw, m.odds_away
        FROM matches m
        JOIN teams ht ON m.home_team_id = ht.id
        JOIN teams at ON m.away_team_id = at.id
        WHERE m.status = 'scheduled'
        ORDER BY m.match_date
        """
    )
    if not fixtures:
        log.info("No scheduled matches found — nothing to predict")
        return 0
    log.info("Predicting %d scheduled matches", len(fixtures))

    n_new = 0
    with transaction() as conn:
        with conn.cursor() as cur:
            for fx in fixtures:
                h = resolve_fd_name(fx["home_team"], known_teams)
                a = resolve_fd_name(fx["away_team"], known_teams)

                lam_g, mu_g = g_model.rate_params(h, a)
                lam, mu = lam_g, mu_g
                if s_model is not None:
                    lam_s, mu_s = s_model.rate_params(h, a)
                    lam = math.exp((1 - BLEND_W) * math.log(lam_g)
                                   + BLEND_W * (math.log(lam_s) + math.log(conv)))
                    mu = math.exp((1 - BLEND_W) * math.log(mu_g)
                                  + BLEND_W * (math.log(mu_s) + math.log(conv)))

                probs = np.array(outcome_probs(lam, mu))

                # Probability calibration (temperature) then optional market blend.
                calib = apply_temperature(probs.reshape(1, -1), float(temperature))[0]
                mkt = market_probs(fx.get("odds_home"), fx.get("odds_draw"),
                                   fx.get("odds_away"))
                if mkt is not None:
                    calib = blend_with_market(calib, mkt, float(market_w))

                p_home, p_draw, p_away = float(calib[0]), float(calib[1]), float(calib[2])
                pred_outcome = pick_outcome(p_home, p_draw, p_away, draw_bonus)
                confidence = float(max(p_home, p_draw, p_away))

                snapshot = {
                    "lambda": round(lam, 3), "mu": round(mu, 3),
                    "blend_w": BLEND_W, "recency_xi": RECENCY_XI,
                    "temperature": round(float(temperature), 3),
                    "market_blend_w": round(float(market_w), 3),
                }
                if mkt is not None:
                    snapshot["market_probs"] = [round(float(x), 4) for x in mkt]
                engineered = (features_by_match or {}).get(str(fx["id"]))
                if engineered:
                    snapshot["engineered"] = _sanitize_snapshot(engineered)

                cur.execute("DELETE FROM predictions WHERE match_id = %s AND model_version = %s",
                            (fx["id"], MODEL_VERSION))
                cur.execute(
                    """
                    INSERT INTO predictions
                      (match_id, predicted_home_score, predicted_away_score,
                       predicted_outcome, home_win_prob, draw_prob, away_win_prob,
                       confidence, feature_snapshot, model_version)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        fx["id"],
                        round(lam, 2),
                        round(mu, 2),
                        pred_outcome,
                        round(p_home, 4),
                        round(p_draw, 4),
                        round(p_away, 4),
                        round(confidence, 4),
                        json.dumps(snapshot),
                        MODEL_VERSION,
                    ),
                )
                n_new += 1
                log.info("%s vs %s -> P(H/D/A)=%.2f/%.2f/%.2f [%s]",
                         fx["home_team"], fx["away_team"],
                         p_home, p_draw, p_away, pred_outcome)
    return n_new


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    count = generate()
    log.info("Generated %d predictions", count)
