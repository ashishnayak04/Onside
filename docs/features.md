# Feature List — Onside

## V0 Scope: La Liga + UEFA Champions League

### 1. Data Ingestion
- [ ] Live/current-season data pull from API-Football (fixtures, lineups, injuries, team & player stats)
- [ ] Historical data load from StatsBomb open data (event-level match data for backtesting/training)
- [ ] Scheduled daily pull + matchday pull via GitHub Actions cron
- [ ] Team/player ID mapping table to reconcile StatsBomb IDs ↔ API-Football IDs ↔ internal IDs

### 2. Data Storage
- [ ] Normalized Postgres schema: `teams`, `players`, `matches`, `historical_matches`, `predictions`, `id_mapping`
- [ ] Source-tagging on records (`source: statsbomb | api_football`) for traceability

### 3. Feature Engineering
- [ ] Rolling form (last 5 / last 10 matches)
- [ ] xG / xA rates (season and rolling window)
- [ ] Home/away performance splits
- [ ] Head-to-head history
- [ ] Rest days since last match
- [ ] Injury/suspension status per player
- [ ] Competition-context adjustment (league match vs. UCL knockout dynamics)

### 4. Prediction Model
- [ ] Baseline: Poisson / Dixon-Coles model for match outcome & scoreline
- [ ] Upgrade: XGBoost/LightGBM model using engineered features
- [ ] Player-level sub-models: probability to score, assist, register a shot on target
- [ ] Confidence score attached to every prediction
- [ ] Model output stored with the specific stats that drove it (for explainability)

### 5. Validation & Backtesting
- [ ] Backtest model against 2–3 historical seasons before going live
- [ ] Compare predicted probabilities against bookmaker closing odds (market benchmark)
- [ ] Automated accuracy log: predicted vs. actual outcome, per match
- [ ] Periodic retraining trigger as new results come in

### 6. App — Frontend
- [ ] Home screen: upcoming La Liga + UCL fixtures list
- [ ] Match detail page: win/draw/loss %, predicted scoreline, confidence
- [ ] Player props view: goal / assist / shots-on-target probability per player
- [ ] "Why this prediction" panel — shows the actual form/xG/injury data behind the call
- [ ] Track record page — historical predictions vs. actual results, running accuracy

### 7. Infrastructure
- [ ] Free-tier hosting: Supabase (DB), Vercel (Next.js app), GitHub Actions (Python pipeline)
- [ ] Environment-based config for API keys (`API_FOOTBALL_KEY`)

---

## Post-V0 / Future Roadmap (not in scope yet)

- [ ] Expand beyond La Liga + UCL to additional leagues/cups
- [ ] User accounts & authentication (Supabase Auth)
- [ ] Personal bet tracking / bankroll log tied to predictions
- [ ] Caching layer (Redis) for high-traffic match pages
- [ ] Notifications (injury news, lineup confirmed, prediction updated)
- [ ] Live in-play predictions (separate streaming architecture — explicitly out of scope for now)
- [ ] Public/shareable prediction pages
- [ ] Monetization (subscription, premium picks) — requires legal/licensing review first
- [ ] Mobile app (same backend, new client)
- [ ] Model versioning / A-B testing between model iterations