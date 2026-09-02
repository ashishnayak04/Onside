# Onside — Pending Work State
_Last updated: 2026-08-27. Next up: landing page build (separate brief). Resume item C (hosting) / D (prod cron) below._

## DONE ✅
15. **football-data.org loader (NEXT UP A)**: Built `pipeline/ingestion/football_data_org_loader.py` — v4 API current-season source (La Liga PD + UCL CL, also PL/BL1/SA/FL1). Token via env `FOOTBALL_DATA_ORG_KEY` or `system_config` key `football_data_org_key`; honors throttling headers (`x-requests-available-minute`, `X-RequestCounter-Reset`). Team upsert with diacritic/compat-name matching; `external_id = "fdorg:{id}"`.
16. **football-data.org token registered**: Daniel (football-data.org) issued token `01c05…45d`; stored in `system_config` (key=`football_data_org_key`, secret). Ingested **La Liga 2026/27: 380 fixtures (18 finished + 362 scheduled)** and **UCL 2025/26: 189 fixtures (finished)**.
17. **Live source switched**: `run_pipeline.py` step_ingest_live now prefers football-data.org, falls back to API-Football. Fixed `_config_value` to query DB with lowercase config keys.
18. **Team dedup + merge**: First fd.org load created duplicate teams (fd names like "FC Barcelona"/"Club Atlético de Madrid" vs old API-football "Barcelona"/"Atletico Madrid"). Merged 12 duplicates (re-pointed matches/players, deleted old rows). Teams 98 → 86.
19. **Name bridge for generator (NEXT UP B)**: Added fd.org→fit-time aliases in `predict/generator.py` (`Club Atlético de Madrid`→`Ath Madrid`, `RC Celta de Vigo`→`Celta`, `Real Racing Club de Santander`→`Santander`). Fixed date-type bug in `features/build_features.py` (date vs tz-aware datetime comparison).
20. **End-to-end pipeline test with real current data (NEXT UP B)**: `python run_pipeline.py --skip-historical` — ingested 380+189 via fd.org, built features for 100 fixtures, **generated 365 predictions** for real current-season matches (e.g. Celta vs Osasuna, Barcelona vs Athletic). Verified 365 upcoming scheduled + 365 predictions in DB.

## DONE ✅
21. **Web auth fix (middleware→proxy) + end-to-end web verification**: Next.js 16 `middleware.ts` runs in the **Edge runtime**, where `jsonwebtoken` (Node crypto) silently fails → `verifyToken()` returned `null` for any valid token → **all authenticated routes redirected to `/login`** (a pre-existing app bug). Fixed by migrating `src/middleware.ts` → `src/proxy.ts` (Next 16 Node-runtime convention, which the deprecation warning recommends). Verify: `POST /api/auth/login` → `/admin` redirect for super_admin; `/api/fixtures` & `/api/predictions` return real data (50-row LIMIT each), e.g. Osasuna vs Valencia home_win 0.45, model `dc-sot-hybrid-w0.4-xi0.004-v1`. Removed leftover temp `web/libtest.mjs`.

## DONE ✅
11. **API-Football free plan ingestion**: Fixed `api_football_loader.py` to use season+from/to instead of next/last (unsupported on free plan). Free plan only allows seasons 2022-2024. Ingested season 2024: **380 La Liga + 223 UCL fixtures** (all finished, since season 2024/2025 is over).
12. **End-to-end pipeline test**: Inserted 3 test scheduled matches (Atletico-Barcelona, Real Madrid-Sociedad, Betis-Sevilla). DC-SOT hybrid generator produced 3 predictions with confidence scores [57.6%-74.0%]. **Pipeline fully verified end-to-end.**
13. **API key stored in DB**: Inserted into `system_config` table (key=`api_football_key`).
14. **Recommended free current-season source**: [football-data.org](https://www.football-data.org) — 10 req/min, no credit card, covers La Liga + CL + top 5 leagues, current season. Needs new loader module.

## DONE ✅
1. **Step 1 — Commit/push**: `58ccdef` + hygiene commit `5034675` pushed to origin/main.
2. **Step 2 — GitHub Actions**: `.github/workflows/pipeline.yml` created (daily 05:30 UTC + weekend 14:00 UTC crons, workflow_dispatch, concurrency guard). Needs repo secrets: `DATABASE_URL`, `API_FOOTBALL_KEY`.
   - `run_pipeline.py` step_ingest_live now uses canonical `api_football_loader.run()` (env key honored) for La Liga + UCL.
   - `api_football_loader.py`: added `LEAGUE_ID_UCL=2`, `run(league_id=...)`, country from league.
3. **Step 5 — UCL history**: `pipeline/ingestion/ucl_loader.py` (source: fixturedownload.com — football-data.co.uk has NO UCL). **878 matches loaded** across 2020/21–2025/26, competition='Champions League', Spanish clubs mapped to fd names (Ath Madrid etc.). Verified vs known finals.
4. **Step 4 — XGBoost challenger**: `pipeline/backtest/xgb_backtest.py`. RESULT: DC-SOT cal 50.3% acc / LL 1.0216 vs XGB cal 46.1% / LL 1.0458; bootstrap LL delta CI [-0.0234,+0.0368] → **NO significant winner, Dixon-Coles holds**. Bookies still best (52.4%, 1.0048). requirements.txt += xgboost>=3.4,<4 scikit-learn>=1.9,<2 (installed in venv).
5. **Step 3 partial — player props module**: `pipeline/predict/player_props.py` WRITTEN (xG-share method, Poisson thinning, shrinkage priors, name bridging, CLI preview). **Compiles clean.**
6. **Step 3 — player props BACKTEST**: `pipeline/backtest/player_props_backtest.py` COMPLETED and RUN. RESULT: **METHOD WINS** — xG-share method beats naive baseline. Brier delta naive−method: +0.0272, 95% CI [+0.0066, +0.0488]. Calibration good at low-prob buckets.
7. **Bug fix — admin login broken**: `scripts/migrate.sql` had a fake/placeholder bcrypt hash that couldn't verify against "admin123". Replaced with real bcrypt hash. Admin login now works (`admin@onside.io` / `admin123`).
8. **All pipeline Python files py_compile clean** (19 files verified).
9. **Next.js build passes** (TypeScript + build OK). ESLint has a known `esutils` CJS/ESM compat issue with ESLint 9 — non-blocking.
10. DB connection string lives in `web/.env.local` as DATABASE_URL (no pipeline/.env). PowerShell pattern used all session:
    `$line = (Get-Content ..\web\.env.local | Where-Object { $_ -match "^DATABASE_URL=" }); $env:DATABASE_URL = ($line -replace "^DATABASE_URL=", "").Trim()`

### Codebase audit fixes (all applied)
- **C1**: Deleted public `/api/config` route that leaked all secrets (API key, DB URL, JWT secret)
- **C2**: Added `CREATE UNIQUE INDEX IF NOT EXISTS idx_track_record_prediction_match ON track_record(prediction_id, match_id)` to migrate.sql + live DB — enables correct `ON CONFLICT` in write_predictions.py
- **H1**: Pipeline step 4 now delegates to `predict.generator.generate()` (DC-SOT hybrid with recency weighting) instead of fitting a basic DixonColesModel directly
- **H2**: Fixed `font-family: Arial` → `font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif` in globals.css
- **H3**: Replaced `<a>` tags with Next.js `<Link>` in admin overview + pipeline page for SPA navigation
- **M1**: Removed dead `src/types/index.ts` (all types unused)
- **M3**: Renamed misleading `stats.predicted` → `stats.correct` in dashboard (it stores correct_predictions count)
- **M4**: Removed unused `export default pool` from `lib/db.ts`
- **M5**: Fixed `/api/track-record` accuracy from 0-1 to 0-100% (consistent with dashboard)
- **M7**: Added `console.error()` logging to 5 server component catch blocks that silently swallowed DB errors

## NEXT UP ⏳

### A. football-data.org loader for current season — ✅ DONE (see DONE 15-20)
Loader, token, source switch, team dedup, name bridge, and end-to-end test all complete.

### C. Hosting / deployment
Web app (Next.js 16 + PostgreSQL) needs a host. Options:
- **Vercel** (easiest for Next.js) + **Neon/Supabase** (managed PostgreSQL)
- **Railway** or **Fly.io** (full-stack, runs both web + pipeline)
- **VPS** (Hetzner/DigitalOcean) for everything

### D. Pipeline cron in production
Once hosted, configure GitHub Actions or a cron to run `python run_pipeline.py` periodically (already has `.github/workflows/pipeline.yml`).

## REMAINING LOW-PRIORITY ITEMS
- L1: No loading/skeleton states on server-rendered pages (nice-to-have for perceived perf)
- L2: Dark mode toggle exists but system always sends `dark` class (cosmetic)
- L3: No test suite (Jest/Vitest for web, pytest for pipeline) — important for long-term
- M6: `NEXT_PUBLIC_APP_URL` in .env.local unused (dead config, harmless)
- SOT-model Dixon-Coles fit hits rho=-1 bound (degenerate) — see xgb_backtest log
- `pipeline/.env.example` contains a bare psql command, not KEY=VALUE format
