"""Live data client for API-Football (api-sports.io).

Reads the API key from the system_config table (category api_keys)
so the admin panel can manage it without code changes.

Pulls:
  - Current-season fixtures (La Liga + UCL)
  - Team data
  - Player data per team

Usage
-----
    python -m ingestion.api_football_client
    python -m ingestion.api_football_client --competition "La Liga"
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import requests

from db.connection import fetch_one, execute_many, get_conn

log = logging.getLogger("api_football")

LEAGUE_IDS = {
    "La Liga": {"league": 140, "country": "Spain"},
    "UEFA Champions League": {"league": 2, "country": "Europe"},
}

BASE_URL_DEFAULT = "https://v3.football.api-sports.io"

HEADERS_ACCEPT = {"x-apisports-key": ""}


def _get_api_config() -> tuple[str, str]:
    """Read API key and base URL from system_config."""
    row = fetch_one(
        "SELECT value FROM system_config WHERE key = 'api_football_key'"
    )
    api_key = row["value"] if row else ""
    if not api_key:
        raise RuntimeError(
            "API-Football key not configured. Set 'api_football_key' in system_config."
        )

    row_url = fetch_one(
        "SELECT value FROM system_config WHERE key = 'api_football_base_url'"
    )
    base_url = row_url["value"] if row_url else BASE_URL_DEFAULT
    return api_key, base_url


def _api_get(path: str, params: dict | None = None, retries: int = 3) -> dict:
    """Make a GET request to API-Football with rate-limit awareness."""
    api_key, base_url = _get_api_config()
    headers = {"x-apisports-key": api_key}
    url = f"{base_url}{path}"

    for attempt in range(retries):
        resp = requests.get(url, headers=headers, params=params or {}, timeout=30)
        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", 10))
            log.warning("Rate limited — waiting %ds", wait)
            time.sleep(wait)
            continue
        resp.raise_for_status()
        data = resp.json()
        remaining = resp.headers.get("x-ratelimit-remaining")
        if remaining and int(remaining) < 5:
            log.warning("API rate limit nearly exhausted (%s remaining)", remaining)
            time.sleep(2)
        return data

    raise RuntimeError(f"API-Football request failed after {retries} retries: {path}")


# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------

def fetch_fixtures(league_id: int, season: int) -> list[dict]:
    """Fetch fixtures for a league/season."""
    data = _api_get("/fixtures", {"league": league_id, "season": season})
    return data.get("response", [])


def upsert_fixtures(fixtures: list[dict], competition_name: str, season: str) -> int:
    """Write fixtures into the matches table. Returns count inserted/updated."""
    conn = get_conn()
    count = 0
    try:
        with conn.cursor() as cur:
            for fx in fixtures:
                info = fx.get("fixture", {})
                teams = fx.get("teams", {})
                goals = fx.get("goals", {})

                external_id = str(info.get("id", ""))
                match_date_str = info.get("date", "")
                venue_name = info.get("venue", {}).get("name") if info.get("venue") else None
                status_raw = info.get("status", {}).get("short", "NS")

                # Map API-Football status to our status
                status_map = {
                    "NS": "scheduled", "TBD": "scheduled",
                    "1H": "live", "HT": "live", "2H": "live", "ET": "live", "BT": "live", "P": "live",
                    "FT": "finished", "AET": "finished", "PEN": "finished",
                    "PST": "postponed", "CANC": "cancelled", "ABD": "abandoned",
                }
                status = status_map.get(status_raw, "scheduled")

                home_team_name = teams.get("home", {}).get("name", "")
                away_team_name = teams.get("away", {}).get("name", "")
                home_score = goals.get("home")
                away_score = goals.get("away")

                # Upsert teams first
                home_team_id = _upsert_team(cur, home_team_name, teams.get("home", {}))
                away_team_id = _upsert_team(cur, away_team_name, teams.get("away", {}))

                # Parse date
                match_date = None
                if match_date_str:
                    match_date = datetime.fromisoformat(match_date_str.replace("Z", "+00:00"))

                cur.execute("""
                    INSERT INTO matches (external_id, competition, season, match_date,
                        home_team_id, away_team_id, home_score, away_score, status, venue)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (external_id) DO UPDATE SET
                        home_score = EXCLUDED.home_score,
                        away_score = EXCLUDED.away_score,
                        status = EXCLUDED.status,
                        venue = EXCLUDED.venue,
                        updated_at = NOW()
                """, (
                    external_id, competition_name, season, match_date,
                    home_team_id, away_team_id, home_score, away_score, status, venue_name,
                ))
                count += 1

            conn.commit()
    finally:
        conn.close()

    log.info("Upserted %d fixtures for %s", count, competition_name)
    return count


def _upsert_team(cur, name: str, team_data: dict) -> str | None:
    """Insert or find team, return UUID as string."""
    if not name:
        return None

    short_name = team_data.get("code")
    logo = team_data.get("logo")
    country = team_data.get("country", {}).get("name") if isinstance(team_data.get("country"), dict) else None

    cur.execute("SELECT id FROM teams WHERE name = %s", (name,))
    row = cur.fetchone()
    if row:
        return str(row[0])

    cur.execute(
        "INSERT INTO teams (name, short_name, country, logo_url) VALUES (%s, %s, %s, %s) RETURNING id",
        (name, short_name, country, logo),
    )
    return str(cur.fetchone()[0])


# ------------------------------------------------------------------
# Players per team
# ------------------------------------------------------------------

def fetch_squad(team_id: int) -> list[dict]:
    """Fetch squad for a team from API-Football."""
    data = _api_get("/players/squad", {"team": team_id})
    return data.get("response", [])


def upsert_players(team_internal_id: str, players_data: list[dict]) -> int:
    """Write players into the players table."""
    conn = get_conn()
    count = 0
    try:
        with conn.cursor() as cur:
            for p in players_data:
                player_info = p.get("player", {})
                name = player_info.get("name", "")
                if not name:
                    continue
                nationality = player_info.get("nationality")
                photo = player_info.get("photo")
                position = p.get("statistics", [{}])[0].get("games", {}).get("position") if p.get("statistics") else None

                # Check if player already exists by name + team
                cur.execute(
                    "SELECT id FROM players WHERE name = %s AND team_id = %s",
                    (name, team_internal_id),
                )
                existing = cur.fetchone()
                if existing:
                    continue

                cur.execute(
                    "INSERT INTO players (name, team_id, position, nationality, photo_url) "
                    "VALUES (%s, %s, %s, %s, %s) RETURNING id",
                    (name, team_internal_id, position, nationality, photo),
                )
                count += 1

            conn.commit()
    finally:
        conn.close()

    return count


# ------------------------------------------------------------------
# Main entry point
# ------------------------------------------------------------------

def ingest_fixtures(competition: str | None = None) -> dict[str, int]:
    """Ingest fixtures for configured competitions. Returns {comp: count}."""
    from datetime import date
    current_year = date.today().year
    # Use current year as season; API-Football uses e.g. 2025 for 2025/2026 season
    season = current_year

    results: dict[str, int] = {}
    comps = [competition] if competition else list(LEAGUE_IDS.keys())

    for comp_name in comps:
        if comp_name not in LEAGUE_IDS:
            log.warning("Unknown competition: %s — skipping", comp_name)
            continue
        league_id = LEAGUE_IDS[comp_name]["league"]
        log.info("Fetching fixtures for %s (league=%d, season=%d)", comp_name, league_id, season)
        try:
            fixtures = fetch_fixtures(league_id, season)
            count = upsert_fixtures(fixtures, comp_name, str(season))
            results[comp_name] = count
        except Exception as exc:
            log.error("Failed to ingest %s: %s", comp_name, exc)
            results[comp_name] = 0

    return results


def ingest_players(max_teams: int = 40) -> int:
    """Fetch squads for all teams in the matches table. Returns player count."""
    from db.connection import fetch_all

    teams = fetch_all("SELECT id, name FROM teams")
    total = 0

    for team in teams[:max_teams]:
        team_id_internal = str(team["id"])
        # Try to find API-Football team ID from id_mapping
        mapping = fetch_one(
            "SELECT api_football_id FROM id_mapping WHERE internal_id = %s AND entity_type = 'team'",
            (team_id_internal,),
        )
        if not mapping or not mapping.get("api_football_id"):
            continue

        try:
            squad = fetch_squad(int(mapping["api_football_id"]))
            n = upsert_players(team_id_internal, squad)
            total += n
            log.info("  %s: %d new players", team["name"], n)
        except Exception as exc:
            log.warning("  Failed to fetch squad for %s: %s", team["name"], exc)

    return total


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="API-Football data ingestion")
    parser.add_argument("--competition", type=str, default=None)
    parser.add_argument("--players", action="store_true", help="Also fetch player squads")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    results = ingest_fixtures(args.competition)
    for comp, count in results.items():
        print(f"  {comp}: {count} fixtures")

    if args.players:
        n = ingest_players()
        print(f"  Players: {n} new players inserted")


if __name__ == "__main__":
    main()
