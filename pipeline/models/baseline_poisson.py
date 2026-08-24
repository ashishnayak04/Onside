"""Baseline Dixon-Coles Poisson model for match outcome prediction.

The model estimates per-team attack and defense strengths from historical
goals scored/conceded, then uses a bivariate Poisson with a Dixon-Coles
correlation adjustment for low-scoring outcomes (0-0, 1-0, 0-1, 1-1).

Reference: Dixon & Coles, "Modelling Association Football Scores and
Inefficiencies in the Football Betting Market" (1997).

Usage
-----
    from models.baseline_poisson import DixonColesModel

    model = DixonColesModel()
    model.fit(historical_df)   # DataFrame with home_team, away_team, home_score, away_score
    result = model.predict(home_team="Barcelona", away_team="Real Madrid")
    # result = {home_win_prob, draw_prob, away_win_prob, pred_home, pred_away, confidence, ...}
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.special import gammaln

log = logging.getLogger("baseline_poisson")

MODEL_VERSION = "dixon_coles_v1"

# Dixon-Coles tau function for correlation adjustment
def _tau(x: int, y: int, lambda_: float, mu: float, rho: float) -> float:
    """Return the correlation adjustment factor for scoreline (x, y)."""
    if x == 0 and y == 0:
        return 1 - lambda_ * mu * rho
    if x == 0 and y == 1:
        return 1 + lambda_ * rho
    if x == 1 and y == 0:
        return 1 + mu * rho
    if x == 1 and y == 1:
        return 1 - rho
    return 1.0


def _poisson_pmf(k: int, lam: float) -> float:
    """Poisson probability mass function."""
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    return math.exp(-lam) * (lam ** k) / math.factorial(k)


@dataclass
class MatchPrediction:
    home_win_prob: float
    draw_prob: float
    away_win_prob: float
    predicted_home_score: float
    predicted_away_score: float
    confidence: float
    outcome: str  # "home_win", "draw", "away_win"
    feature_snapshot: dict = field(default_factory=dict)


class DixonColesModel:
    """Dixon-Coles model for match outcome prediction.

    Parameters
    ----------
    max_goals : int
        Maximum goals per team considered in the probability summation.
    rho : float or None
        If provided, uses a fixed correlation parameter instead of fitting.
    """

    def __init__(self, max_goals: int = 8, rho: float | None = None,
                 recency_xi: float | None = None) -> None:
        self.max_goals = max_goals
        self._fixed_rho = rho
        self.recency_xi = recency_xi  # e.g. 0.004 => ~173-day half-life
        self.rho: float = 0.0
        self.attack: dict[str, float] = {}
        self.defense: dict[str, float] = {}
        self.home_advantage: float = 0.0
        self._fitted = False

    # ------------------------------------------------------------------
    # Fitting
    # ------------------------------------------------------------------

    def fit(self, df: pd.DataFrame) -> None:
        """Fit the model on historical match data.

        Parameters
        ----------
        df : DataFrame with columns:
            home_team, away_team, home_score, away_score
        """
        df = df.copy()
        # Keep fractional counts (e.g. xG) as floats — gammaln handles them;
        # integerize otherwise for exact low-score tau matching
        frac = ((df["home_score"] % 1 != 0) | (df["away_score"] % 1 != 0)).any()
        dtype = float if frac else int
        df["home_score"] = df["home_score"].astype(dtype)
        df["away_score"] = df["away_score"].astype(dtype)

        teams = sorted(set(df["home_team"].tolist() + df["away_team"].tolist()))
        n_teams = len(teams)
        team_idx = {t: i for i, t in enumerate(teams)}

        log.info("Fitting Dixon-Coles on %d matches, %d teams", len(df), n_teams)

        # Parameters: [attack_0..n-1, defense_0..n-1, home_advantage(, rho)]
        # Attack[0] = 0 (reference team), defense[0] = 0 (reference team)
        n_attack = n_teams - 1
        n_defense = n_teams - 1
        fit_rho = self._fixed_rho is None
        n_params = n_attack + n_defense + 1 + (1 if fit_rho else 0)

        # Precompute arrays once — the likelihood below is fully vectorized
        home_idx = df["home_team"].map(team_idx).to_numpy(dtype=np.intp)
        away_idx = df["away_team"].map(team_idx).to_numpy(dtype=np.intp)
        hg = df["home_score"].to_numpy(dtype=np.int64)
        ag = df["away_score"].to_numpy(dtype=np.int64)
        log_hg_fact = gammaln(hg + 1.0)
        log_ag_fact = gammaln(ag + 1.0)

        # Optional exponential recency weights (more recent matches matter more)
        if self.recency_xi is not None and "match_date" in df.columns:
            dates = pd.to_datetime(df["match_date"])
            ages = (dates.max() - dates).dt.days.to_numpy(dtype=float)
            w = np.exp(-self.recency_xi * np.maximum(ages, 0.0))
        else:
            w = None

        def _neg_log_likelihood(params: np.ndarray) -> float:
            attack = np.zeros(n_teams)
            attack[1:] = params[:n_attack]
            defense = np.zeros(n_teams)
            defense[1:] = params[n_attack:n_attack + n_defense]
            home_adv = params[n_attack + n_defense]
            if fit_rho:
                rho = params[-1]
            else:
                rho = self._fixed_rho

            lambda_ = np.exp(attack[home_idx] + defense[away_idx] + home_adv)
            mu = np.exp(attack[away_idx] + defense[home_idx])

            base = (hg * np.log(lambda_) - lambda_ - log_hg_fact
                    + ag * np.log(mu) - mu - log_ag_fact)

            # Dixon-Coles tau adjustment (log-space, guarded for positivity)
            eps = 1e-10
            m00 = (hg == 0) & (ag == 0)
            m01 = (hg == 0) & (ag == 1)
            m10 = (hg == 1) & (ag == 0)
            m11 = (hg == 1) & (ag == 1)
            tau_log = np.zeros(len(hg))
            tau_log[m00] = np.log(np.clip(1.0 - lambda_[m00] * mu[m00] * rho, eps, None))
            tau_log[m01] = np.log(np.clip(1.0 + lambda_[m01] * rho, eps, None))
            tau_log[m10] = np.log(np.clip(1.0 + mu[m10] * rho, eps, None))
            tau_log[m11] = np.log(np.clip(1.0 - rho, eps, None))

            total = base + tau_log
            ll = float(np.sum(w * total)) if w is not None else float(np.sum(total))
            return -ll

        # Initial guess: home advantage ~0.26 (typical La Liga log ratio)
        x0 = np.zeros(n_params)
        x0[n_attack + n_defense] = 0.26
        if fit_rho:
            x0[-1] = -0.1

        bounds = [(-5, 5)] * (n_attack + n_defense) + [(-1, 1)]
        if fit_rho:
            bounds.append((-1, 1))

        result = minimize(
            _neg_log_likelihood,
            x0,
            method="L-BFGS-B",
            bounds=bounds,
            options={"maxiter": 5000, "ftol": 1e-10},
        )

        if not result.success:
            log.warning("Optimization did not converge: %s", result.message)

        # Extract fitted parameters
        opt = result.x
        self.attack = {teams[0]: 0.0}
        for i, t in enumerate(teams[1:], 1):
            self.attack[t] = opt[i - 1]

        self.defense = {teams[0]: 0.0}
        for i, t in enumerate(teams[1:], 1):
            self.defense[t] = opt[n_attack + i - 1]

        self.home_advantage = float(opt[n_attack + n_defense])
        self.rho = float(opt[-1]) if fit_rho else self._fixed_rho

        self._fitted = True
        log.info("Fitted: rho=%.4f, home_advantage=%.4f, %d teams",
                 self.rho, self.home_advantage, n_teams)

    # ------------------------------------------------------------------
    # Prediction
    # ------------------------------------------------------------------

    def _compute_scoreline_probs(
        self, home_team: str, away_team: str
    ) -> dict[tuple[int, int], float]:
        """Return {(home_goals, away_goals): probability} for all scorelines."""
        lambda_, mu = self.rate_params(home_team, away_team)

        probs: dict[tuple[int, int], float] = {}
        for x in range(self.max_goals + 1):
            for y in range(self.max_goals + 1):
                tau = _tau(x, y, lambda_, mu, self.rho)
                p = _poisson_pmf(x, lambda_) * _poisson_pmf(y, mu) * tau
                if p > 0:
                    probs[(x, y)] = p

        return probs

    def rate_params(self, home_team: str, away_team: str) -> tuple[float, float]:
        """Return (lambda_, mu): expected goals for home and away team."""
        att_h = self.attack.get(home_team, 0.0)
        def_h = self.defense.get(home_team, 0.0)
        att_a = self.attack.get(away_team, 0.0)
        def_a = self.defense.get(away_team, 0.0)

        lambda_ = math.exp(att_h + def_a + self.home_advantage)
        mu = math.exp(att_a + def_h)
        return lambda_, mu

    def predict(
        self, home_team: str, away_team: str,
        home_features: dict | None = None,
        away_features: dict | None = None,
    ) -> MatchPrediction:
        """Predict outcome for a single match.

        Parameters
        ----------
        home_team, away_team : str
            Team names (must match those used in fit()).
        home_features, away_features : dict, optional
            Extra stats to include in the feature_snapshot for explainability.
        """
        if not self._fitted:
            raise RuntimeError("Model has not been fitted yet — call fit() first")

        probs = self._compute_scoreline_probs(home_team, away_team)

        home_win_prob = 0.0
        draw_prob = 0.0
        away_win_prob = 0.0
        pred_home_goals = 0.0
        pred_away_goals = 0.0
        best_score = (0, 0)
        best_p = 0.0

        for (x, y), p in probs.items():
            pred_home_goals += x * p
            pred_away_goals += y * p
            if x > y:
                home_win_prob += p
            elif x == y:
                draw_prob += p
            else:
                away_win_prob += p
            if p > best_p:
                best_p = p
                best_score = (x, y)

        probs_sum = home_win_prob + draw_prob + away_win_prob
        if probs_sum > 0:
            home_win_prob /= probs_sum
            draw_prob /= probs_sum
            away_win_prob /= probs_sum

        # Confidence = probability of the most likely outcome
        confidence = max(home_win_prob, draw_prob, away_win_prob)

        # Outcome label
        if home_win_prob >= draw_prob and home_win_prob >= away_win_prob:
            outcome = "home_win"
        elif away_win_prob >= draw_prob:
            outcome = "away_win"
        else:
            outcome = "draw"

        # Feature snapshot for explainability
        feature_snapshot: dict = {
            "home_team": home_team,
            "away_team": away_team,
            "home_attack_strength": round(self.attack.get(home_team, 0.0), 4),
            "home_defense_strength": round(self.defense.get(home_team, 0.0), 4),
            "away_attack_strength": round(self.attack.get(away_team, 0.0), 4),
            "away_defense_strength": round(self.defense.get(away_team, 0.0), 4),
            "home_advantage": round(self.home_advantage, 4),
            "rho_correlation": round(self.rho, 4),
            "expected_home_goals": round(pred_home_goals, 2),
            "expected_away_goals": round(pred_away_goals, 2),
            "most_likely_scoreline": f"{best_score[0]}-{best_score[1]}",
        }
        if home_features:
            for k, v in home_features.items():
                feature_snapshot[f"home_{k}"] = v
        if away_features:
            for k, v in away_features.items():
                feature_snapshot[f"away_{k}"] = v

        return MatchPrediction(
            home_win_prob=round(home_win_prob, 4),
            draw_prob=round(draw_prob, 4),
            away_win_prob=round(away_win_prob, 4),
            predicted_home_score=round(pred_home_goals, 2),
            predicted_away_score=round(pred_away_goals, 2),
            confidence=round(confidence, 4),
            outcome=outcome,
            feature_snapshot=feature_snapshot,
        )

    # ------------------------------------------------------------------
    # Serialization helpers
    # ------------------------------------------------------------------

    def get_params(self) -> dict:
        """Return model parameters as a dict (for saving)."""
        return {
            "model_version": MODEL_VERSION,
            "rho": self.rho,
            "home_advantage": self.home_advantage,
            "attack": dict(self.attack),
            "defense": dict(self.defense),
            "max_goals": self.max_goals,
        }

    def load_params(self, params: dict) -> None:
        """Restore model parameters from a dict."""
        self.rho = params["rho"]
        self.home_advantage = params["home_advantage"]
        self.attack = params["attack"]
        self.defense = params["defense"]
        self.max_goals = params.get("max_goals", 8)
        self._fitted = True
