"""API-Football fixture ingestion for live predictions.

Free plan (no next/last): uses season + from/to date params to fetch:
  1. GET /fixtures?league=140&season=YYYY&from=...&to=...  -> scheduled fixtures
  2. GET /fixtures?league=140&season=YYYY&from=...&to=...  -> recent results

Two calls per league (La Liga + UCL = 4 calls max, well within 100/day).

Teams are upserted into ``teams``; fixtures into ``matches`` with
external_id = "api:{fixtureId}" (idempotent upsert).

The API key is read from env var API_FOOTBALL_KEY or the system_config
table row key = 'api_football_key'.

Usage
-----
    python -m ingestion.api_football_loader
"""

from __future__ import annotations

import json
import logging
import os

import requests

from db.connection import fetch_all, transaction

log = logging.getLogger("api_football")

BASE_URL = "https://v3.football.api-sports.io"
LEAGUE_ID_LA_LIGA = 140
LEAGUE_ID_UCL = 2


def _get_key() -> str:
    key = os.environ.get("API_FOOTBALL_KEY")
    if key:
        return key
    rows = fetch_all(
        "SELECT value FROM system_config WHERE key = 'api_football_key' LIMIT 1"
    )
    if rows and rows[0]["value"]:
        return rows[0]["value"]
    raise RuntimeError(
        "No API-Football key found. Set env API_FOOTBALL_KEY or insert it "
        "into system_config (key='api_football_key'). Free key: "
        "https://dashboard.api-football.com/register"
    )


def _get(client: requests.Session, path: str, params: dict) -> list[dict]:
    resp = client.get(f"{BASE_URL}{path}", params=params, timeout=60)
    resp.raise_for_status()
    body = resp.json()
    if body.get("errors"):
        raise RuntimeError(f"API-Football errors: {json.dumps(body['errors'])}")
    return body["response"]


def _upsert_team(cur, team: dict, country: str = "Spain") -> str | None:
    name = team["name"]
    cur.execute("SELECT id FROM teams WHERE name = %s", (name,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(
        """
        INSERT INTO teams (name, short_name, country, logo_url)
        VALUES (%s, %s, %s, %s) RETURNING id
        """,
        (name, team.get("code"), country, team.get("logo")),
    )
    return cur.fetchone()[0]


def _upsert_match(cur, fx: dict) -> None:
    fixture = fx["fixture"]
    league = fx["league"]
    country = league.get("country") or "Spain"
    home_id = _upsert_team(cur, fx["teams"]["home"], country)
    away_id = _upsert_team(cur, fx["teams"]["away"], country)
    goals = fx.get("goals") or {}
    status_short = (fixture.get("status") or {}).get("short", "")
    status_map = {"NS": "scheduled", "FT": "finished", "AET": "finished",
                  "PEN": "finished", "PST": "postponed", "CANC": "cancelled"}
    status = status_map.get(status_short, "scheduled" if not goals.get("home") else "finished")

    season_label = f"{league['season']}/{league['season'] + 1}"

    cur.execute(
        """
        UPDATE matches SET
          match_date = %s, home_score = %s, away_score = %s,
          status = %s, venue = %s, updated_at = now()
        WHERE external_id = %s
        """,
        (
            fixture["date"], goals.get("home"), goals.get("away"),
            status, (fixture.get("venue") or {}).get("name"),
            f"api:{fixture['id']}",
        ),
    )
    if cur.rowcount == 0:
        cur.execute(
            """
            INSERT INTO matches
              (external_id, competition, season, match_date, home_team_id,
               away_team_id, home_score, away_score, status, venue)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                f"api:{fixture['id']}", league["name"], season_label,
                fixture["date"], home_id, away_id,
                goals.get("home"), goals.get("away"), status,
                (fixture.get("venue") or {}).get("name"),
            ),
        )


def run(league_id: int = LEAGUE_ID_LA_LIGA, season: int | None = None) -> None:
    import datetime as dt

    key = _get_key()
    client = requests.Session()
    client.headers.update({"x-apisports-key": key})

    today = dt.date.today()
    if season is None:
        season = today.year if today.month >= 8 else today.year - 1

    season_start = f"{season}-08-01"
    season_end = f"{season + 1}-06-01"
    if season >= today.year:
        date_from = today.isoformat()
        date_to = min(dt.date.fromisoformat(season_end), today + dt.timedelta(days=90)).isoformat()
    elif dt.date.fromisoformat(season_end) >= today:
        date_from = (today - dt.timedelta(days=90)).isoformat()
        date_to = today.isoformat()
    else:
        date_from = season_start
        date_to = season_end

    params = {"league": league_id, "season": season, "from": date_from, "to": date_to}
    fixtures = _get(client, "/fixtures", params)
    log.info("Fetched %d fixtures for season %d (%s to %s)", len(fixtures), season, date_from, date_to)

    with transaction() as conn:
        with conn.cursor() as cur:
            for fx in fixtures:
                _upsert_match(cur, fx)

    finished = sum(1 for fx in fixtures
                   if (fx["fixture"].get("status") or {}).get("short") in ("FT", "AET", "PEN"))
    log.info("Upserted %d fixtures (%d finished, %d scheduled)",
             len(fixtures), finished, len(fixtures) - finished)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    run()
