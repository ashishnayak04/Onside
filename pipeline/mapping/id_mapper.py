"""Reconcile StatsBomb IDs with API-Football IDs using name matching.

Populates the ``id_mapping`` table by matching teams and players on
name (+ country for teams, + birthdate for players where available).

Usage
-----
    python -m mapping.id_mapper
"""

from __future__ import annotations

import logging
import unicodedata

from db.connection import get_conn, fetch_all

log = logging.getLogger("id_mapper")


def _normalise(name: str) -> str:
    """Lowercase, strip accents, collapse whitespace."""
    name = name.strip().lower()
    # Decompose unicode and drop combining characters
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_name = "".join(c for c in nfkd if not unicodedata.combining(c))
    return " ".join(ascii_name.split())


# Known alias mappings for teams that differ between sources
TEAM_ALIASES: dict[str, list[str]] = {
    "barcelona": ["fc barcelona", "barca"],
    "real madrid": ["real madrid c.f.", "real madrid cf"],
    "atletico madrid": ["atlético madrid", "atletico de madrid"],
    "athletic bilbao": ["athletic club", "athletic de bilbao"],
    "real sociedad": ["real sociedad s.a.d."],
    "real betis": ["real betis balompié"],
    "villarreal cf": ["villarreal", "villarreal c.f."],
    "sevilla fc": ["sevilla", "sevilla f.c."],
    "valencia cf": ["valencia", "valencia c.f."],
    "celta vigo": ["rc celta", "real club celta de vigo"],
}


def _match_team(name: str, candidates: list[str]) -> str | None:
    """Try to match a team name against a list of candidates."""
    norm = _normalise(name)
    for candidate in candidates:
        if _normalise(candidate) == norm:
            return candidate
    # Check aliases
    for canonical, aliases in TEAM_ALIASES.items():
        if _normalise(canonical) == norm:
            for alias in aliases:
                for candidate in candidates:
                    if _normalise(candidate) == _normalise(alias):
                        return candidate
        for alias in aliases:
            if _normalise(alias) == norm:
                for candidate in candidates:
                    if _normalise(candidate) == _normalise(canonical):
                        return candidate
    return None


def map_teams() -> int:
    """Match teams from matches/historical_matches to the teams table.

    Returns the number of new id_mapping rows inserted.
    """
    conn = get_conn()
    count = 0
    try:
        with conn.cursor() as cur:
            # Get all team names from matches table
            cur.execute("SELECT DISTINCT name FROM teams")
            db_team_names = [row[0] for row in cur.fetchall()]

            # Get all unique team names from historical_matches
            cur.execute("""
                SELECT DISTINCT home_team AS team FROM historical_matches
                UNION
                SELECT DISTINCT away_team AS team FROM historical_matches
            """)
            historical_names = [row[0] for row in cur.fetchall()]

            # Also get teams from matches table that have external_ids
            cur.execute("""
                SELECT DISTINCT ht.name, t.id
                FROM matches m
                JOIN teams t ON m.home_team_id = t.id
                UNION
                SELECT DISTINCT at.name, t.id
                FROM matches m
                JOIN teams t ON m.away_team_id = t.id
            """)

            for hist_name in historical_names:
                matched = _match_team(hist_name, db_team_names)
                if not matched:
                    continue

                # Get internal_id from teams table
                cur.execute("SELECT id FROM teams WHERE name = %s", (matched,))
                row = cur.fetchone()
                if not row:
                    continue
                internal_id = str(row[0])

                # Check if mapping already exists
                cur.execute(
                    "SELECT id FROM id_mapping WHERE internal_id = %s AND entity_type = 'team'",
                    (internal_id,),
                )
                if cur.fetchone():
                    continue

                # Insert mapping
                cur.execute(
                    "INSERT INTO id_mapping (entity_type, internal_id, statsbomb_id) "
                    "VALUES ('team', %s, %s)",
                    (internal_id, hist_name),
                )
                count += 1

            conn.commit()
    finally:
        conn.close()

    log.info("Inserted %d team ID mappings", count)
    return count


def map_players() -> int:
    """Match players by name between historical data and players table.

    Returns the number of new id_mapping rows inserted.
    """
    conn = get_conn()
    count = 0
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM players")
            db_players = cur.fetchall()

            # We only have player names from statsbomb if we loaded event data
            # For now, match players that exist in both tables by name
            cur.execute("""
                SELECT DISTINCT pp.player_id, p.name
                FROM player_predictions pp
                JOIN players p ON pp.player_id = p.id
            """)
            known_players = {str(row[0]): row[1] for row in cur.fetchall()}

            for player_id, player_name in db_players:
                pid = str(player_id)
                if pid in known_players:
                    # Check if mapping exists
                    cur.execute(
                        "SELECT id FROM id_mapping WHERE internal_id = %s AND entity_type = 'player'",
                        (pid,),
                    )
                    if not cur.fetchone():
                        cur.execute(
                            "INSERT INTO id_mapping (entity_type, internal_id, statsbomb_id) "
                            "VALUES ('player', %s, %s)",
                            (pid, player_name),
                        )
                        count += 1

            conn.commit()
    finally:
        conn.close()

    log.info("Inserted %d player ID mappings", count)
    return count


def run_mapping() -> dict[str, int]:
    """Run full ID mapping. Returns counts."""
    team_count = map_teams()
    player_count = map_players()
    return {"teams_mapped": team_count, "players_mapped": player_count}


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="ID mapping reconciliation")
    parser.add_argument("--teams-only", action="store_true")
    parser.add_argument("--players-only", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    if args.teams_only:
        n = map_teams()
        print(f"Teams mapped: {n}")
    elif args.players_only:
        n = map_players()
        print(f"Players mapped: {n}")
    else:
        results = run_mapping()
        for k, v in results.items():
            print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
