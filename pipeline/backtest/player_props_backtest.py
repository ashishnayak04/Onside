"""Player props backtest: xG-share method vs naive position-cap heuristic.

Test season: 2024/2025 (Understat year=2024 for fixtures + scorers).
Player shares: PRIOR season (Understat year=2023) — no leakage.
Match-level lam/mu: DC-SOT fit on DB seasons < 2024/2025.

Actual scorers from Understat getMatchData/{id} (XHR endpoint).
Cache to pipeline/data/understat_matches/{id}.json; ~1.2s sleep between requests.

Usage
-----
    python -m backtest.player_props_backtest --limit 25
    python -m backtest.player_props_backtest --limit 120 --no-cache
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import re
import time
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd
import requests

from db.connection import fetch_all

log = logging.getLogger("player_props_backtest")

TEST_SEASON_LABEL = "2024/2025"
TEST_YEAR = 2024
PRIOR_YEAR = 2023

MATCH_CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "understat_matches"
MATCH_CACHE_DIR.mkdir(parents=True, exist_ok=True)

UNDERSTAT_MATCH_URL = "https://understat.com/getMatchData/{match_id}"
UNDERSTAT_LEAGUE_URL = "https://understat.com/getLeagueData/La_liga/{year}"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Referer": "https://understat.com/",
    "X-Requested-With": "XMLHttpRequest",
}

REQUEST_DELAY = 1.2


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z]", "", s.lower())


def _cached(match_id: int) -> dict | None:
    p = MATCH_CACHE_DIR / f"{match_id}.json"
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass
    return None


def _cache_save(match_id: int, data: dict) -> None:
    (MATCH_CACHE_DIR / f"{match_id}.json").write_text(
        json.dumps(data), encoding="utf-8"
    )


def fetch_match(match_id: int) -> dict | None:
    """Fetch Understat match data with retries + disk cache."""
    cached = _cached(match_id)
    if cached is not None:
        return cached
    for attempt in range(4):
        try:
            resp = requests.get(
                UNDERSTAT_MATCH_URL.format(match_id=match_id),
                headers=HEADERS, timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            _cache_save(match_id, data)
            return data
        except (requests.RequestException, ValueError) as e:
            wait = 3 * (attempt + 1)
            log.warning("match %d attempt %d/4 failed: %s — retry in %ds",
                        match_id, attempt + 1, e, wait)
            time.sleep(wait)
    log.error("Giving up on match %d after 4 attempts", match_id)
    return None


def fetch_prior_players(year: int) -> list[dict]:
    """Fetch per-player season data from Understat (with retries)."""
    url = UNDERSTAT_LEAGUE_URL.format(year=year)
    last_err: Exception | None = None
    for attempt in range(4):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            players = data.get("players", []) if isinstance(data, dict) else []
            if isinstance(players, list) and players:
                log.info("Understat %d/%d: %d players fetched", year, year + 1, len(players))
                return players
            raise ValueError("No 'players' key in response")
        except (requests.RequestException, ValueError, KeyError) as e:
            last_err = e
            wait = 5 * (attempt + 1)
            log.warning("Fetch %s failed (attempt %d/4): %s — retrying in %ds",
                        url, attempt + 1, e, wait)
            time.sleep(wait)
    raise RuntimeError(f"Failed to fetch {url}") from last_err


# ---------------------------------------------------------------------------
# Player table from Understat season data (PRIOR season — no leakage)
# ---------------------------------------------------------------------------

GOAL_PRIOR = {"F": 0.30, "M": 0.10, "D": 0.04, "G": 0.005}
ASSIST_PRIOR = {"F": 0.10, "M": 0.20, "D": 0.03, "G": 0.01}
SHOT_PRIOR = {"F": 0.34, "M": 0.16, "D": 0.06, "G": 0.005}
SHRINK_K = 8.0


def _pos_bucket(pos: str | None) -> str:
    p = (pos or "").strip().upper()
    if p.startswith("F"):
        return "F"
    if p.startswith("M"):
        return "M"
    if p.startswith("D"):
        return "D"
    return "G"


def build_prior_player_table(players: list[dict]) -> dict[str, dict]:
    """Return {team_title_norm: {"players": [...], "xg":, "xa":, "shots":}}.

    Shares are shrunk toward position priors (Bayesian-style pseudo-count k).
    """
    teams: dict[str, dict] = {}
    for p in players:
        t = norm(p.get("team_title", ""))
        teams.setdefault(t, {"players": [], "xg": 0.0, "xa": 0.0, "shots": 0.0})
        xg = float(p.get("xG") or 0.0)
        xa = float(p.get("xA") or 0.0)
        sh = float(p.get("shots") or 0.0)
        teams[t]["players"].append({
            "name": norm(p.get("player_name", "")),
            "display": p.get("player_name", ""),
            "pos": _pos_bucket(p.get("position")),
            "xg": xg, "xa": xa, "shots": sh,
        })
        teams[t]["xg"] += xg
        teams[t]["xa"] += xa
        teams[t]["shots"] += sh

    for t, data in teams.items():
        tot_xg, tot_xa, tot_sh = data["xg"], data["xa"], data["shots"]
        n_pl = max(len(data["players"]), 1)
        for pl in data["players"]:
            k = SHRINK_K
            gp = GOAL_PRIOR[pl["pos"]]
            ap = ASSIST_PRIOR[pl["pos"]]
            sp = SHOT_PRIOR[pl["pos"]]
            pl["share_xg"] = (pl["xg"] + k * gp) / (tot_xg + k * gp * n_pl) if tot_xg else gp
            pl["share_xa"] = (pl["xa"] + k * ap) / (tot_xa + k * ap * n_pl) if tot_xa else ap
            pl["share_sh"] = (pl["shots"] + k * sp) / (tot_sh + k * sp * n_pl) if tot_sh else sp
    return teams


def build_player_lookup(table: dict[str, dict]) -> dict[str, dict]:
    """Flat lookup: norm(player_name) -> player stats dict (with shares)."""
    lookup: dict[str, dict] = {}
    for team_data in table.values():
        for pl in team_data["players"]:
            lookup[pl["name"]] = pl
    return lookup


# ---------------------------------------------------------------------------
# Method probabilities (xG-share, Poisson thinning)
# ---------------------------------------------------------------------------

MAX_GOAL_PROB = 0.85


def method_probs(
    player: dict,
    exp_goals: float,
    conversion: float = 0.31,
) -> tuple[float, float, float]:
    """Return (goal_prob, assist_prob, sot_prob) for one player."""
    g = min(1 - math.exp(-exp_goals * player["share_xg"]), MAX_GOAL_PROB)
    a = min(1 - math.exp(-exp_goals * player["share_xa"]), MAX_GOAL_PROB)
    exp_sot = exp_goals / conversion
    s = 1 - math.exp(-exp_sot * player["share_sh"])
    return g, a, s


# ---------------------------------------------------------------------------
# Naive baseline (faithful run_pipeline port)
# ---------------------------------------------------------------------------

def naive_probs(
    position: str,
    team_xg: float,
    n_outfield: int = 10,
) -> tuple[float, float, float]:
    """Return (goal_prob, assist_prob, sot_prob) for one player.

    Faithful port from run_pipeline with position-based caps:
      FWD:  min(0.4,  lam * 3 / n)
      MID:  min(0.15, lam * 1.5 / n)
      else: min(0.05, lam * 0.5 / n)
    Assist uses SOT analog (same caps).
    """
    n = max(n_outfield, 1)
    p = position.upper()
    if p.startswith("F"):
        cap, factor = 0.4, 3.0
    elif p.startswith("M"):
        cap, factor = 0.15, 1.5
    else:
        cap, factor = 0.05, 0.5
    g = min(cap, team_xg * factor / n)
    a = min(cap, team_xg * factor / n)
    s = min(cap, team_xg * factor / n)
    return g, a, s


# ---------------------------------------------------------------------------
# Evaluation metrics
# ---------------------------------------------------------------------------

def brier_score(preds: np.ndarray, actuals: np.ndarray) -> float:
    """Binary Brier score (lower is better, 0 is perfect)."""
    return float(np.mean((preds - actuals) ** 2))


def log_loss_binary(preds: np.ndarray, actuals: np.ndarray) -> float:
    """Binary cross-entropy (lower is better)."""
    eps = 1e-10
    clipped = np.clip(preds, eps, 1 - eps)
    return float(-np.mean(
        actuals * np.log(clipped) + (1 - actuals) * np.log(1 - clipped)
    ))


def paired_bootstrap(
    delta: np.ndarray, n_boot: int = 2000, seed: int = 7
) -> tuple[float, float, float]:
    """Paired bootstrap 95% CI on mean(delta). Returns (mean, lo, hi)."""
    rng = np.random.default_rng(seed)
    n = len(delta)
    means = np.empty(n_boot)
    for b in range(n_boot):
        idx = rng.integers(0, n, n)
        means[b] = np.mean(delta[idx])
    return float(np.mean(delta)), float(np.percentile(means, 2.5)), \
        float(np.percentile(means, 97.5))


# ---------------------------------------------------------------------------
# Main backtest
# ---------------------------------------------------------------------------

def _join_matches(
    umatches: list[dict],
    db_by_date: dict[str, list[dict]],
) -> list[tuple[dict, dict]]:
    """Join Understat matches ↔ DB historical_matches by date±3d + team names."""
    pairs: list[tuple[dict, dict]] = []
    used_db: set[int] = set()
    for um in umatches:
        ht = norm(um.get("h", {}).get("title", "") if isinstance(um.get("h"), dict) else um.get("h", ""))
        at = norm(um.get("a", {}).get("title", "") if isinstance(um.get("a"), dict) else um.get("a", ""))
        dt = pd.Timestamp(um.get("datetime", ""))
        for delta_days in range(-3, 4):
            key = (dt + pd.Timedelta(days=delta_days)).strftime("%Y-%m-%d")
            for db in db_by_date.get(key, []):
                if db["_id"] in used_db:
                    continue
                db_h = norm(db["home_team"])
                db_a = norm(db["away_team"])
                if (ht == db_h or ht in db_h or db_h in ht) and \
                   (at == db_a or at in db_a or db_a in at):
                    pairs.append((um, db))
                    used_db.add(db["_id"])
                    break
            else:
                continue
            break
    return pairs


def run(limit: int = 120, use_cache: bool = True) -> dict:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )

    # --- Historical data from DB ---
    hist = fetch_all(
        "SELECT home_team, away_team, home_score, away_score, "
        "home_sot, away_sot, match_date, season "
        "FROM historical_matches WHERE competition = 'La Liga' ORDER BY match_date"
    )
    df = pd.DataFrame(hist)
    log.info("Loaded %d historical La Liga matches", len(df))

    # --- DC-SOT on DB seasons < test season ---
    fit_df = df[df["season"] < TEST_SEASON_LABEL].copy()
    log.info("Fitting DC-SOT on %d matches (seasons < %s)", len(fit_df), TEST_SEASON_LABEL)

    from backtest.xgb_backtest import fit_dc_sot
    model_pack = fit_dc_sot(fit_df)

    # --- Conversion factor (goals per SOT) ---
    conv = model_pack[2] or 0.31

    # --- Understat matches for test season (year=2024 = 2024/2025) ---
    log.info("Fetching Understat match data for year=%d (test season)...", TEST_YEAR)
    time.sleep(REQUEST_DELAY)
    try:
        resp = requests.get(
            UNDERSTAT_LEAGUE_URL.format(year=TEST_YEAR),
            headers=HEADERS, timeout=60,
        )
        resp.raise_for_status()
        us_data = resp.json()
        umatches_raw = us_data.get("dates", [])
        umatches = umatches_raw[:limit]
        log.info("Got %d Understat matches (limited to %d)", len(umatches_raw), limit)
    except Exception as e:
        log.error("Failed to fetch Understat league data: %s", e)
        return {"error": str(e)}

    # --- Prior season player data (year=2023) for shares (NO leakage) ---
    log.info("Fetching prior season player data (year=%d)...", PRIOR_YEAR)
    time.sleep(REQUEST_DELAY)
    prior_players = fetch_prior_players(PRIOR_YEAR)
    prior_table = build_prior_player_table(prior_players)
    player_lookup = build_player_lookup(prior_table)

    # --- DB matches indexed by date for joining ---
    db_matches = df.to_dict("records")
    for i, m in enumerate(db_matches):
        m["_id"] = i
        m["_date_str"] = pd.Timestamp(m["match_date"]).strftime("%Y-%m-%d")
    db_by_date: dict[str, list[dict]] = {}
    for m in db_matches:
        db_by_date.setdefault(m["_date_str"], []).append(m)

    # --- Join Understat ↔ DB ---
    log.info("Joining %d Understat matches with DB by date±3d + team names...", len(umatches))
    pairs = _join_matches(umatches, db_by_date)
    log.info("Matched %d / %d Understat fixtures to DB", len(pairs), len(umatches))
    if not pairs:
        print("No matches joined — cannot backtest.")
        return {"error": "no matches joined"}

    # --- Fetch actual scorers per match ---
    scorer_map: dict[int, dict] = {}
    for um, _ in pairs:
        mid = um.get("id")
        if mid is None:
            continue
        time.sleep(REQUEST_DELAY)
        mdata = fetch_match(mid)
        if mdata is None:
            continue
        scorers: dict[str, list[str]] = {"h": [], "a": []}
        assists: dict[str, list[str]] = {"h": [], "a": []}
        rosters = (mdata.get("rosters") or {})
        for side in ("h", "a"):
            for pid, pdata in (rosters.get(side) or {}).items():
                goals = pdata.get("goals", 0) or 0
                if int(goals) > 0:
                    scorers[side].append(norm(pdata.get("player", "")))
        # Assists from shots data (shots is dict with 'h'/'a' lists)
        shots_data = mdata.get("shots") or {}
        for side in ("h", "a"):
            for shot in shots_data.get(side, []):
                if shot.get("result") != "Goal":
                    continue
                a_name = norm(shot.get("player_assisted") or "")
                if a_name:
                    assists[side].append(a_name)
        scorer_map[mid] = {"scorers": scorers, "assists": assists, "rosters": rosters}
    log.info("Fetched scorers for %d / %d matches", len(scorer_map), len(pairs))

    # --- Evaluation ---
    method_goal_preds, method_goal_actuals = [], []
    naive_goal_preds, naive_goal_actuals = [], []
    method_assist_preds, method_assist_actuals = [], []
    naive_assist_preds, naive_assist_actuals = [], []
    method_sot_preds, method_sot_actuals = [], []
    naive_sot_preds, naive_sot_actuals = [], []

    for um, db in pairs:
        mid = um.get("id")
        if mid not in scorer_map:
            continue
        smap = scorer_map[mid]
        h_goals_norm = [norm(n) for n in smap["scorers"].get("h", [])]
        a_goals_norm = [norm(n) for n in smap["scorers"].get("a", [])]
        h_assist_norm = [norm(n) for n in smap["assists"].get("h", [])]
        a_assist_norm = [norm(n) for n in smap["assists"].get("a", [])]

        # DC-SOT rates for this match
        g_model, s_model, conv_pack = model_pack
        lam_g, mu_g = g_model.rate_params(db["home_team"], db["away_team"])
        lam, mu = lam_g, mu_g
        if s_model is not None:
            lam_s, mu_s = s_model.rate_params(db["home_team"], db["away_team"])
            lam = math.exp((1 - 0.4) * math.log(lam_g)
                           + 0.4 * (math.log(lam_s) + math.log(conv_pack)))
            mu = math.exp((1 - 0.4) * math.log(mu_g)
                          + 0.4 * (math.log(mu_s) + math.log(conv_pack)))

        # Home team roster from fetched match data
        h_roster = smap["rosters"].get("h", {})
        a_roster = smap["rosters"].get("a", {})

        h_outfield = 0
        a_outfield = 0

        # Home team
        for pid, pdata in h_roster.items():
            pname = norm(pdata.get("player", ""))
            pos = pdata.get("position", "")
            position = _pos_bucket(pos)
            if position == "G":
                continue
            h_outfield += 1
            scored = 1 if pname in h_goals_norm else 0
            assisted = 1 if pname in h_assist_norm else 0
            has_sot = 1 if int(pdata.get("shots", 0) or 0) > 0 else scored
            pl = player_lookup.get(pname)
            if pl:
                mg, ma, ms = method_probs(pl, lam, conv)
            else:
                mg, ma, ms = naive_probs(position, lam)

            ng, na, ns = naive_probs(position, lam)
            method_goal_preds.append(mg);  method_goal_actuals.append(scored)
            naive_goal_preds.append(ng);   naive_goal_actuals.append(scored)
            method_assist_preds.append(ma); method_assist_actuals.append(assisted)
            naive_assist_preds.append(na);  naive_assist_actuals.append(assisted)
            method_sot_preds.append(ms);   method_sot_actuals.append(has_sot)
            naive_sot_preds.append(ns);    naive_sot_actuals.append(has_sot)

        # Away team
        for pid, pdata in a_roster.items():
            pname = norm(pdata.get("player", ""))
            pos = pdata.get("position", "")
            position = _pos_bucket(pos)
            if position == "G":
                continue
            a_outfield += 1
            scored = 1 if pname in a_goals_norm else 0
            assisted = 1 if pname in a_assist_norm else 0
            has_sot = 1 if int(pdata.get("shots", 0) or 0) > 0 else scored

            pl = player_lookup.get(pname)
            if pl:
                mg, ma, ms = method_probs(pl, mu, conv)
            else:
                mg, ma, ms = naive_probs(position, mu)

            ng, na, ns = naive_probs(position, mu)
            method_goal_preds.append(mg);  method_goal_actuals.append(scored)
            naive_goal_preds.append(ng);   naive_goal_actuals.append(scored)
            method_assist_preds.append(ma); method_assist_actuals.append(assisted)
            naive_assist_preds.append(na);  naive_assist_actuals.append(assisted)
            method_sot_preds.append(ms);   method_sot_actuals.append(has_sot)
            naive_sot_preds.append(ns);    naive_sot_actuals.append(has_sot)

    n = len(method_goal_preds)
    if n == 0:
        print("No player-match observations — cannot evaluate.")
        return {"error": "no observations"}

    mgp = np.array(method_goal_preds)
    mga = np.array(method_goal_actuals)
    ngp = np.array(naive_goal_preds)
    nga = np.array(naive_goal_actuals)
    map_ = np.array(method_assist_preds)
    maa = np.array(method_assist_actuals)
    nap = np.array(naive_assist_preds)
    naa = np.array(naive_assist_actuals)
    msp = np.array(method_sot_preds)
    msa = np.array(method_sot_actuals)
    nsp = np.array(naive_sot_preds)
    nsa = np.array(naive_sot_actuals)

    # --- Report ---
    print("\n" + "=" * 66)
    print("  PLAYER PROPS BACKTEST — %s (test: %s)" % ("La Liga", TEST_SEASON_LABEL))
    print("  Prior season player data: year=%d (Understat %d/%d)" %
          (PRIOR_YEAR, PRIOR_YEAR, PRIOR_YEAR + 1))
    print("  DC-SOT fit on DB seasons < %s" % TEST_SEASON_LABEL)
    print("=" * 66)
    print("  Observations: %d player-match rows (from %d matched fixtures)" % (n, len(pairs)))
    print("  Actual scored rate: %.1f%%" % (100 * np.mean(mga)))
    print("  Actual assisted rate: %.1f%%" % (100 * np.mean(maa)))
    print("  Actual SOT rate: %.1f%%" % (100 * np.mean(msa)))
    print("-" * 66)
    print("  %-24s %10s %10s" % ("metric", "method", "naive"))
    print("-" * 66)

    def _row(label: str, mp: np.ndarray, ma: np.ndarray,
             np_: np.ndarray, na: np.ndarray) -> tuple[float, float]:
        mb = brier_score(mp, ma)
        nb = brier_score(np_, na)
        print("  %-24s %10.4f %10.4f" % (label, mb, nb))
        return mb, nb

    gmb, gnb = _row("Brier (goals)", mgp, mga, ngp, nga)
    amb, anb = _row("Brier (assists)", map_, maa, nap, naa)
    smb, snb = _row("Brier (SOT)", msp, msa, nsp, nsa)

    print()
    _row("Log-loss (goals)", mgp, mga, ngp, nga)
    _row("Log-loss (assists)", map_, maa, nap, naa)
    _row("Log-loss (SOT)", msp, msa, nsp, nsa)

    # --- Paired bootstrap on Brier delta (naive − method; negative = method better) ---
    # Per-observation Brier delta for each metric
    delta_goals = (ngp - nga)**2 - (mgp - mga)**2
    delta_assists = (nap - naa)**2 - (map_ - maa)**2
    delta_sot = (nsp - nsa)**2 - (msp - msa)**2
    delta = delta_goals + delta_assists + delta_sot
    mean_d, lo, hi = paired_bootstrap(delta)
    print("-" * 66)
    print("  PAIRED BOOTSTRAP (2000 resamples, Brier delta naive − method)")
    print("    mean delta: %+0.4f  95%% CI [%+0.4f, %+0.4f]" % (mean_d, lo, hi))
    method_wins = lo > 0
    verdict = ("METHOD WINS" if method_wins else
               "NO SIGNIFICANT WINNER — naive holds")
    print("  VERDICT: %s" % verdict)
    print("-" * 66)

    # --- Calibration ---
    print("  CALIBRATION (method goal probs, buckets):")
    buckets = [(0, 0.05), (0.05, 0.1), (0.1, 0.2), (0.2, 0.35), (0.35, 0.6), (0.6, 1.0)]
    for lo_b, hi_b in buckets:
        mask = (mgp >= lo_b) & (mgp < hi_b)
        if mask.any():
            obs = mga[mask].mean()
            exp = mgp[mask].mean()
            print("    [%5.2f, %5.2f): n=%3d  observed=%.3f  expected=%.3f  gap=%+.3f" %
                  (lo_b, hi_b, mask.sum(), obs, exp, obs - exp))
    print("=" * 66)

    return {
        "n_observations": n,
        "n_fixtures": len(pairs),
        "method_brier_goals": round(gmb, 4),
        "naive_brier_goals": round(gnb, 4),
        "method_brier_assists": round(amb, 4),
        "naive_brier_assists": round(anb, 4),
        "method_brier_sot": round(smb, 4),
        "naive_brier_sot": round(snb, 4),
        "bootstrap_delta": [round(mean_d, 4), round(lo, 4), round(hi, 4)],
        "verdict": verdict,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Player props backtest: xG-share vs naive baseline"
    )
    parser.add_argument("--limit", type=int, default=120,
                        help="Max Understat matches to process (default 120)")
    parser.add_argument("--no-cache", action="store_true",
                        help="Ignore cached Understat responses")
    args = parser.parse_args()
    run(limit=args.limit, use_cache=not args.no_cache)


if __name__ == "__main__":
    main()
