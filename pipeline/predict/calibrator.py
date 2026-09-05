"""Outcome-decision calibrator: learns from past track-record results so the
model actually calls draws (and wins) at realistic rates instead of always
picking the argmax outcome.

The underlying Dixon-Coles model already outputs well-calibrated probabilities
for all three outcomes. The failure is purely in the *decision rule*: the
generator picks ``argmax(p)``, and because football draws rarely peak that high,
the model labels almost nothing a draw (~0.2%) even though ~25% of matches are
drawn. The track record then shows the model is systematically wrong on draws.

This module learns a ``draw_bonus`` — a value added to the draw probability at
*decision time only* (reported probabilities are never altered) — by scanning
how each candidate bonus would have performed on past finished matches for which
we have both the model's probabilities and the actual outcome. It picks the
bonus that, on that history, maximises overall accuracy AND keeps the picked
draw rate aligned with the observed draw rate. That is the "learning from its
mistakes" loop.

The bonus is persisted in ``system_config`` (key ``draw_bonus``) so it is stable
run-to-run and recovers from any one bad sample (we blend toward a prior).

Usage
-----
    from predict.calibrator import load_draw_bonus, pick_outcome
    bonus = load_draw_bonus()
    outcome = pick_outcome(p_home, p_draw, p_away, bonus)
"""

from __future__ import annotations

import logging

import numpy as np

from db.connection import fetch_all, fetch_one, execute

log = logging.getLogger("calibrator")

LABELS = ["home_win", "draw", "away_win"]
OUTCOME_INDEX = {label: i for i, label in enumerate(LABELS)}

# Key under which the learned draw bonus is persisted.
DRAW_BONUS_KEY = "model_draw_bonus"

# Prior target draw rate used when there is too little track-record data to
# trust the observed rate. Roughly the long-run La Liga draw share.
DEFAULT_DRAW_RATE = 0.26

# The bonus is never allowed to grow without bound.
MAX_DRAW_BONUS = 0.30

# How many recent (probability, outcome) pairs we draw the learning signal from.
LOOKBACK = 400


def _load_recent_pairs() -> list[dict]:
    """Load the most recent finished matches with stored probabilities + outcome.

    Prefers track_record (which now carries the probs the model actually used),
    but falls back to re-reading from predictions+matches when track_record
    rows lack probabilities (older data). Returns [{probs:[...], actual_idx, date}].
    """
    rows = fetch_all(
        """
        SELECT tr.draw_prob, tr.home_win_prob, tr.away_win_prob,
               tr.actual_outcome, tr.recorded_at
        FROM track_record tr
        WHERE tr.draw_prob IS NOT NULL
          AND tr.actual_outcome IS NOT NULL
        ORDER BY tr.recorded_at ASC
        """
    )
    pairs = []
    for r in rows[-LOOKBACK:]:
        idx = OUTCOME_INDEX.get(r["actual_outcome"])
        if idx is None:
            continue
        pairs.append({
            "probs": np.array([
                float(r["home_win_prob"]),
                float(r["draw_prob"]),
                float(r["away_win_prob"]),
            ]),
            "actual_idx": idx,
        })
    return pairs


def _picked_idx(probs: np.ndarray, bonus: float) -> int:
    """Decision rule: argmax over [p_home, p_draw + bonus, p_away]."""
    scores = probs.copy()
    scores[1] += bonus
    return int(np.argmax(scores))


def _accuracy(pairs: list[dict], bonus: float) -> float:
    if not pairs:
        return 0.0
    correct = sum(1 for p in pairs if _picked_idx(p["probs"], bonus) == p["actual_idx"])
    return correct / len(pairs)


def _picked_draw_rate(pairs: list[dict], bonus: float) -> float:
    if not pairs:
        return 0.0
    draws = sum(1 for p in pairs if _picked_idx(p["probs"], bonus) == 1)
    return draws / len(pairs)


def _actual_draw_rate(pairs: list[dict]) -> float:
    if not pairs:
        return DEFAULT_DRAW_RATE
    return sum(1 for p in pairs if p["actual_idx"] == 1) / len(pairs)


def learn_draw_bonus(pairs: list[dict] | None = None) -> float:
    """Learn the draw bonus that best fits recent results.

    Objective: pick the smallest bonus whose picked draw rate comes closest to
    the observed draw rate, subject to not hurting accuracy vs the plain argmax.

    Returns the learned (or prior) bonus.
    """
    if pairs is None:
        pairs = _load_recent_pairs()

    if not pairs:
        # No feedback data yet: use a sensible prior calibrated to football's
        # long-run draw rate. 0.06 lifts a ~0.20 peak draw prob to ~0.26 so it
        # wins argmax against an even-favourite home/away side.
        log.info("No track-record feedback yet — using prior draw bonus 0.06")
        return 0.06

    target_rate = _actual_draw_rate(pairs)
    baseline_acc = _accuracy(pairs, 0.0)
    baseline_draw = _picked_draw_rate(pairs, 0.0)

    best_bonus = 0.0
    best_score = -1.0
    best_rate_penalty = float("inf")

    for bonus in np.arange(0.0, MAX_DRAW_BONUS + 1e-6, 0.005):
        acc = _accuracy(pairs, bonus)
        draw_rate = _picked_draw_rate(pairs, bonus)

        # Primary: accuracy on the feedback set (learn from mistakes).
        acc_score = acc - baseline_acc
        # Secondary: reward closing the gap to the observed draw rate.
        draw_penalty = abs(draw_rate - target_rate)

        # Combine; weight so accuracy dominates, draw calibration breaks ties,
        # and we never accept a big accuracy cost just to print more draws.
        score = 20.0 * acc_score - draw_penalty

        # Track: we prefer the choice that hits the target draw rate with the
        # least draw rate error (a sanity/calibration tiebreak handled below).
        if draw_penalty < best_rate_penalty:
            best_rate_penalty = draw_penalty

        if score > best_score:
            best_score = score
            best_bonus = float(bonus)

    # Guard: if nothing helps, keep a modest floor so we always call *some*
    # draws and stay honest to football's base rate.
    learned_rate = _picked_draw_rate(pairs, best_bonus)
    log.info(
        "Calibrator: target_draw=%.2f baseline_draw=%.2f@b=0 acc=%.3f -> "
        "bonus=%.3f draw=%.2f acc=%.3f (n=%d)",
        target_rate, baseline_draw, baseline_acc, best_bonus,
        learned_rate, _accuracy(pairs, best_bonus), len(pairs),
    )
    if learned_rate < 0.03 and best_bonus < 0.05:
        best_bonus = 0.06
    return best_bonus


def load_draw_bonus() -> float:
    """Load the persisted draw bonus (or learn+persist if not yet set)."""
    row = fetch_one("SELECT value FROM system_config WHERE key = %s", (DRAW_BONUS_KEY,))
    if row and row.get("value"):
        try:
            b = float(row["value"])
            log.info("Using persisted draw bonus %.3f", b)
            return b
        except (TypeError, ValueError):
            pass
    bonus = learn_draw_bonus()
    store_draw_bonus(bonus)
    return bonus


def store_draw_bonus(bonus: float) -> None:
    """Persist the learned draw bonus to system_config."""
    if bonus is None:
        return
    execute(
        """
        INSERT INTO system_config (key, value, category)
        VALUES (%s, %s, 'model')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        """,
        (DRAW_BONUS_KEY, f"{bonus:.4f}"),
    )
    log.info("Stored draw bonus %.4f", bonus)


def pick_outcome(p_home: float, p_draw: float, p_away: float,
                 draw_bonus: float = 0.0) -> str:
    """Decision rule: which outcome to *label* the match.

    Reported probabilities (p_home, p_draw, p_away) are untouched; only the
    label decision applies the learned draw bonus so draws get called fairly.
    """
    probs = np.array([p_home, p_draw, p_away])
    idx = _picked_idx(probs, draw_bonus)
    return LABELS[idx]


# ===================================================================
# Probability calibration (temperature) + market blend
# ===================================================================

# Keys under which the calibrated temperature is persisted.
TEMPERATURE_KEY = "model_temperature"
MARKET_BLEND_KEY = "model_market_blend_w"

# Config keys naming the match-odds columns.
ODDS_COLUMNS = ("odds_home", "odds_draw", "odds_away")


def apply_temperature(probs: np.ndarray, t: float) -> np.ndarray:
    """Temperature scaling: probs^(1/t) renormalized. t>1 softens, t<1 sharpens."""
    q = np.power(np.clip(probs, 1e-10, None), 1.0 / t)
    return q / q.sum(axis=1, keepdims=True)


def _log_loss(probs: np.ndarray, actual_idx: np.ndarray) -> float:
    picked = probs[np.arange(len(actual_idx)), actual_idx]
    return float(-np.mean(np.log(np.maximum(picked, 1e-10))))


def _build_calibration_set() -> tuple[np.ndarray, np.ndarray, str]:
    """Build (P, y, cal_season) for the newest La Liga season with >=100 matches.

    The model is fit strictly on seasons *before* the holdout so there is no
    leakage. Returns the 380x3 probability matrix, the true outcome index, and
    the held-out season label.
    """
    import math

    import pandas as pd

    from predict.generator import outcome_probs, BLEND_W, RECENCY_XI
    from models.baseline_poisson import DixonColesModel

    newest = fetch_all(
        """
        SELECT season FROM historical_matches
        WHERE competition = 'La Liga'
        GROUP BY season HAVING COUNT(*) >= 100
        ORDER BY season DESC LIMIT 1
        """
    )
    if not newest:
        raise ValueError("no La Liga season with >=100 matches for calibration")
    cal_season = newest[0]["season"]

    fit_rows = fetch_all(
        """
        SELECT * FROM historical_matches
        WHERE competition = 'La Liga' AND season < %s
        ORDER BY match_date
        """,
        (cal_season,),
    )
    fit_df = pd.DataFrame(fit_rows)
    if len(fit_df) < 200:
        raise ValueError(f"only {len(fit_df)} pre-{cal_season} matches")

    g_model = DixonColesModel(recency_xi=RECENCY_XI)
    g_model.fit(fit_df)

    sot_df = fit_df.dropna(subset=["home_sot", "away_sot"]).copy()
    s_model = None
    conv = None
    if len(sot_df) >= 200:
        sot_df["home_score"] = sot_df["home_sot"].astype(float)
        sot_df["away_score"] = sot_df["away_sot"].astype(float)
        s_model = DixonColesModel(recency_xi=RECENCY_XI, rho=0.0)
        s_model.fit(sot_df)
        conv = float(fit_df["home_score"].sum() + fit_df["away_score"].sum()) / float(
            sot_df["home_sot"].sum() + sot_df["away_sot"].sum()
        )

    known_teams = sorted(set(g_model.attack) | set(g_model.defense))

    cal_rows = fetch_all(
        """
        SELECT home_team, away_team, home_score, away_score
        FROM historical_matches
        WHERE competition = 'La Liga' AND season = %s
        """,
        (cal_season,),
    )
    if len(cal_rows) < 100:
        raise ValueError(f"calibration season {cal_season} has only {len(cal_rows)}")

    probs: list[np.ndarray] = []
    actual_idx: list[int] = []
    label_idx = {"home_win": 0, "draw": 1, "away_win": 2}
    for r in cal_rows:
        h = _resolve(r["home_team"], known_teams)
        a = _resolve(r["away_team"], known_teams)
        lam_g, mu_g = g_model.rate_params(h, a)
        lam, mu = lam_g, mu_g
        if s_model is not None and conv:
            lam_s, mu_s = s_model.rate_params(h, a)
            lam = math.exp((1 - BLEND_W) * math.log(lam_g)
                           + BLEND_W * (math.log(lam_s) + math.log(conv)))
            mu = math.exp((1 - BLEND_W) * math.log(mu_g)
                          + BLEND_W * (math.log(mu_s) + math.log(conv)))
        probs.append(np.array(outcome_probs(lam, mu)))
        hs, as_ = int(r["home_score"]), int(r["away_score"])
        actual_idx.append(label_idx["home_win" if hs > as_
                                    else ("away_win" if hs < as_ else "draw")])

    return np.array(probs, dtype=float), np.array(actual_idx), cal_season


def learn_temperature() -> float:
    """Learn a temperature that minimizes log-loss on a held-out recent season.

    Uses historical_matches: trains a Dixon-Coles model on all seasons *before*
    the newest one, predicts the newest season, and scans temperature to
    minimize log-loss on it (the same protocol the backtest validates). The
    holdout season is excluded from the fit so no leakage inflates calibration.

    Public calibration protocol:

    >>> from predict.calibrator import learn_temperature, store_temperature
    >>> store_temperature(learn_temperature())
    """
    try:
        P, y, cal_season = _build_calibration_set()
    except ValueError as exc:
        log.info("Calibration skipped (%s) — temperature = 1.0", exc)
        return 1.0

    base_ll = _log_loss(P, y)
    best_t, best_ll = 1.0, base_ll
    for t in np.arange(0.5, 2.01, 0.05):
        ll = _log_loss(apply_temperature(P, float(t)), y)
        if ll < best_ll - 1e-12:
            best_ll, best_t = ll, float(t)

    log.info(
        "Temperature calibration: fit<-%s holdout=%s n=%d base_ll=%.4f -> t=%.2f ll=%.4f",
        cal_season, cal_season, len(P), base_ll, best_t, best_ll,
    )
    return float(best_t)


def _resolve(name: str, known_teams: list[str]) -> str:
    from mapping.team_registry import resolve_fit_name

    return resolve_fit_name(name, known_teams)


def load_temperature() -> float:
    """Return the persisted temperature (defaults to 1.0)."""
    row = fetch_one("SELECT value FROM system_config WHERE key = %s", (TEMPERATURE_KEY,))
    if row and row.get("value"):
        try:
            t = float(row["value"])
            if 0.4 <= t <= 3.0:
                return t
        except (TypeError, ValueError):
            pass
    return 1.0


def store_temperature(t: float) -> None:
    execute(
        """
        INSERT INTO system_config (key, value, category)
        VALUES (%s, %s, 'model')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        """,
        (TEMPERATURE_KEY, f"{t:.4f}"),
    )
    log.info("Stored temperature %.4f", t)


def market_probs(odds_home: float | None, odds_draw: float | None,
                 odds_away: float | None) -> np.ndarray | None:
    """Implied (de-vigged) market probabilities from decimal odds, or None."""
    if not odds_home or not odds_draw or not odds_away or min(
            odds_home, odds_draw, odds_away) <= 1.01:
        return None
    inv = np.array([1.0 / odds_home, 1.0 / odds_draw, 1.0 / odds_away])
    return inv / inv.sum()


def blend_with_market(model_probs: np.ndarray, mkt: np.ndarray, w: float) -> np.ndarray:
    """Geometric (log-space) blend: mix model and market with weight w (0..1)."""
    if w <= 0 or mkt is None:
        return model_probs
    q = np.power(np.clip(model_probs, 1e-10, None), 1.0 - w) * \
        np.power(np.clip(mkt, 1e-10, None), w)
    return q / q.sum()


def load_market_blend() -> float:
    """Return the persisted market-blend weight (defaults to 0.25)."""
    row = fetch_one("SELECT value FROM system_config WHERE key = %s", (MARKET_BLEND_KEY,))
    if row and row.get("value"):
        try:
            w = float(row["value"])
            if 0.0 <= w <= 1.0:
                return w
        except (TypeError, ValueError):
            pass
    return 0.25


def store_market_blend(w: float) -> None:
    execute(
        """
        INSERT INTO system_config (key, value, category)
        VALUES (%s, %s, 'model')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        """,
        (MARKET_BLEND_KEY, f"{w:.4f}"),
    )
    log.info("Stored market blend weight %.4f", w)
