"""football-data.org (v4 API) loader for current-season fixtures & results.

Source: https://www.football-data.org (free plan: 10 requests/minute, no
credit card). Covers La Liga (PD), UEFA Champions League (CL), Premier
League (PL), Bundesliga, Serie A, Ligue 1 — current season live data.

The token is supplied via the HTTP header ``X-Auth-Token`` and read from
env var ``FOOTBALL_DATA_ORG_KEY`` or the ``system_config`` row with key
``football_data_org_key``.

Rate limiting is respected by inspecting the response headers
``x-requests-available-minute`` (remaining this minute) and
``X-RequestCounter-Reset`` (seconds until the quota resets).

Teams are upserted into ``teams``; fixtures into ``matches`` with
``external_id = "fdorg:{id}"`` (idempotent, matches the api_football pattern).

Usage
-----
    python -m ingestion.football_data_org_loader
    python -m ingestion.football_data_org_loader --competitions PD CL PL
"""

from __future__ import annotations

import logging
import os
import re
import time
import unicodedata

import requests

from db.connection import fetch_all, transaction

log = logging.getLogger("football_data_org")

BASE_URL = "https://api.football-data.org/v4"
TOKEN_HEADER = "X-Auth-Token"

DEFAULT_COMPETITIONS = ["PD", "CL"]
COMPETITION_NAMES = {
    "PD": "La Liga",
    "CL": "UEFA Champions League",
    "PL": "Premier League",
    "BL1": "Bundesliga",
    "SA": "Serie A",
    "FL1": "Ligue 1",
}

STATUS_MAP = {
    "TIMED": "scheduled",
    "SCHEDULED": "scheduled",
    "FINISHED": "finished",
    "POSTPONED": "postponed",
    "CANCELLED": "cancelled",
    "SUSPENDED": "postponed",
    "AWARDED": "finished",
}


def _get_key() -> str:
    key = os.environ.get("FOOTBALL_DATA_ORG_KEY")
    if key:
        return key
    rows = fetch_all(
        "SELECT value FROM system_config WHERE key = 'football_data_org_key' LIMIT 1"
    )
    if rows and rows[0]["value"]:
        return rows[0]["value"]
    raise RuntimeError(
        "No football-data.org token found. Set env FOOTBALL_DATA_ORG_KEY or "
        "insert it into system_config (key='football_data_org_key'). Register at "
        "https://www.football-data.org/client/register"
    )


def _throttle(client: requests.Session, resp: requests.Response) -> None:
    """Respect football-data.org rate limits reported in response headers."""
    remaining_raw = resp.headers.get("x-requests-available-minute")
    reset_raw = resp.headers.get("X-RequestCounter-Reset")
    try:
        remaining = int(remaining_raw)
    except (TypeError, ValueError):
        remaining = 9
    if remaining <= 2:
        try:
            wait = int(reset_raw)
        except (TypeError, ValueError):
            wait = 6
        if wait > 0:
            log.info("API quota low (%d left) — sleeping %ds", remaining, wait)
            time.sleep(wait + 1)


def _normalize(name: str) -> str:
    """Lowercase + strip diacritics so 'Atlético' == 'Atletico'."""
    if not name:
        return ""
    name = unicodedata.normalize("NFKD", name)
    name = "".join(ch for ch in name if not unicodedata.combining(ch))
    name = re.sub(r"[^a-z0-9]+", "", name.lower())
    return name


def _slugify(name: str) -> str:
    """Compact canonical team name (e.g. 'Atlético Madrid' -> 'atleticomadrid')."""
    return _normalize(name)


def _load_existing_teams(cur) -> dict[str, str]:
    """Return {slug(name): team_uuid} for all teams already in the DB."""
    cur.execute("SELECT id, name FROM teams")
    return {(_slugify(name)): str(tid) for tid, name in cur.fetchall()}


def _resolve_team(cur, teams_by_slug: dict[str, str], team: dict, country: str) -> str:
    """Find an existing team by normalized slug, else insert it.

    Compares on a couple of prefixes to bridge cosmetic differences (e.g.
    'Deportivo Alavés' / 'Alaves' are related by the shared slug of 'Alavés').
    Falls back to an exact normalized match, then a prefix match.
    """
    name = team.get("name") or ""
    slug = _slugify(name)

    cached = teams_by_slug.get(slug)
    if cached:
        return cached

    key = team.get("shortName") or name
    key_slug = _slugify(key)
    if key_slug and key_slug in teams_by_slug:
        teams_by_slug[slug] = teams_by_slug[key_slug]
        return teams_by_slug[slug]

    cur.execute("SELECT id FROM teams WHERE name = %s", (name,))
    row = cur.fetchone()
    if row:
        teams_by_slug[slug] = str(row[0])
        return teams_by_slug[slug]

    cur.execute(
        """
        INSERT INTO teams (name, short_name, country, logo_url)
        VALUES (%s, %s, %s, %s) RETURNING id
        """,
        (name, team.get("tla"), country, team.get("crest")),
    )
    tid = str(cur.fetchone()[0])
    teams_by_slug[slug] = tid
    return tid


def _season_label(season: dict | None) -> str | None:
    if not season:
        return None
    start = season.get("startDate")
    if not start:
        return None
    try:
        year = int(start[:4])
    except (TypeError, ValueError):
        return None
    return f"{year}/{year + 1}"


def _upsert_match(cur, teams_by_slug: dict[str, str], fx: dict, comp_name: str) -> None:
    comp = fx.get("competition") or {}
    country = comp.get("area", {}).get("name") or "Spain"
    home_id = _resolve_team(cur, teams_by_slug, fx.get("homeTeam") or {}, country)
    away_id = _resolve_team(cur, teams_by_slug, fx.get("awayTeam") or {}, country)

    score = fx.get("score") or {}
    full = score.get("fullTime") or {}
    home_goals = full.get("home")
    away_goals = full.get("away")

    status_raw = fx.get("status") or "SCHEDULED"
    status = STATUS_MAP.get(status_raw, "scheduled")

    utc = fx.get("utcDate") or fx.get("lastUpdated")
    ext_id = f"fdorg:{fx['id']}"
    season = _season_label(fx.get("season"))

    cur.execute(
        """
        UPDATE matches SET
          match_date = %s, home_score = %s, away_score = %s,
          status = %s, competition = %s, season = %s, updated_at = now()
        WHERE external_id = %s
        """,
        (utc, home_goals, away_goals, status, comp_name, season, ext_id),
    )
    if cur.rowcount == 0:
        cur.execute(
            """
            INSERT INTO matches
              (external_id, competition, season, match_date, home_team_id,
               away_team_id, home_score, away_score, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                ext_id, comp_name, season, utc, home_id, away_id,
                home_goals, away_goals, status,
            ),
        )


def run(competitions: list[str] | None = None) -> dict:
    """Ingest fixtures for the given competition codes. Returns per-comp counts."""
    competitions = competitions or list(DEFAULT_COMPETITIONS)
    key = _get_key()

    client = requests.Session()
    client.headers.update({TOKEN_HEADER: key})
    client.headers.update({"X-Response-Control": "minified"})

    results: dict[str, dict] = {}
    with transaction() as conn:
        with conn.cursor() as cur:
            teams_by_slug = _load_existing_teams(cur)
            for code in competitions:
                try:
                    resp = client.get(
                        f"{BASE_URL}/competitions/{code}/matches",
                        params={"status": "SCHEDULED,TIMED,FINISHED"},
                        timeout=60,
                    )
                    resp.raise_for_status()
                    _throttle(client, resp)
                    body = resp.json()
                    matches = body.get("matches") or []
                    for fx in matches:
                        _upsert_match(
                            cur,
                            teams_by_slug,
                            fx,
                            COMPETITION_NAMES.get(code, fx.get("competition", {}).get("name") or code),
                        )
                    results[code] = {"count": len(matches)}
                    log.info("Competition %s: %d fixtures upserted", code, len(matches))
                except Exception as exc:
                    log.error("Competition %s failed: %s", code, exc)
                    results[code] = {"error": str(exc)}
    return results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="football-data.org current-season loader")
    parser.add_argument("--competitions", nargs="*", default=DEFAULT_COMPETITIONS,
                        help="Competition codes e.g. PD CL PL (default: %(default)s)")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    print(run(competitions=args.competitions))
