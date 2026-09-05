"""Production wiring for xG-share-based player props.

The backtest (``backtest.player_props_backtest``) showed the xG-share method
beats the naive position-cap heuristic. This module syncs per-player season
aggregates from Understat into the ``players`` table and writes
``player_predictions`` rows (by proper ``player_id``) for each scheduled match
using :func:`predict.player_props.generate_props` / ``build_player_table``.

Usage (called from run_pipeline step 4)
---------------------------------------
    from predict.player_props_sync import sync_and_write_player_props

    n = sync_and_write_player_props(season_year=2026, preds=preds_with_lam)
"""

from __future__ import annotations

import logging

from db.connection import fetch_all, transaction

log = logging.getLogger("player_props_sync")

# Understat team title (as returned by the API) -> teams.name in our DB.
# Our ``teams`` rows use football-data.org names while Understat uses short
# /commercial names, so we bridge them explicitly keyed on normalized title.
UNDERSTAT_TITLE_TO_TEAM = {
    "barcelona": "FC Barcelona",
    "real madrid": "Real Madrid",
    "deportivo la coruna": "RC Deportivo La Coruña",
    "rayo vallecano": "Rayo Vallecano",
    "atletico madrid": "Club Atlético de Madrid",
    "espanyol": "Espanyol",
    "racing santander": "Real Racing Club de Santander",
    "osasuna": "Osasuna",
    "alaves": "Alaves",
    "real betis": "Real Betis",
    "levante": "Levante UD",
    "valencia": "Valencia",
    "villarreal": "Villarreal",
    "celta vigo": "RC Celta de Vigo",
    "athletic club": "Athletic Club",
    "sevilla": "Sevilla FC",
    "getafe": "Getafe",
    "real sociedad": "Real Sociedad",
    "elche": "Elche CF",
    "malaga": "Málaga CF",
}

# Understat position code -> players.position string stored in our DB
_POS_MAP = {"F": "Forward", "M": "Midfielder", "D": "Defender", "G": "Goalkeeper"}

# Reverse lookup: DB team name (lower-cased) -> Understat normalized title.
# Built once at import from UNDERSTAT_TITLE_TO_TEAM.
_DB_TEAM_TO_TITLE = {v.strip().lower(): k for k, v in UNDERSTAT_TITLE_TO_TEAM.items()}


def sync_players(understat_players: list[dict]) -> dict:
    """Upsert Understat players into the ``players`` table, matched to teams.

    Returns a dict {normalized_team_title: {player_name_lower: player_id}}
    so the writer can map generated props (keyed by player name) to ids.
    """
    from predict.player_props import _position_bucket, norm

    team_rows = fetch_all("SELECT id, name FROM teams")
    team_by_norm = {row["name"].strip().lower(): row["id"] for row in team_rows}

    existing = fetch_all("SELECT id, name, team_id FROM players")
    player_by_key = {(p["name"].strip().lower(), p["team_id"]): p["id"] for p in existing}

    # {team_title_norm: {player_name_lower: player_id}}
    index: dict[str, dict[str, str]] = {}
    created = 0

    with transaction() as conn:
        with conn.cursor() as cur:
            for p in understat_players:
                title_norm = norm(p.get("team_title", ""))
                db_team_name = UNDERSTAT_TITLE_TO_TEAM.get(title_norm)
                if db_team_name is None:
                    continue
                team_id = team_by_norm.get(db_team_name.strip().lower())
                if team_id is None:
                    log.warning("No DB team for Understat side '%s'", p.get("team_title"))
                    continue

                pname = (p["player_name"] or "").strip()
                if not pname:
                    continue
                pname_norm = pname.lower()

                bucket = _position_bucket(p.get("position"))
                position = _POS_MAP.get(bucket, p.get("position"))

                pid = player_by_key.get((pname_norm, team_id))
                if pid is None:
                    cur.execute(
                        "INSERT INTO players (name, team_id, position) "
                        "VALUES (%s,%s,%s) RETURNING id",
                        (pname, team_id, position))
                    pid = str(cur.fetchone()[0])
                    player_by_key[(pname_norm, team_id)] = pid
                    created += 1

                index.setdefault(title_norm, {})[pname_norm] = pid
            conn.commit()

    log.info("Synced %d Understat players (created %d new rows)", len(index), created)
    return index


def write_props_for_predictions(
    understat_players: list[dict],
    preds: list[dict],
    player_index: dict[str, dict[str, str]] | None = None,
) -> int:
    """Write xG-share props for each prediction using the Understat player table.

    Parameters
    ----------
    understat_players : list[dict]
        Raw Understat payload (used to build the share table + position).
    preds : list[dict]
        Rows from ``preds_without_players`` query — each must carry
        prediction_id, home_team, away_team, predicted_home_score,
        predicted_away_score.
    player_index : dict | None
        {team_title_norm: {player_name_lower: player_id}}. Built by
        :func:`sync_players` when given; otherwise computed here.

    Returns the number of predictions that received props.
    """
    from predict.player_props import build_player_table, norm

    table = build_player_table(understat_players)
    if player_index is None:
        player_index = sync_players(understat_players)

    written = 0
    with transaction() as conn:
        with conn.cursor() as cur:
            for pred in preds:
                home_team = (pred.get("home_team") or "").strip()
                away_team = (pred.get("away_team") or "").strip()
                lam = float(pred.get("predicted_home_score") or 0.0)
                mu = float(pred.get("predicted_away_score") or 0.0)

                props = _props_for_match(
                    table, home_team, away_team, lam, mu, player_index)
                if not props:
                    continue

                for pr in props:
                    cur.execute(
                        "INSERT INTO player_predictions "
                        "(prediction_id, player_id, goal_prob, assist_prob, "
                        " shots_on_target_prob) VALUES (%s,%s,%s,%s,%s)",
                        (pred["prediction_id"], pr["player_id"], pr["goal_prob"],
                         pr["assist_prob"], pr["shots_on_target_prob"]))
                written += 1
            conn.commit()

    log.info("Added xG-share player props for %d predictions", written)
    return written


def _props_for_match(table, home_team: str, away_team: str, lam: float, mu: float,
                     player_index: dict[str, dict[str, str]]) -> list[dict]:
    """Compute xG-share props for one match, mapping names to player ids."""
    from predict.player_props import MAX_GOAL_PROB
    import math

    out: list[dict] = []
    for side, db_name, exp_goals, is_home in (
        ("home", home_team, lam, True), ("away", away_team, mu, False)):
        title_norm = _DB_TEAM_TO_TITLE.get(db_name.strip().lower())
        if title_norm is None:
            continue
        squad = table.get(title_norm, {}).get("players", [])
        exp_sot = exp_goals / 0.31  # goals-per-SOT conversion fallback
        for pl in squad:
            pid = player_index.get(title_norm, {}).get(pl["name"].lower())
            if pid is None:
                continue
            out.append({
                "player_id": pid,
                "goal_prob": round(min(1 - math.exp(-exp_goals * pl["share_xg"]),
                                       MAX_GOAL_PROB), 4),
                "assist_prob": round(min(1 - math.exp(-exp_goals * pl["share_xa"]),
                                         MAX_GOAL_PROB), 4),
                "shots_on_target_prob": round(
                    1 - math.exp(-exp_sot * pl["share_sh"]), 4),
            })
    return out
