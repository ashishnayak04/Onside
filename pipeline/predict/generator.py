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

log = logging.getLogger("generator")

MODEL_VERSION = "dc-sot-hybrid-w0.4-xi0.004-v1"
BLEND_W = 0.4
RECENCY_XI = 0.004

LABELS = ["home_win", "draw", "away_win"]

# API-Football team name -> football-data.co.uk team name
API_TO_FD = {
    "Atletico Madrid": "Ath Madrid",
    "Athletic Club": "Ath Bilbao",
    "Real Sociedad": "Sociedad",
    "Real Betis": "Betis",
    "Rayo Vallecano": "Vallecano",
    "Celta Vigo": "Celta",
    "Espanyol": "Espanol",
    "Deportivo Alaves": "Alaves",
    "Alaves": "Alaves",
    "Real Valladolid": "Valladolid",
    "Valladolid": "Valladolid",
    "RCD Mallorca": "Mallorca",
    "Mallorca": "Mallorca",
    "UD Las Palmas": "Las Palmas",
    "Las Palmas": "Las Palmas",
    "Real Oviedo": "Oviedo",
}


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
        sot_df["home_score"] = sot_df["home_sot"].astype(int)
        sot_df["away_score"] = sot_df["away_sot"].astype(int)
        s_model = DixonColesModel(recency_xi=RECENCY_XI)
        s_model.fit(sot_df)
        conv = float(df["home_score"].sum() + df["away_score"].sum()) / float(
            sot_df["home_sot"].sum() + sot_df["away_sot"].sum()
        )
    return g_model, s_model, conv


def resolve_fd_name(api_name: str, known_teams: list[str]) -> str:
    if api_name in API_TO_FD:
        return API_TO_FD[api_name]
    if api_name in known_teams:
        return api_name
    import difflib
    close = difflib.get_close_matches(api_name.lower(), [t.lower() for t in known_teams], n=1, cutoff=0.6)
    if close:
        return known_teams[[t.lower() for t in known_teams].index(close[0])]
    log.warning("No fd-name match for '%s' — using as-is", api_name)
    return api_name


def generate() -> int:
    g_model, s_model, conv = fit_models()
    known_teams = sorted(set(g_model.attack) | set(g_model.defense))

    fixtures = fetch_all(
        """
        SELECT m.id, m.match_date, ht.name AS home_team, at.name AS away_team
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

                p_home, p_draw, p_away = outcome_probs(lam, mu)
                probs = np.array([p_home, p_draw, p_away])
                pred_outcome = LABELS[int(np.argmax(probs))]
                confidence = float(probs.max())

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
                        json.dumps(
                            {"lambda": round(lam, 3), "mu": round(mu, 3),
                             "blend_w": BLEND_W, "recency_xi": RECENCY_XI}
                        ),
                        MODEL_VERSION,
                    ),
                )
                n_new += 1
                log.info("%s vs %s -> %.2f/%.2f xG, P(H/D/A)=%.2f/%.2f/%.2f [%s]",
                         fx["home_team"], fx["away_team"], lam, mu,
                         p_home, p_draw, p_away, pred_outcome)
    return n_new


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    count = generate()
    log.info("Generated %d predictions", count)
