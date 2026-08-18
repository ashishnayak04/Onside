# System Architecture — Onside

## 1. Overview
Onside runs on a **batch prediction model**, not live/real-time inference. Matches are known days in advance and injury/form data changes at most a few times a day, so the Python model runs on a schedule and writes results to a shared database that the app reads from. There is no live in-play prediction in this architecture (explicitly out of scope for V0).

## 2. Final Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Data pipeline & modeling | Python (pandas, statsmodels, XGBoost/LightGBM) | Pull data, engineer features, train/run predictions |
| Historical training data | StatsBomb open data | Free, no API key, event-level data for backtesting |
| Live/current data | API-Football | Fixtures, lineups, injuries, current-season stats |
| Job scheduling | GitHub Actions (cron) | Runs the Python pipeline daily + on matchdays |
| Database | PostgreSQL via Supabase | Single shared source of truth |
| Backend + Frontend | Next.js (API routes + server components) | One codebase; reads Postgres directly via Supabase client |
| Hosting | Vercel | Hosts the Next.js app |
| Auth / Caching | Not implemented in V0 | Added later if/when needed |

## 3. Data Flow (Backend Pipeline)

```
Football data sources (API-Football [live] + StatsBomb open data [historical])
        │
        ▼
Ingestion service (Python, scheduled via GitHub Actions)
        │
        ▼
PostgreSQL database (Supabase)
   - teams, players, matches, historical_matches, id_mapping
        │
        ▼
Feature engineering (Python)
   - rolling form, xG/xA rates, rest days, head-to-head, injuries
        │
        ▼
Prediction model (Python)
   - Poisson/Dixon-Coles baseline → XGBoost/LightGBM with features
        │
        ▼
Predictions table (Postgres)
        │
        ▼
Next.js app (API routes / server components read Postgres directly)
        │
        ▼
User-facing dashboard (Vercel)
        │
        ▼
Outcome logging → feeds back into retraining loop
```

## 4. App Flow (User-Facing)

```
Home: upcoming La Liga + UCL fixtures
        │
        ▼
Select a match
        │
        ▼
Match prediction (win/draw/loss, scoreline, confidence)
        │
        ▼
Player props (goal / assist / shots probability)
        │
        ▼
"Why this prediction" (form, xG, injuries behind the call)
        │
        ▼
Track record (past predictions vs. actual results)
```

## 5. Data Sources — Roles, Not Interchangeable

| Source | Auth | Role | Coverage note |
|---|---|---|---|
| API-Football | API key required | Live/current-season operational data | Covers current fixtures/injuries/lineups; this season only |
| StatsBomb open data | None — static JSON, no key | Historical training & backtesting | Limited set of past seasons/competitions — does not include the live current season; verify exact coverage in their repo before assuming it fits a given season |

Both sources are normalized into Onside's own internal schema via source-specific adapters, so the model and app code never touch source-specific formats directly. A mapping table reconciles team/player IDs across StatsBomb, API-Football, and internal IDs (matched by name + country + birthdate for players).

## 6. Database Schema (Core Tables)

- `teams` — id, name, country, source_ids (mapping)
- `players` — id, name, team_id, position, source_ids (mapping)
- `matches` — id, competition, date, home_team_id, away_team_id, status
- `historical_matches` — event-level match data from StatsBomb, used for training only
- `predictions` — match_id, predicted_outcome, predicted_scoreline, player_prop_predictions, confidence, feature_snapshot (the stats used), created_at
- `id_mapping` — statsbomb_id, api_football_id, internal_id, entity_type (team/player)

## 7. Cost & Hosting

All layers run on free tiers for V0:
- API-Football: free tier (100 req/day)
- StatsBomb open data: free, no key
- Supabase: free tier, permanent (no expiring database)
- Vercel: free tier
- GitHub Actions: free scheduled cron

Total cost to build and validate V0: **$0/month**.

## 8. Known Scaling Points (Not Rebuilds — Upgrades)

| Trigger | Change |
|---|---|
| Complex multi-league scheduling / retries | GitHub Actions → Airflow/Prefect |
| Real traffic exceeding free tier caps | Upgrade Supabase/Vercel tier |
| High repeat traffic on match pages | Add Redis/edge caching in front of Postgres |
| Opening to other users | Add Supabase Auth |
| Wanting live in-play predictions | Separate streaming architecture — not an extension of this system, a distinct build |

## 9. Explicit Non-Goals for V0
- No live/in-play prediction updates during a match
- No user accounts or authentication
- No payments/monetization
- No caching layer
- No leagues/competitions beyond La Liga + UEFA Champions League