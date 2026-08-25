"""Player prop predictions from Understat xG/xA/shots data.

Replaces the naive position-cap heuristic in run_pipeline with xG-derived
probabilities:

  - Per-player share of team scoring is estimated from last season's xG,
    shrunk toward a position prior (Bayesian-style with pseudo-count k).
  - P(player scores)   = 1 - exp(-team_expected_goals * share_xg)
  - P(player assists)  = 1 - exp(-team_expected_goals * share_xa)
  - P(player SOT >= 1) = 1 - exp(-team_expected_sot   * share_sot)

Usage
-----
    python -m predict.player_props            # upcoming fixtures preview
    python -m predict.player_props --year 2025
"""

from __future__ import annotations

import argparse
import difflib
import logging
import math
import re
import time
import unicodedata

import requests

from db.connection import fetch_all

log = logging.getLogger("player_props")

UNDERSTAT_LEAGUE_URL = "https://understat.com/getLeagueData/La_liga/{year}"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Referer": "https://understat.com/league/La_liga/2024",
    "X-Requested-With": "XMLHttpRequest",
}

# football-data.co.uk name (normalized) -> Understat title (normalized)
FD_TO_UNDERSTAT = {
    "ath madrid": "atletico madrid",
    "ath bilbao": "athletic club",
    "sociedad": "real sociedad",
    "betis": "real betis",
    "vallecano": "rayo vallecano",
    "celta": "celta vigo",
    "espanol": "espanyol",
    "alaves": "deportivo alaves",
    "valladolid": "real valladolid",
    "mallorca": "rcd mallorca",
}

# Share priors (fraction of team total) and shrinkage strength
GOAL_PRIOR = {"F": 0.30, "M": 0.10, "D": 0.04, "G": 0.005}
ASSIST_PRIOR = {"F": 0.10, "M": 0.20, "D": 0.03, "G": 0.01}
SHOT_PRIOR = {"F": 0.34, "M": 0.16, "D": 0.06, "G": 0.005}
SHRINK_K = 8.0

MAX_GOAL_PROB = 0.85
DEFAULT_CONVERSION = 0.31  # goals per SOT, league average fallback


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z]", "", s.lower())


def resolve_understat_team(fd_name: str, known_titles: set[str]) -> str | None:
    n = norm(fd_name)
    mapped = FD_TO_UNDERSTAT.get(n, n)
    if mapped in known_titles:
        return mapped
    close = difflib.get_close_matches(mapped, sorted(known_titles), n=1, cutoff=0.6)
    return close[0] if close else None


def fetch_players(year: int) -> list[dict]:
    """Fetch per-player season aggregates from Understat (with retries)."""
    url = UNDERSTAT_LEAGUE_URL.format(year=year)
    last_err: Exception | None = None
    for attempt in range(4):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=60)
            resp.raise_for_status()
            players = resp.json()["players"]
            log.info("Understat %d/%d: %d players fetched", year, year + 1, len(players))
            return players
        except (requests.RequestException, ValueError, KeyError) as e:
            last_err = e
            wait = 5 * (attempt + 1)
            log.warning("Fetch %s failed (attempt %d/4): %s — retrying in %ds",
                        url, attempt + 1, e, wait)
            time.sleep(wait)
    raise RuntimeError(f"Failed to fetch {url}") from last_err


def _position_bucket(position: str | None) -> str:
    p = (position or "").strip().upper()
    if p.startswith("F"):
        return "F"
    if p.startswith("M"):
        return "M"
    if p.startswith("D"):
        return "D"
    return "G"


def build_player_table(players: list[dict]) -> dict[str, dict[str, dict]]:
    """Return {understat_team_title_norm: {player_name_norm: stats}} where
    stats carries shrunk shares of team xG / xA / shots."""
    teams: dict[str, dict] = {}
    for p in players:
        t = norm(p["team_title"])
        teams.setdefault(t, {"players": [], "xg": 0.0, "xa": 0.0, "shots": 0.0})
        xg = float(p.get("xG") or 0.0)
        xa = float(p.get("xA") or 0.0)
        sh = float(p.get("shots") or 0.0)
        teams[t]["players"].append({
            "name": norm(p["player_name"]),
            "display": p["player_name"],
            "pos": _position_bucket(p.get("position")),
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
            gp, ap, sp = GOAL_PRIOR[pl["pos"]], ASSIST_PRIOR[pl["pos"]], SHOT_PRIOR[pl["pos"]]
            pl["share_xg"] = (pl["xg"] + k * gp) / (tot_xg + k * gp * n_pl) if tot_xg else gp
            pl["share_xa"] = (pl["xa"] + k * ap) / (tot_xa + k * ap * n_pl) if tot_xa else ap
            pl["share_sh"] = (pl["shots"] + k * sp) / (tot_sh + k * sp * n_pl) if tot_sh else sp
    return teams


def generate_props(
    home_fd: str, away_fd: str, lam: float, mu: float,
    player_table: dict[str, dict], conversion: float = DEFAULT_CONVERSION,
    known_titles: set[str] | None = None,
) -> list[dict]:
    """Props for one fixture. lam/mu are team expected GOALS (home/away).

    Returns list of {player, side, position, goal_prob, assist_prob, sot_prob}.
    """
    known = known_titles or set(player_table.keys())
    out: list[dict] = []
    for side, fd_name, exp_goals in (("home", home_fd, lam), ("away", away_fd, mu)):
        us_title = resolve_understat_team(fd_name, known)
        squad = player_table.get(us_title, {}).get("players", []) if us_title else []
        exp_sot = exp_goals / conversion
        for pl in squad:
            out.append({
                "player": pl["display"],
                "side": side,
                "position": pl["pos"],
                "goal_prob": round(min(1 - math.exp(-exp_goals * pl["share_xg"]),
                                       MAX_GOAL_PROB), 4),
                "assist_prob": round(min(1 - math.exp(-exp_goals * pl["share_xa"]),
                                         MAX_GOAL_PROB), 4),
                "shots_on_target_prob": round(1 - math.exp(-exp_sot * pl["share_sh"]), 4),
            })
    return out


def conversion_from_db() -> float:
    rows = fetch_all(
        "SELECT SUM(home_score + away_score) AS g, "
        "SUM(COALESCE(home_sot, 0) + COALESCE(away_sot, 0)) AS s "
        "FROM historical_matches WHERE competition = 'La Liga'"
    )
    r = rows[0] if rows else {}
    if r.get("g") and r.get("s") and float(r["s"]) > 0:
        conv = float(r["g"]) / float(r["s"])
        if 0.1 < conv < 0.7:
            return conv
    return DEFAULT_CONVERSION


def main() -> None:
    parser = argparse.ArgumentParser(description="Player prop preview for scheduled fixtures")
    parser.add_argument("--year", type=int, default=2025,
                        help="Understat season start year for player data")
    parser.add_argument("--top", type=int, default=5)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(name)s %(levelname)s %(message)s")

    fixtures = fetch_all("""
        SELECT m.id, m.match_date, ht.name AS home_team, at.name AS away_team
        FROM matches m
        JOIN teams ht ON m.home_team_id = ht.id
        JOIN teams at ON m.away_team_id = at.id
        WHERE m.status = 'scheduled' AND m.match_date > NOW()
        ORDER BY m.match_date LIMIT 10
    """)
    if not fixtures:
        print("No scheduled fixtures found.")
        return

    players = fetch_players(args.year)
    table = build_player_table(players)
    conv = conversion_from_db()
    log.info("Goals-per-SOT conversion: %.3f", conv)

    from models.baseline_poisson import DixonColesModel

    hist_rows = fetch_all(
        "SELECT home_team, away_team, home_score, away_score, match_date "
        "FROM historical_matches WHERE competition = 'La Liga' ORDER BY match_date"
    )
    import pandas as pd

    model = DixonColesModel(recency_xi=0.004)
    model.fit(pd.DataFrame(hist_rows))
    known_teams = sorted(set(model.attack) | set(model.defense))

    for fx in fixtures:
        h = next((t for t in known_teams if norm(t) == norm(fx["home_team"])), fx["home_team"])
        a = next((t for t in known_teams if norm(t) == norm(fx["away_team"])), fx["away_team"])
        lam, mu = model.rate_params(h, a)
        props = generate_props(fx["home_team"], fx["away_team"], lam, mu, table,
                               conversion=conv, known_titles=set(table.keys()))
        print(f"\n{fx['home_team']} vs {fx['away_team']}  ({fx['match_date']:%Y-%m-%d %H:%M})")
        for side_label, side_key in (("HOME", "home"), ("AWAY", "away")):
            side_props = sorted([p for p in props if p["side"] == side_key],
                                key=lambda p: -p["goal_prob"])[:args.top]
            print(f"  {side_label} top scorers:")
            for p in side_props:
                print("    %-26s G %.2f | A %.2f | SOT %.2f"
                      % (p["player"], p["goal_prob"], p["assist_prob"],
                         p["shots_on_target_prob"]))


if __name__ == "__main__":
    main()
