# Onside — Pending Work State
_Last updated: 2026-08-25 ~00:00 IST. Resume from "NEXT UP" section._

## DONE ✅
1. **Step 1 — Commit/push**: `58ccdef` + hygiene commit `5034675` pushed to origin/main.
2. **Step 2 — GitHub Actions**: `.github/workflows/pipeline.yml` created (daily 05:30 UTC + weekend 14:00 UTC crons, workflow_dispatch, concurrency guard). Needs repo secrets: `DATABASE_URL`, `API_FOOTBALL_KEY`.
   - `run_pipeline.py` step_ingest_live now uses canonical `api_football_loader.run()` (env key honored) for La Liga + UCL.
   - `api_football_loader.py`: added `LEAGUE_ID_UCL=2`, `run(league_id=...)`, country from league.
3. **Step 5 — UCL history**: `pipeline/ingestion/ucl_loader.py` (source: fixturedownload.com — football-data.co.uk has NO UCL). **878 matches loaded** across 2020/21–2025/26, competition='Champions League', Spanish clubs mapped to fd names (Ath Madrid etc.). Verified vs known finals.
4. **Step 4 — XGBoost challenger**: `pipeline/backtest/xgb_backtest.py`. RESULT: DC-SOT cal 50.3% acc / LL 1.0216 vs XGB cal 46.1% / LL 1.0458; bootstrap LL delta CI [-0.0234,+0.0368] → **NO significant winner, Dixon-Coles holds**. Bookies still best (52.4%, 1.0048). requirements.txt += xgboost>=3.4,<4 scikit-learn>=1.9,<2 (installed in venv).
5. **Step 3 partial — player props module**: `pipeline/predict/player_props.py` WRITTEN (xG-share method, Poisson thinning, shrinkage priors, name bridging, CLI preview). NOT yet compile-tested/run.
6. DB connection string lives in `web/.env.local` as DATABASE_URL (no pipeline/.env). PowerShell pattern used all session:
   `$line = (Get-Content ..\web\.env.local | Where-Object { $_ -match "^DATABASE_URL=" }); $env:DATABASE_URL = ($line -replace "^DATABASE_URL=", "").Trim()`

## NEXT UP ⏳
### A. Finish Step 3 — player props BACKTEST (`pipeline/backtest/player_props_backtest.py`) — file was being written when interrupted
Design already decided:
- Test season 2024/2025 = Understat year 2024 dates data (`getLeagueData/La_liga/2024` → `dates[]`, each has `id`, h/a titles, goals, xG, datetime).
- Player shares from PRIOR season playersData (**year 2023**) → no leakage.
- lam/mu per match: DC-SOT fit on DB seasons < '2024/2025' (reuse `backtest/xgb_backtest.fit_dc_sot` + `dc_probs_for` helpers by import or copy).
- Actual scorers: `https://understat.com/getMatchData/{id}` → JSON `{rosters:{h:{pid:{goals,xG,time,position,player,...}},a:{...}},shots,tmpl}` (verified working; match page HTML is JS-rendered, use this XHR endpoint).
- Cache responses to `pipeline/data/understat_matches/{id}.json`; sleep ~1.2s between requests; retries ×4; `--limit N` default 120.
- Join understat fixtures ↔ DB historical_matches by date±3d + normalized team names (reuse mapping approach from predict/player_props.py).
- Method probs: rostered players matched into prior-season table by norm(player_name) within team; if missing → position-prior-only share. Position buckets F/M/D/GK via `_position_bucket`.
- Naive baseline (faithful run_pipeline port): n=len(roster outfield), FWD gp=min(0.4,lam/n*3), MID min(0.15,lam/n*1.5), else min(0.05,lam/n*0.5); assist=SOT analogs same caps.
- Metrics: Brier+log-loss binary scored∈{0,1} per rostered outfield player both methods; paired bootstrap (2000, seed=7) on brier delta naive−method with 95% CI + verdict line; calibration buckets [0,.05,.1,.2,.35,.6,1]; honest print either way.
- Run: `$env:PYTHONIOENCODING="utf-8"; python -m backtest.player_props_backtest --limit 25` first, then larger limit if clean.

### B. Compile/run check of `predict/player_props.py`
`python -m py_compile predict/player_props.py` then optional `python -m predict.player_props --year 2025 --top 3`.

### C. Step 6 — End-to-end live test
Run `python -m ingestion.api_football_loader` (needs API_FOOTBALL_KEY env or system_config row) then `python -m predict.generator`; verify predictions rows written for scheduled fixtures incl. UCL names resolving via API_TO_FD/difflib.

### D. Wrap-up
- py_compile ALL new/modified files; git status review; commit everything as one feature commit (user approves commits).
- Known flag to investigate later: SOT-model Dixon-Coles fit hits rho=-1 bound (degenerate) — see xgb_backtest log.
- Optional fix noted by infra agent: `pipeline/.env.example` contains a bare psql command, not KEY=VALUE format.

## ENV NOTES
- Windows/PowerShell 5.1. Venv: `pipeline\.venv\Scripts\python.exe`.
- Always set PYTHONIOENCODING=utf-8 for scripts printing unicode.
- Understat getLeagueData occasionally returns empty/non-JSON transiently — retry logic mandatory (already in modules).
