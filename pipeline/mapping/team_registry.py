"""Canonical team-name registry — single source of truth for team identity.

All the live sources (football-data.org, API-Football, Understat) name clubs
differently than the football-data.co.uk strings used at model fit time and in
``historical_matches``. Fragmented per-loader alias maps made identity fragile:
only ~35% of live team names matched their training rows, and unmatched teams
silently fell back to generic ratings.

This module centralizes every alias in one place, seeded into a durable
``team_aliases`` table, and exposes ``resolve_fit_name`` for live->fit mapping
and ``seed_team_aliases`` for maintenance. The fuzzy fallback is kept, but the
explicit table now covers every team we have ever seen.

Usage
-----
    from mapping.team_registry import resolve_fit_name, seed_team_aliases
    seed_team_aliases()                 # one-time / maintenance
    fit = resolve_fit_name("Club Atlético de Madrid")   # -> "Ath Madrid"
"""

from __future__ import annotations

import difflib
import logging
import re
import unicodedata

from db.connection import execute_many, fetch_all

log = logging.getLogger("team_registry")

# ---------------------------------------------------------------------------
# Canonical aliases:  alias -> fit-time name (football-data.co.uk style).
# Every naming variant we have encountered across all sources is listed.
# ---------------------------------------------------------------------------

TEAM_ALIASES: dict[str, str] = {
    # --- La Liga ---
    "FC Barcelona": "Barcelona",
    "Barcelona": "Barcelona",
    "Barca": "Barcelona",
    "Real Madrid": "Real Madrid",
    "Real Madrid CF": "Real Madrid",
    "Club Atlético de Madrid": "Ath Madrid",
    "Atletico Madrid": "Ath Madrid",
    "Atlético Madrid": "Ath Madrid",
    "Atletico": "Ath Madrid",
    "Ath Madrid": "Ath Madrid",
    "Atl. Madrid": "Ath Madrid",
    "Athletic Club": "Ath Bilbao",
    "Athletic": "Ath Bilbao",
    "Ath Bilbao": "Ath Bilbao",
    "Athletic Bilbao": "Ath Bilbao",
    "Real Betis": "Betis",
    "Real Betis Balompié": "Betis",
    "Betis": "Betis",
    "Real Sociedad": "Sociedad",
    "Sociedad": "Sociedad",
    "Rayo Vallecano": "Rayo Vallecano",
    "Vallecano": "Vallecano",
    "RC Celta de Vigo": "Celta",
    "Celta Vigo": "Celta",
    "Celta": "Celta",
    "RC Celta": "Celta",
    "Espanyol": "Espanol",
    "RCD Espanyol": "Espanol",
    "Espanol": "Espanol",
    "Deportivo Alaves": "Alaves",
    "Deportivo Alavés": "Alaves",
    "Alaves": "Alaves",
    "Alavés": "Alaves",
    "Real Valladolid": "Valladolid",
    "Valladolid": "Valladolid",
    "Real Racing Club de Santander": "Santander",
    "Racing Santander": "Santander",
    "Santander": "Santander",
    "RC Deportivo La Coruña": "Dep. A Coruna",
    "Deportivo de La Coruña": "Dep. A Coruna",
    "Deportivo La Coruña": "Dep. A Coruna",
    "Dep. A Coruna": "Dep. A Coruna",
    "Deportivo": "Dep. A Coruna",
    "Elche CF": "Elche",
    "Elche": "Elche",
    "Levante UD": "Levante",
    "Levante": "Levante",
    "Girona": "Girona",
    "Getafe": "Getafe",
    "Osasuna": "Osasuna",
    "CA Osasuna": "Osasuna",
    "RCD Mallorca": "Mallorca",
    "Mallorca": "Mallorca",
    "UD Las Palmas": "Las Palmas",
    "Las Palmas": "Las Palmas",
    "CD Leganes": "Leganes",
    "Leganes": "Leganes",
    "Leganés": "Leganes",
    "Sevilla FC": "Sevilla",
    "Sevilla": "Sevilla",
    "Valencia": "Valencia",
    "Valencia CF": "Valencia",
    "Villarreal": "Villarreal",
    "Villarreal CF": "Villarreal",
    "Málaga CF": "Malaga",
    "Málaga": "Malaga",
    "Cadiz": "Cadiz",
    "Cadiz CF": "Cadiz",
    "Granada": "Granada",
    "Granada CF": "Granada",
    "Almeria": "Almeria",
    "UD Almeria": "Almeria",
    "Almería": "Almeria",
    "Real Oviedo": "Oviedo",
    "Oviedo": "Oviedo",

    # --- UCL / Europe ---
    "Manchester City FC": "Man City",
    "Manchester City": "Man City",
    "Man City": "Man City",
    "Man. City": "Man City",
    "Manchester United FC": "Man United",
    "Manchester United": "Man United",
    "Man United": "Man United",
    "Man. United": "Man United",
    "FC Bayern München": "Bayern",
    "Bayern": "Bayern",
    "Bayern Munich": "Bayern",
    "Paris Saint-Germain FC": "Paris",
    "Paris Saint-Germain": "Paris",
    "PSG": "Paris",
    "Paris": "Paris",
    "Borussia Dortmund": "Dortmund",
    "Dortmund": "Dortmund",
    "B. Dortmund": "Dortmund",
    "Bayer 04 Leverkusen": "Leverkusen",
    "Bayer Leverkusen": "Leverkusen",
    "Leverkusen": "Leverkusen",
    "RB Leipzig": "Leipzig",
    "Leipzig": "Leipzig",
    "Lille": "Lille",
    "LOSC": "LOSC",
    "Lille OSC": "LOSC",
    "Racing Club de Lens": "Lens",
    "RC Lens": "Lens",
    "Lens": "Lens",
    "AS Roma": "Roma",
    "Roma": "Roma",
    "SSC Napoli": "Napoli",
    "Napoli": "Napoli",
    "AC Milan": "Milan",
    "Milan": "Milan",
    "Inter": "Inter",
    "Inter Milan": "Inter",
    "FC Internazionale": "Inter",
    "Juventus": "Juventus",
    "Atalanta": "Atalanta",
    "Atalanta BC": "Atalanta",
    "Bologna": "Bologna",
    "FC Porto": "FC Porto",
    "Porto": "FC Porto",
    "Sporting CP": "Sporting CP",
    "Sporting Lisbon": "Sporting CP",
    "Sport Lisboa e Benfica": "Benfica",
    "Benfica": "Benfica",
    "SL Benfica": "Benfica",
    "PSV": "PSV",
    "PSV Eindhoven": "PSV",
    "Feyenoord": "Feyenoord",
    "AFC Ajax": "Ajax",
    "Ajax": "Ajax",
    "Celtic": "Celtic",
    "Celtic FC": "Celtic",
    "Glasgow Rangers": "Rangers",
    "Rangers": "Rangers",
    "Arsenal": "Arsenal",
    "Liverpool": "Liverpool",
    "Chelsea FC": "Chelsea",
    "Chelsea": "Chelsea",
    "Tottenham Hotspur FC": "Tottenham",
    "Tottenham": "Tottenham",
    "Tottenham Hotspur": "Tottenham",
    "Newcastle United FC": "Newcastle",
    "Newcastle": "Newcastle",
    "Newcastle United": "Newcastle",
    "Aston Villa": "Aston Villa",
    "Club Brugge KV": "Club Brugge",
    "Club Brugge": "Club Brugge",
    "BSC Young Boys": "Young Boys",
    "Young Boys": "Young Boys",
    "FC København": "Copenhagen",
    "Copenhagen": "Copenhagen",
    "FC Copenhagen": "Copenhagen",
    "Galatasaray": "Galatasaray",
    "Galatasaray SK": "Galatasaray",
    "Fenerbahçe": "Fenerbahçe",
    "Fenerbahce": "Fenerbahçe",
    "Fenerbahçe SK": "Fenerbahçe",
    "Dinamo Zagreb": "Dinamo Zagreb",
    "GNK Dinamo": "Dinamo Zagreb",
    "FK Crvena Zvezda": "Crvena zvezda",
    "Crvena zvezda": "Crvena zvezda",
    "Red Star": "Crvena zvezda",
    "Red Star Belgrade": "Crvena zvezda",
    "ŠK Slovan Bratislava": "S. Bratislava",
    "Slovan Bratislava": "S. Bratislava",
    "S. Bratislava": "S. Bratislava",
    "Sturm Graz": "Sturm Graz",
    "Red Bull Salzburg": "Salzburg",
    "FC Salzburg": "Salzburg",
    "Salzburg": "Salzburg",
    "Olympique de Marseille": "Marseille",
    "Marseille": "Marseille",
    "AS Monaco": "Monaco",
    "Monaco": "Monaco",
    "Stade Brestois 29": "Brest",
    "Brest": "Brest",
    "VfB Stuttgart": "Stuttgart",
    "Stuttgart": "Stuttgart",
    "Ferencvarosi TC": "Ferencváros",
    "Ferencváros": "Ferencváros",
    "Ferencvaros": "Ferencváros",
    "PAE Olympiakos SFP": "Olympiacos",
    "Olympiacos": "Olympiacos",
    "Olympiakos": "Olympiacos",
    "PAOK": "PAOK",
    "PAE AEK": "AEK",
    "AEK Athens": "AEK",
    "Sparta Praha": "Sparta Praha",
    "AC Sparta Praha": "Sparta Praha",
    "Slavia Praha": "Slavia Praha",
    "SK Slavia Praha": "Slavia Praha",
    "Sporting Braga": "Braga",
    "Braga": "Braga",
    "Ludogorets": "Ludogorets",
    "PFC Ludogorets": "Ludogorets",
    "Malmo FF": "Malmö",
    "Malmö": "Malmö",
    "FC Midtjylland": "Midtjylland",
    "Midtjylland": "Midtjylland",
    "FCSB": "FCSB",
    "FK Shakhtar Donetsk": "Shakhtar Donetsk",
    "Shakhtar Donetsk": "Shakhtar Donetsk",
    "Shakhtar": "Shakhtar Donetsk",
    "Viking FK": "Viking",
    "Viking": "Viking",
    "LASK Linz": "LASK",
    "Como 1907": "Como",
    "Como": "Como",
    "FK Bodø/Glimt": "Bodø/Glimt",
    "Bodø/Glimt": "Bodø/Glimt",
    "Paphos FC": "Pafos",
    "Pafos": "Pafos",
    "Pafos FC": "Pafos",
    "Qarabağ Ağdam FK": "Qarabag",
    "Qarabag": "Qarabag",
    "Qarabağ": "Qarabag",
    "Sabah FK": "Sabah",
    "FK Kairat": "Kairat Almaty",
    "Kairat": "Kairat Almaty",
    "Kairat Almaty": "Kairat Almaty",
    "Jagiellonia": "Jagiellonia",
    "Jagiellonia Bialystok": "Jagiellonia",
    "FC Twente": "Twente",
    "Twente": "Twente",
    "Royale Union Saint-Gilloise": "Union SG",
    "Union SG": "Union SG",
    "Union St. Gilloise": "Union SG",
    "Union Saint-Gilloise": "Union SG",
    "Apoel Nicosia": "Apoel",
    "Apoel": "Apoel",
    "Dynamo Kyiv": "Dynamo Kyiv",
    "Dynamo Kiev": "Dynamo Kyiv",
    "FC Union Berlin": "Union Berlin",
    "Union Berlin": "Union Berlin",
    "VfL Wolfsburg": "Wolfsburg",
    "Wolfsburg": "Wolfsburg",
    "Borussia Mönchengladbach": "Mönchengladbach",
    "Mönchengladbach": "Mönchengladbach",
    "Rennes": "Rennes",
    "Stade Rennais": "Rennes",
    "Sheriff Tiraspol": "Sheriff",
    "Sheriff": "Sheriff",
    "Antwerp": "Antwerp",
    "Royal Antwerp": "Antwerp",
    "Istanbul Basaksehir": "Istanbul Basaksehir",
    "Besiktas": "Besiktas",
    "Besiktas JK": "Besiktas",
    "Lazio": "Lazio",
    "SS Lazio": "Lazio",
    "Viktoria Plzen": "Plzen",
    "Plzen": "Plzen",
    "M. Haifa": "M. Haifa",
    "Maccabi Haifa": "M. Haifa",
    "Krasnodar": "Krasnodar",
    "FC Krasnodar": "Krasnodar",
    "Lokomotiv Moskva": "Lokomotiv Moskva",
    "Zenit": "Zenit",
    "Zenit Saint Petersburg": "Zenit",
}

# Aliases that map to a canonical *display* name (same spelling across sources
# but stored long/short). Kept separate so we never conflate display with fit.
DISPLAY_ONLY: dict[str, str] = {
    "Fenerbahçe SK": "Fenerbahçe",
    "Galatasaray SK": "Galatasaray",
    "AFC Ajax": "Ajax",
}

SOURCE = "team_registry"


def _normalize(name: str) -> str:
    """Lowercase, strip diacritics, collapse non-alphanumerics."""
    if not name:
        return ""
    name = unicodedata.normalize("NFKD", name or "")
    name = "".join(c for c in name if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", name.lower())


def fit_name(name: str) -> str | None:
    """Exact (normalized) lookup of a live name -> fit-time name."""
    if not name:
        return None
    norm = _normalize(name)
    if norm in _NORM_ALIASES:
        return _NORM_ALIASES[norm]
    return None


def _build_norm_aliases() -> dict[str, str]:
    out: dict[str, str] = {}
    for alias, fit in TEAM_ALIASES.items():
        out.setdefault(_normalize(alias), fit)
    for alias, display in DISPLAY_ONLY.items():
        out.setdefault(_normalize(alias), display)
    return out


_NORM_ALIASES: dict[str, str] = _build_norm_aliases()


def resolve_fit_name(live_name: str, known_fit_teams: list[str] | None = None) -> str:
    """Resolve a live-source team name to its fit-time (football-data.co.uk) name.

    Priority:
      1. Exact normalized alias match (TEAM_ALIASES).
      2. Exact normalized match against already-present fit names.
      3. Fuzzy (difflib) match against present fit names.
      4. Last resort: return the given name unchanged (caller decides).

    Returns the fit name string.
    """
    if not live_name:
        return live_name

    exact = fit_name(live_name)
    if exact:
        return exact

    if known_fit_teams:
        known_map = {_normalize(t): t for t in known_fit_teams if t}
        direct = known_map.get(_normalize(live_name))
        if direct:
            return direct

        close = difflib.get_close_matches(_normalize(live_name),
                                          [_normalize(t) for t in known_fit_teams],
                                          n=1, cutoff=0.6)
        if close:
            return known_map[close[0]]

    log.warning("No fit-name mapping for '%s' — using as-is", live_name)
    return live_name


# ---------------------------------------------------------------------------
# Durable seed into team_aliases table
# ---------------------------------------------------------------------------

def seed_team_aliases() -> int:
    """Write every alias into ``team_aliases(alias, fit_name, source)``.

    Idempotent (INSERT ON CONFLICT DO NOTHING). Returns number of new rows.
    """
    try:
        fetch_all("SELECT 1 FROM team_aliases LIMIT 1")
    except Exception:
        log.warning("team_aliases table missing — run migrate.sql first")
        return 0

    rows = [(alias, fit_name, SOURCE) for alias, fit_name in TEAM_ALIASES.items()]
    execute_many(
        """
        INSERT INTO team_aliases (alias, fit_name, source)
        VALUES (%s, %s, %s)
        ON CONFLICT (alias, source) DO NOTHING
        """,
        rows,
    )
    log.info("Seeded %d team aliases", len(rows))
    return len(rows)