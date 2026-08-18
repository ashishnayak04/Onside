# PRD — Onside

## 1. Problem Statement
The founder is a heavy European football fan who currently makes betting/team decisions based largely on gut feeling and luck, despite investing significant stakes on teams and players. There is no personal system that turns available football data (form, stats, injuries, xG) into a structured, trustworthy prediction — decisions are made without a disciplined, data-backed process.

## 2. Goal
Build Onside, a system that ingests football data (current + historical), calculates statistically grounded predictions for match outcomes and player performance, and presents them with transparent reasoning — replacing luck-based decisions with a measurable, improvable system.

## 3. Target User (V0)
Primarily the founder themselves. V0 is a personal tool first; broader users are a future consideration, not a V0 requirement.

## 4. Scope — V0

**In scope:**
- Two competitions only: **La Liga** and **UEFA Champions League**
- Pre-match predictions only (not live/in-play)
- Match outcome prediction: win/draw/loss + likely scoreline
- Player-level predictions: probability to score, assist, register shots on target
- Explainability: every prediction shown with the underlying stats (form, xG, injuries)
- Track record page: logged predictions vs. actual outcomes over time
- Model validated against historical backtests and current bookmaker odds as a benchmark

**Out of scope for V0:**
- Live/in-play prediction updates during a match
- User accounts, authentication, or multi-user support
- Payments or monetization
- Leagues/competitions beyond La Liga + UCL
- Mobile native app
- Caching/performance infrastructure beyond what free tiers provide

## 5. Success Criteria
- Model backtested against 2–3 historical seasons with measurable accuracy (not just "feels right")
- Predicted probabilities compared against bookmaker closing odds — Onside is only considered "working" if it demonstrates value beyond simply mirroring market pricing, or is at minimum honestly tracked against it
- Track record page shows real, running accuracy — not cherry-picked results
- Founder can open the app, view an upcoming La Liga/UCL match, and get a prediction with legible reasoning behind it

## 6. Core User Flow
1. User opens the app and sees upcoming La Liga + UCL fixtures
2. User selects a match
3. User views match outcome prediction (win/draw/loss, scoreline, confidence)
4. User views player prop predictions (goal/assist/shots probability)
5. User views the "why" — the stats driving the prediction
6. User checks the track record page to assess model performance over time

## 7. Technical Approach (Summary)
- **Data**: API-Football (live/current-season) + StatsBomb open data (historical, for training/backtesting)
- **Modeling**: Python — Poisson/Dixon-Coles baseline, upgraded to XGBoost/LightGBM with engineered features (form, xG/xA, rest days, injuries, head-to-head)
- **Storage**: PostgreSQL via Supabase — single normalized schema, with an ID-mapping table reconciling the two data sources
- **Pipeline**: Python job scheduled via GitHub Actions (daily + matchday), writes predictions into Postgres
- **App**: Next.js (API routes + server components), reads Postgres directly, hosted on Vercel
- **Cost**: $0/month on free tiers for V0

Full technical detail lives in `system-architecture.md`. Full feature breakdown lives in `features-list.md`.

## 8. Risks & Open Questions
- **Model quality is the real risk, not the tech stack.** A working pipeline with a weak model produces confident-looking but unreliable predictions. Backtesting against real bookmaker odds is the true test.
- **Data coverage gap**: StatsBomb open data does not cover the live current season — "current form" features can only come from API-Football at inference time.
- **Licensing**: StatsBomb open data is intended for research/personal-interest use with attribution required; if Onside is ever opened to other users or monetized, the license terms should be reviewed before relying on StatsBomb data as a core dependency.
- **Responsible use**: predictions are probabilistic, not guarantees. No model consistently beats efficiently-priced bookmaker markets — Onside should be treated as a decision-support tool, not a certainty engine, especially given the founder's stated pattern of high-stake betting.
- **Open decision**: whether Onside ever expands beyond a personal tool to other users — this affects whether auth, payments, and licensing review become required work later.

## 9. Milestones
1. Historical data loaded (StatsBomb) + Postgres schema live
2. Baseline Poisson/Dixon-Coles model backtested on historical seasons
3. Live data pipeline (API-Football) running on schedule
4. XGBoost model with engineered features, backtested against baseline
5. Next.js app: fixture list + match prediction page + player props
6. "Why this prediction" explainability panel
7. Track record page live, logging real predictions going forward