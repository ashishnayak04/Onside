# Tech Stack — Onside

## 1. Summary

Onside splits into two independent codebases that only communicate through a shared PostgreSQL database: a **Python pipeline** (data + modeling, no HTTP) and a **Next.js app** (frontend + backend, reads the database directly). This split keeps the ML/data side isolated from the user-facing side, which matters once auth, billing, and multi-tenancy get added for SaaS.

## 2. Stack by Layer

| Layer | Technology | Status |
|---|---|---|
| Data pipeline & modeling | Python (pandas, statsmodels, XGBoost/LightGBM) | V0 |
| Historical training data | StatsBomb open data | V0 — research-license only, needs review before commercial use |
| Live/current data | API-Football | V0 (free tier) → paid commercial tier before selling |
| Job scheduling | GitHub Actions (cron) | V0 |
| Database | PostgreSQL via Supabase | V0 |
| Backend + Frontend | Next.js (API routes + server components) | V0 |
| Hosting (app) | Vercel | V0 |
| Auth | Supabase Auth | Post-V0, added for SaaS |
| Billing | Stripe | Post-V0, added for SaaS |
| Caching | Redis (or Vercel edge cache) | Added when real traffic requires it |
| Job orchestration (advanced) | Airflow or Prefect | Added if pipeline complexity outgrows GitHub Actions |

## 3. Why Each Choice

**Python for the pipeline** — no real alternative. The ML ecosystem (XGBoost, statsmodels, scikit-learn) has no equivalent maturity in JavaScript. This layer runs as a scheduled batch job, not a live service, since football fixtures and injury news don't need second-by-second updates — predictions can be computed ahead of kickoff.

**PostgreSQL over NoSQL** — the domain is inherently relational: teams have players, players belong to matches, matches belong to competitions, predictions reference matches. A relational database avoids re-joining data in application code that Postgres already does natively.

**Next.js for both frontend and backend** — one language (JavaScript/TypeScript) across the entire user-facing surface. Server components query Supabase directly; API routes exist specifically for client-triggered actions (e.g., a refresh button) and for future consumers like a mobile app hitting the same backend.

**Supabase over self-hosted Postgres** — a real, non-expiring free tier for V0, plus built-in Auth for when SaaS features are added, without needing a separate auth provider.

**GitHub Actions over a dedicated scheduler** — free, reliable enough for daily/matchday jobs on a small number of competitions. Upgrade to Airflow/Prefect only once retry logic and multi-league scheduling complexity actually demands it — not before.

**Vercel for hosting** — zero-config deploys paired natively with Next.js, generous free tier for early traffic.

## 4. Two Data Sources, Two Distinct Roles

| Source | Auth | Role | License note |
|---|---|---|---|
| StatsBomb open data | None (static JSON) | Historical training/backtesting only | Intended for research/personal-interest use with attribution — needs a licensing review before being relied on in a paid product |
| API-Football | API key | Live current-season data (fixtures, injuries, lineups) | Free tier for V0; commercial-tier subscription required before selling access to predictions built on it |

These are never merged into one API call — each has its own ingestion adapter, normalized into Onside's internal schema, reconciled via an ID-mapping table (StatsBomb ID ↔ API-Football ID ↔ internal ID).

## 5. What Changes When Onside Becomes a Paid SaaS Product

| Addition | Technology | Reason |
|---|---|---|
| User accounts | Supabase Auth | Required once there's more than one user |
| Subscription billing | Stripe | Handles payment data directly — Onside never touches raw card data |
| Multi-tenancy in schema | New `users`, `subscriptions`, `plans` tables | Ties predictions/access to paying accounts |
| Commercial data licensing | Paid API-Football tier (or Sportmonks) | StatsBomb open data license does not clearly cover commercial resale |
| Caching | Redis or Vercel edge cache | Needed once match pages get repeat traffic at scale |
| Compliance docs | Terms of Service, Privacy Policy, Disclaimer | Legally required before accepting payment or user data |

## 6. Explicit Non-Goals (Stack Decisions Deliberately Not Made Yet)

- **No live/in-play prediction infrastructure.** The entire batch-job architecture assumes pre-match predictions only. Live in-play predictions would require a streaming architecture (websockets, continuously re-scoring model) — a genuinely separate system, not an extension of this one.
- **No mobile-native app.** Next.js serves a mobile-friendly web experience; a native app is a future addition on top of the same API routes, not a current requirement.
- **No microservices split beyond pipeline/app.** Two codebases is the right amount of separation for this scale — introducing more services now would add operational overhead without a corresponding need.

## 7. Cost Summary

| Stage | Monthly cost |
|---|---|
| V0 (build + validate, personal use) | $0 — all free tiers |
| Early SaaS (paid data tier + Stripe + upgraded hosting) | Variable — scales with usage, starts roughly $50–150/month depending on data plan chosen |