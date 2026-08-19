"""Feature engineering for match predictions.

Computes per-fixture feature sets from historical and recent match data:
  - Rolling form (last 5 / 10 matches)
  - Head-to-head record
  - Rest days since last match
  - Home/away performance splits
  - Average goals scored/conceded

Usage
-----
    from features.build_features import build_fixtures_features
    features_df = build_fixtures_features(upcoming_fixtures_df, historical_df)
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

import pandas as pd

log = logging.getLogger("features")


def _rolling_form(df: pd.DataFrame, team: str, n: int = 5) -> dict:
    """Compute rolling form for a team over their last n matches."""
    # Get matches where team played (home or away)
    home = df[df["home_team"] == team].copy()
    home["goals_for"] = home["home_score"]
    home["goals_against"] = home["away_score"]
    home["is_home"] = True

    away = df[df["away_team"] == team].copy()
    away["goals_for"] = away["away_score"]
    away["goals_against"] = away["home_score"]
    away["is_home"] = False

    cols = ["match_date", "goals_for", "goals_against", "is_home"]
    combined = pd.concat([home[cols], away[cols]]).sort_values("match_date", ascending=False)

    recent = combined.head(n)
    if len(recent) == 0:
        return {
            "form_points": 0, "form_goals_for": 0, "form_goals_against": 0,
            "form_wins": 0, "form_draws": 0, "form_losses": 0,
            "form_matches": 0,
        }

    points = 0
    wins = draws = losses = 0
    gf = ga = 0
    for _, r in recent.iterrows():
        gf += r["goals_for"]
        ga += r["goals_against"]
        if r["goals_for"] > r["goals_against"]:
            points += 3
            wins += 1
        elif r["goals_for"] == r["goals_against"]:
            points += 1
            draws += 1
        else:
            losses += 1

    return {
        "form_points": points,
        "form_goals_for": round(gf / len(recent), 2),
        "form_goals_against": round(ga / len(recent), 2),
        "form_wins": wins,
        "form_draws": draws,
        "form_losses": losses,
        "form_matches": len(recent),
    }


def _head_to_head(df: pd.DataFrame, home_team: str, away_team: str, n: int = 10) -> dict:
    """Compute head-to-head record between two teams."""
    h2h = df[
        ((df["home_team"] == home_team) & (df["away_team"] == away_team)) |
        ((df["home_team"] == away_team) & (df["away_team"] == home_team))
    ].sort_values("match_date", ascending=False).head(n)

    if len(h2h) == 0:
        return {"h2h_matches": 0, "h2h_home_wins": 0, "h2h_draws": 0, "h2h_away_wins": 0,
                "h2h_avg_goals": 0}

    home_wins = draws = away_wins = 0
    total_goals = 0
    for _, r in h2h.iterrows():
        hs, as_ = r["home_score"], r["away_score"]
        total_goals += hs + as_
        if r["home_team"] == home_team:
            if hs > as_:
                home_wins += 1
            elif hs == as_:
                draws += 1
            else:
                away_wins += 1
        else:
            if as_ > hs:
                home_wins += 1
            elif hs == as_:
                draws += 1
            else:
                away_wins += 1

    return {
        "h2h_matches": len(h2h),
        "h2h_home_wins": home_wins,
        "h2h_draws": draws,
        "h2h_away_wins": away_wins,
        "h2h_avg_goals": round(total_goals / len(h2h), 2),
    }


def _rest_days(df: pd.DataFrame, team: str, before_date: datetime) -> int | None:
    """Days since team's last match before the given date."""
    home = df[df["home_team"] == team]
    away = df[df["away_team"] == team]
    all_dates = pd.concat([home["match_date"], away["match_date"]]).sort_values(ascending=False)

    past_dates = all_dates[all_dates < before_date]
    if len(past_dates) == 0:
        return None

    last_match = past_dates.iloc[0]
    delta = before_date - last_match
    return int(delta.days)


def _home_away_splits(df: pd.DataFrame, team: str) -> dict:
    """Compute home and away performance averages."""
    home = df[df["home_team"] == team]
    away = df[df["away_team"] == team]

    def _stats(subset, is_home):
        if len(subset) == 0:
            return {"avg_gf": 0, "avg_ga": 0, "win_rate": 0, "matches": 0}
        gf = (subset["home_score"] if is_home else subset["away_score"]).mean()
        ga = (subset["away_score"] if is_home else subset["home_score"]).mean()
        if is_home:
            wins = (subset["home_score"] > subset["away_score"]).sum()
        else:
            wins = (subset["away_score"] > subset["home_score"]).sum()
        return {
            "avg_gf": round(float(gf), 2),
            "avg_ga": round(float(ga), 2),
            "win_rate": round(float(wins / len(subset)), 2),
            "matches": len(subset),
        }

    return {
        "home_split": _stats(home, True),
        "away_split": _stats(away, False),
    }


def _season_averages(df: pd.DataFrame, team: str, season: str | None = None) -> dict:
    """Season-level attack/defense averages."""
    if season:
        subset = df[df["season"] == season] if "season" in df.columns else df
    else:
        subset = df

    home = subset[subset["home_team"] == team]
    away = subset[subset["away_team"] == team]

    home_gf = home["home_score"].mean() if len(home) > 0 else 0
    home_ga = home["away_score"].mean() if len(home) > 0 else 0
    away_gf = away["away_score"].mean() if len(away) > 0 else 0
    away_ga = away["home_score"].mean() if len(away) > 0 else 0

    total_matches = len(home) + len(away)
    total_gf = float(home["home_score"].sum() + away["away_score"].sum()) / max(total_matches, 1)
    total_ga = float(home["away_score"].sum() + away["home_score"].sum()) / max(total_matches, 1)

    return {
        "season_avg_gf": round(total_gf, 2),
        "season_avg_ga": round(total_ga, 2),
        "season_home_avg_gf": round(float(home_gf), 2),
        "season_away_avg_gf": round(float(away_gf), 2),
        "season_matches": total_matches,
    }


def build_features_for_fixture(
    df: pd.DataFrame,
    home_team: str,
    away_team: str,
    match_date: datetime,
    season: str | None = None,
) -> dict:
    """Build complete feature dict for one fixture.

    Parameters
    ----------
    df : DataFrame
        All historical matches (used for form, h2h, averages).
    home_team, away_team : str
        Team names.
    match_date : datetime
        Date of the upcoming fixture.
    season : str, optional
        Current season string for season-level stats.
    """
    # Filter to only matches before this fixture date for form/rest
    prior = df[df["match_date"] < match_date]

    features: dict = {}

    # Rolling form (last 5 and last 10)
    form_5_home = _rolling_form(prior, home_team, n=5)
    form_5_away = _rolling_form(prior, away_team, n=5)
    form_10_home = _rolling_form(prior, home_team, n=10)
    form_10_away = _rolling_form(prior, away_team, n=10)

    for k, v in form_5_home.items():
        features[f"home_{k}"] = v
    for k, v in form_5_away.items():
        features[f"away_{k}"] = v
    for k, v in form_10_home.items():
        features[f"home_10_{k.replace('form_', '')}"] = v
    for k, v in form_10_away.items():
        features[f"away_10_{k.replace('form_', '')}"] = v

    # Head-to-head
    h2h = _head_to_head(df, home_team, away_team)
    features.update(h2h)

    # Rest days
    home_rest = _rest_days(prior, home_team, match_date)
    away_rest = _rest_days(prior, away_team, match_date)
    features["home_rest_days"] = home_rest if home_rest is not None else 14
    features["away_rest_days"] = away_rest if away_rest is not None else 14

    # Home/away splits
    ha_home = _home_away_splits(df, home_team)
    ha_away = _home_away_splits(df, away_team)
    for k, v in ha_home["home_split"].items():
        features[f"home_home_{k}"] = v
    for k, v in ha_away["away_split"].items():
        features[f"away_away_{k}"] = v

    # Season averages
    sa_home = _season_averages(df, home_team, season)
    sa_away = _season_averages(df, away_team, season)
    for k, v in sa_home.items():
        features[f"home_{k}"] = v
    for k, v in sa_away.items():
        features[f"away_{k}"] = v

    return features


def build_fixtures_features(
    fixtures: pd.DataFrame,
    historical: pd.DataFrame,
    season: str | None = None,
) -> list[dict]:
    """Build features for a list of upcoming fixtures.

    Returns a list of dicts, one per fixture, each containing all features
    plus 'home_team', 'away_team', 'match_date', and 'match_id'.
    """
    results = []
    for _, fx in fixtures.iterrows():
        match_date = fx["match_date"]
        if isinstance(match_date, str):
            match_date = datetime.fromisoformat(match_date.replace("Z", "+00:00"))

        features = build_features_for_fixture(
            historical, fx["home_team"], fx["away_team"], match_date, season
        )
        features["home_team"] = fx["home_team"]
        features["away_team"] = fx["away_team"]
        features["match_date"] = match_date
        if "id" in fx:
            features["match_id"] = fx["id"]
        results.append(features)

    log.info("Built features for %d fixtures", len(results))
    return results
