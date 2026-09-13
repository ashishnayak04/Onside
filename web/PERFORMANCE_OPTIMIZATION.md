# Onside Web — Performance Optimization Log

Scope: Next.js 16.3.1 / React 19.2.8 / Tailwind 4 app under `web/`. Raw `pg` pool, App Router, JWT auth (`onside_token` cookie) enforced by `src/proxy.ts`.

Method: measure first (dev server, `curl`), fix the root cause, re-measure, record the delta. No rewrites, no unexpected UX changes.

---

## 1. Baseline (before)

Measured on `localhost:3000` (Next dev server) with a valid `super_admin` JWT. Times are `curl` `%{time_total}` (includes Next dev-mode on-demand compilation for first hit).

| Route | Status | Size (bytes) | Time (s) |
|---|---|---|---|
| `/` (landing) | 200 | 57,849 | 0.16 |
| `/login` | 307 → `/login` | 6 | 0.02 |
| `/dashboard` | 200 | 57,957 | 0.53 |
| `/dashboard/fixtures` | 200 | **3,318,117** | **2.79–4.79** |
| `/dashboard/predictions` | 200 | 148,298 | 0.60 |
| `/dashboard/track-record` | 200 | 102,712 | 0.36 |
| `/admin` | 200 | 38,017 | 1.62 |
| `/admin/users` | 200 | 20,497 | 1.03 |
| `/admin/config` | 200 | 20,512 | 1.02 |
| `/admin/pipeline` | 200 | 20,526 | 0.91 |
| `/api/auth/me` | 200 | 133 | 0.06 |
| `/api/predictions` | 200 | 32,864 | 0.87 |
| `/api/fixtures` | 200 | 28,774 | 0.52 |
| `/api/track-record?page=1&limit=20` | 200 | 10,657 | 0.06 |
| `/api/admin/users` | 200 | 425 | 0.53 |
| `/api/admin/config` | 200 | 3,222 | 0.55 |

Un-cookied request → `/api/auth/me` correctly returns 307 to `/login` (auth layer works).

### Headline problem
`/dashboard/fixtures` ships **3.3 MB of HTML/SSR payload**. Root cause: `src/app/(dashboard)/dashboard/fixtures/page.tsx` runs an **unbounded query** — no `WHERE`, no `LIMIT` — returning all 1,319 matches, multiplied to ~1,814 rows by a `LEFT JOIN predictions` (multiple prediction rows per match). `FixturesClient` then renders every row as a full `<Link>` in the RSC payload.

DB context (checked live):
- `matches` table: **1,319 rows**, 592 kB total; scheduled: **480**
- `predictions` table: 1,004 rows, 808 kB; `feature_snapshot` (jsonb) ≈ 387 kB total
- No index on `(status, match_date)`, no index on `home_team_id`/`away_team_id`
- Admin users API already returns explicit columns (no `password_hash` leak) ✅

---

## 2. Fixes applied

### FIX-1 (CRITICAL) — Bounded, deduplicated fixtures query
`src/app/(dashboard)/dashboard/fixtures/page.tsx`
- Add `WHERE m.status = 'scheduled'` (matches every other fixtures query in the app: `/dashboard`, `/api/fixtures`)
- Replace the `LEFT JOIN predictions` (which can duplicate a match) with a `LEFT JOIN LATERAL (... ORDER BY p.created_at DESC LIMIT 1)` so each match appears once with its latest prediction
- Add `LIMIT 100` so the page cannot grow unbounded

### FIX-2 — Drop `feature_snapshot` from predictions list payloads
`feature_snapshot` is only rendered on the match-detail explainability panel. The list queries don't need it.
- `src/app/(dashboard)/dashboard/predictions/page.tsx`: `SELECT p.*` → explicit columns
- `src/app/api/predictions/route.ts`: same for the list branch (detail branch intentionally keeps `p.*`)

### FIX-3 — Parallelize independent database queries
- `src/app/(dashboard)/dashboard/page.tsx`: run fixtures + accuracy stat queries in `Promise.all`
- `src/app/(dashboard)/dashboard/matches/[id]/page.tsx`: fetch `match` + latest `prediction` in `Promise.all` (player props still depends on the prediction id)

---

## 3. Post-fix measurements (measured, warm dev server)

| Route | Before | After | Delta |
|---|---|---|---|
| `/dashboard/fixtures` | 3,318,117 B / **2.79–4.79 s** | **214,998 B / ~0.6 s** | **84% smaller payload, ~6.5× faster** |
| `/dashboard/predictions` | 148,298 B / 0.60 s | 142,679 B / ~0.53 s | −5.7 KB, snapshot blob removed |
| `/api/predictions` | 32,864 B / 0.87 s | 27,845 B / ~0.07 s | −5.0 KB, much faster |
| `/dashboard` | 57,957 B / 0.53 s | 57,894 B / ~0.55 s | queries now run in parallel |
| `/dashboard/matches/[id]` | (n/a, unauth-blocked) | 200 / 41,804 B / 0.63 s | spot-checked OK; match + prediction now in parallel |

Verification: `tsc --noEmit` clean, `npm run lint` clean, match-detail navigation spot-checked.

### FIX-4 — Admin login flow
- Removed redundant `router.refresh()` after `router.push()` in `(auth)/login/page.tsx` + `(auth)/register/page.tsx` (was issuing a second full RSC request). Use `router.replace()` so `/login` isn't left in history.
- Replaced pure-JS **`bcryptjs` → native `bcrypt`** in `lib/auth.ts` (drop-in, both use `$2b$` hashes; verified existing stored hashes parse + compare correctly with native lib). bcryptjs removed from deps.
- Measured `POST /api/auth/login`: ~0.31–0.46 s → ~0.18–0.22 s warm.
- Verified admin routes are all fast when warm: `/admin` 0.60 s, `/admin/users` 0.39 s, `/admin/config` 0.40 s, `/admin/pipeline` 0.36 s (server components / 4 parallel COUNTs). The only remaining login cost is intentional bcrypt hashing — no further reduction without weakening security.
- Dev-mode note: the first hit on any route includes Next on-demand compilation (e.g. first `/admin` load ~1.6 s); that disappears in production builds.

---

## 4. Not doing (with reason)

| Idea | Why skipped |
|---|---|
| Rewrite landing page animations (gsap + framer-motion) | Both libs intentionally drive the animated hero; "never fix dev-mode-normal slowdown" rule |
| Remove `"use client"` from `Brand.tsx` | Cosmetic; no measured impact. Low-risk follow-up |
| Add route/caching headers in `next.config.ts` | Dev-mode measurement only; production caching is a separate concern (noted for prod deploy) |
| New DB indexes on `(status, match_date)` | Data is tiny (1.3k rows); UNLESS after LIMIT the sequential scan is a boundary, revisit when data grows. Cheap add if desired later |
| Paginate fixtures in the UI | Changes UX (page currently shows a grouped list); FIX-1 bounds it to 100 → consistent with `predictions` (LIMIT 50) |

Potential follow-ups (not required for this task): `Promise.all` in `/api/predictions` match-detail branch is impossible (dependency), leave as-is.
---

# Trust / Security Sweep (session 2026-09-13)

## P0 � Credentials & access
- **Rotated live admin password** for dmin@onside.io from the seeded/leaked dmin123 to a strong 18-char password (bcrypt **cost 12**). Verified live: new password ? POST /api/auth/login 200; dmin123 ? 401.
- **Deactivated decoy** demo@threadiq.local (is_active=false).
- **Purged the seeded super-admin INSERT** from web/scripts/migrate.sql � no default credentials ever ship. Replaced by web/scripts/set-admin-password.js (admin-provisioning tool).
- **Registration disabled**: pi/auth/register now 403; /register + /api/auth/register removed from proxy.ts publicRoutes; route group page deleted; login page no longer links to sign-up. Verified: POST /api/auth/register no longer public (307 ? /login; direct API returns 403 for authed users).
- bcrypt note: native crypt crashed Turbopack on Windows mid-session ? reverted to pure-JS cryptjs (drop-in, $2b$ compatible; stored cost-12 hash verifies fine). serverExternalPackages removed from 
ext.config.ts.

## P1 � Honest claims (no more fabricated numbers)
- Landing STATS, hero sub, method banner, TrackRecord copy, CTA banner ("Your First Prediction Is Free"/"Get My First Prediction" removed), layout.tsx metadata, login page stat � all purged of 1,527 / 50.3% / log-loss / bookmaker myths.
- Replaced with **real computed numbers**: 44 tracked reads, 50.0% top-pick hit rate (22/44), Brier 0.62, 839 finished matches, 2 competitions (computed from 	rack_record/matches).
- "Confidence" UI labels ? **"Model Probability"** (PredictionsClient, FixturesClient, matches/[id]); displayed value now the max outcome probability.
- **NEW /methodology** page (public): model version dc-sot-hybrid-w0.4-xi0.004-calib-v1, inputs (form/xG/availability/H2H/rest), scoring pipeline, track record + small-sample caveats, "not betting advice".
- **Responsible-prediction disclaimer** added to CTA banner.

## P2 � Pipeline honesty
- **NEW pipeline_runs** table (status unning/success/failed, model_version, fixtures_processed, predictions_written, track_record_synced, error, timestamps) � added to migrate.sql AND applied to live DB.
- **pipeline/run_pipeline.py instrumented**: creates a unning row at start, finalizes on completion (failed if any step errored, first error captured), threads real counts + MODEL_VERSION.
- **NEW /api/admin/pipeline-status** (admin-only): latest run, total runs, configured model.
- **dmin/pipeline page**: fake "operational � running on schedule" banner replaced with real run status (success/failed/no-runs, started/finished time, error text) + last-run detail rows.
- Fixed live system_config.prediction_model = xgboost ? real dc-sot-hybrid-w0.4-xi0.004-calib-v1.

## Verification
- 	sc --noEmit: clean. 
pm run lint: clean.
- Live smoke test: login(new) 200 / login(admin123) 401 / register 307 / methodology 200 / landing 200 / pipeline-status 200.
- Debug note: silent 500s on login during the session were a **PowerShell curl JSON-quoting artifact**, not app code � use -d @file for JSON POSTs from PowerShell 5.1.
