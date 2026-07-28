# Tri-Proof Guard Progress Notes

Last updated: 2026-07-28

## Current State

Tri-Proof Guard now has production-oriented wallet risk decisions, known entity detection, cluster-aware status handling, persistent wallet/referral/funding graphs, improved dashboard UX, and decision exports.

The app builds successfully and the core known-entity plus cluster scenarios were tested through the API and browser smoke checks.

Current product direction:

1. Telegram Bot MVP - complete
2. Group Guardian for Telegram groups - complete
3. URL Sandbox and Scam DNA fingerprinting - complete
4. Wallet, referral, and funding graph intelligence - complete
5. AI-assisted explanation layer for reports and user replies
6. Production observability, distributed rate limits, retention, and privacy controls
7. Full Project Registry with signed verification

### Wallet, Referral, and Funding Graph Intelligence

- Added optional CSV referral ingestion for referrer wallets, referral codes, and referral timestamps.
- Added persistent graph summary, node, and edge evidence tables with server-only RLS.
- Added typed wallet, funder, referrer, referral-code, and known-service nodes.
- Added confidence-scored funding and referral edges with retained evidence.
- Added unknown funder fan-out, burst funding, self-referral, low-activity referral fan-out, coordinated funding/referral cohort, and circular path detection.
- Known exchange, bridge, service, and protocol funding sources are neutralized so common withdrawal sources do not create false Sybil clusters.
- Existing admin wallet intelligence now controls trusted and known-bad funding origins without code changes.
- Graph risk reaches wallet decisions only when corroborating evidence exists.
- Added a component selector, interactive evidence graph, connection inspector, findings, and graph metrics to analysis reports.
- Added authenticated graph evidence API and V1 analysis summary output.
- Added graph engine and referral CSV parser test coverage.

## Completed Work

### URL Sandbox and Scam DNA

- Added passive HTML retrieval with no JavaScript execution, form submission, downloads, cookies, credentials, or wallet connection.
- Added strict HTTP/HTTPS validation, credential rejection, local/private/reserved IP blocking, all-record DNS validation, and per-redirect revalidation.
- Pinned outbound requests to the validated public IP to close DNS rebinding gaps.
- Added bounded request duration, response size, redirect count, HTML content type, and public endpoint rate limits.
- Added deterministic page fingerprints for:
  - content
  - DOM structure
  - script bundles and inline code
  - normalized visible copy
  - style assets
  - favicon route
  - redirect path
  - static behavior
  - EVM wallet/contract and Solana program targets
- Added static behavior detection for secret-material forms, cross-origin submissions, hidden iframes, wallet APIs, obfuscated scripts, clipboard access, downloads, and urgency timers.
- Added deduplicated Scam DNA fingerprints and campaign clusters in PostgreSQL.
- Added conservative cross-domain similarity rules so same-domain repeats and generic single-component matches do not affect scoring.
- Added admin-reviewed DNA verdicts and a management console at `/dashboard/admin/scamguard`.
- Added URL Sandbox and Scam DNA evidence to the public scanner, authenticated API, Telegram bot, and shared ScamGuard engine.
- Added RLS-enabled, server-only Prisma tables for DNA campaigns and fingerprints.
- Added focused unit coverage for HTML fingerprinting, SSRF policy, IPv4/IPv6 blocking, and clone corroboration.

Key files:

- `lib/scamguard/url-sandbox.ts`
- `lib/scamguard/html-fingerprint.ts`
- `lib/scamguard/scam-dna.ts`
- `app/api/admin/scamguard/dna/route.ts`
- `components/admin/scam-dna-console.tsx`
- `prisma/migrations/20260728210000_url_sandbox_scam_dna/migration.sql`

### Telegram Bot and Group Guardian Operations

- Added `/api/telegram/webhook` as the Telegram Bot API webhook endpoint.
- Added private chat command handling for:
  - `/start`
  - `/help`
  - `/scan`
  - `/wallet`
  - `/token`
  - `/tx`
  - `/report`
  - `/settings`
- Added natural input detection for URL, Solana wallet, EVM wallet, and transaction-like text.
- Added Group Guardian behavior for Telegram groups and supergroups:
  - extracts Telegram URL entities and plain URLs
  - scans up to five links per message
  - replies only when risk meets the configured threshold
- Added environment controls:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_WEBHOOK_SECRET`
  - `TELEGRAM_GROUP_ALERT_LEVEL`
- Added Telegram bot unit tests.
- Added persistent Telegram scan history with privacy-aware transaction payload storage.
- Added `/history`, `/summary`, and `/guardian` command families.
- Added Telegram API verification so only current group creators/admins can change settings.
- Added per-group:
  - protection on/off
  - database allowlist approval
  - `CAUTION`, `HIGH_RISK`, or `CRITICAL` thresholds
  - daily summary on/off
- Added repeated campaign detection for targets posted three or more times in a 24-hour window.
- Added a protected daily Vercel cron endpoint for 24-hour community summaries.
- Added `/dashboard/admin/telegram` for group approval, thresholds, protection state, reports, and recent activity.
- Added Prisma models and migration for groups, scan events, and repeated threat campaigns.

Key files:

- `app/api/telegram/webhook/route.ts`
- `lib/telegram/bot.ts`
- `lib/telegram/bot.test.ts`
- `lib/telegram/store.ts`
- `lib/telegram/api.ts`
- `app/api/telegram/daily-summary/route.ts`
- `app/dashboard/admin/telegram/page.tsx`

### Risk Engine

- Added known entity detection for public exchange/service wallets.
- Added wallet entity fields:
  - `entityLabel`
  - `entityType`
  - `entityRiskReason`
- Added decision fields:
  - `recommendedAction`
  - `statusExplanation`
- Known exchange/service/protocol/bridge wallets are no longer approved automatically.
- Cluster members and wallets sharing large funding groups are no longer approved automatically.
- Status decision order now follows the requested operational logic:
  - invalid wallet -> rejected
  - known entity -> Gray Zone
  - critical + severe cluster -> rejected
  - critical weak cluster -> Gray Zone
  - high risk -> Gray Zone
  - suspicious cluster member -> Gray Zone minimum
  - shared funding source with 5+ wallets -> Gray Zone minimum
  - medium risk -> Gray Zone
  - low risk with no contextual signal -> approved
- Known entity reason language was softened so exchange/service wallets are flagged for review, not labeled malicious.

Key files:

- `lib/risk-engine/index.ts`
- `lib/risk-engine/known-entities.ts`
- `types/index.ts`
- `prisma/schema.prisma`

### Dashboard UI/UX

- Wallet table no longer overflows horizontally.
- Long wallet addresses are shortened.
- Copy full wallet address button added.
- Reasons are truncated with a `+N more` pattern.
- Entity label/type badges added.
- Entity Review badge added for known entity wallets.
- Status badge colors clarified:
  - Approved: green
  - Gray Zone: amber/orange
  - Rejected: red
- Review button now opens a right-side detail drawer.
- Drawer includes:
  - full wallet address
  - chain
  - entity label/type
  - risk score/level
  - status
  - recommended action
  - funding source
  - cluster ID
  - tx count
  - wallet age
  - contract interactions
  - campaign actions
  - all risk reasons
  - why this action
  - notes
  - UI-only status buttons
- Added filters for:
  - approved
  - Gray Zone
  - rejected
  - low/medium/high/critical
  - cluster members
  - known entities
  - shared funding
  - cluster ID
  - entity type
  - search
- Added cluster detail cards with View wallets in this cluster.
- Added empty state for no clusters.
- Added risk distribution legend with counts/percentages.
- Added toast feedback for copy/status actions.
- Sidebar/navigation polished and placeholder Reports/Settings pages added.

Key files:

- `components/analysis/analysis-detail.tsx`
- `components/dashboard/dashboard-shell.tsx`
- `components/dashboard/metric-card.tsx`
- `app/dashboard/reports/page.tsx`
- `app/dashboard/settings/page.tsx`

### Summary Cards

Dashboard summary card order is now:

1. Total wallets
2. Approved
3. Gray Zone
4. Rejected
5. Average Risk
6. Suspicious Clusters
7. Known Entities

### New Analysis UX

- Project name now auto-falls back to:
  - `{Chain} {Campaign Type} Wallet Audit`
- Added drag/drop CSV upload surface.
- Added client-side CSV preview:
  - file name
  - file size
  - row count
  - detected columns
  - basic/enriched mode
  - invalid preview row count

Key file:

- `components/dashboard/new-analysis-form.tsx`

### Landing / Pricing / Visual Design

- Global dark premium SaaS palette updated for Web3 security product feel.
- Landing page polished with stronger product positioning, dashboard preview, roadmap, and CTA.
- Pricing page polished.
- Growth plan marked as Most Popular.

Key files:

- `app/globals.css`
- `components/landing/landing-page.tsx`
- `components/pricing/pricing-page.tsx`

### CSV / PDF Exports

- CSV export now includes:
  - `entity_label`
  - `entity_type`
  - `cluster_id`
  - `recommended_action`
  - `risk_reasons`
  - `status_explanation`
- Approved CSV excludes cluster/shared-funding wallets.
- Gray Zone CSV includes known/high/cluster/shared-funding cases.
- PDF now includes:
  - Decision Summary
  - Known Entity Findings
  - updated disclaimer language

Key files:

- `lib/exports/csv.ts`
- `lib/exports/pdf.ts`

### Demo / Sample Data

- Demo report updated to use the real risk engine output instead of manual overrides.
- Known entities test CSV exists.
- Suspicious cluster demo CSV exists.

Key files:

- `lib/demo-data.ts`
- `sample-data/known-entities-wallets.csv`
- `sample-data/suspicious-cluster-demo.csv`

## Verification Completed

Commands run successfully:

```powershell
npm.cmd run db:generate
npm.cmd run lint
npm.cmd run build
```

Known entity API test passed:

- Total wallets: 11
- Known entities: 5
- Gray Zone: 5
- Approved: 6
- Rejected: 0

Cluster API test passed:

- Suspicious cluster detected.
- Cluster members were not approved.
- Shared funding wallets were not approved.
- `recommendedAction` and `statusExplanation` were present.
- Approved CSV excluded cluster wallets.

Browser smoke test passed on:

- `http://localhost:3000/dashboard/demo`

Checked:

- No horizontal page overflow.
- Wallet/Entity/Risk/Status/Signals/Cluster/Action columns render.
- New filters render.
- Review drawer opens.
- Drawer shows recommended action, cluster info, reasons, notes, and decision buttons.

## Important Notes

- Prisma Client was regenerated after schema changes.
- Formal Prisma migrations exist for Telegram Guardian and URL Sandbox / Scam DNA storage.
- New server-only Scam DNA tables enable RLS without public client policies.
- Review drawer status changes currently work as UI/local state only. Persisting analyst decisions to the database is a good next step.
- URL Sandbox rate limiting is process-local; a distributed production limiter remains a later hardening task.

## Suggested Next Steps

1. Verify the production URL Sandbox migration, deep-scan API, and admin DNA controls after deployment.
2. Add suspicious poster correlation and distributed abuse/rate limits.
3. Add AI-assisted explanation copy for reports and Telegram replies.
4. Add DNA retention, reviewed corpus import, and campaign sharing controls.
5. Add production observability, distributed rate limits, retention, and privacy controls.
6. Create the full Project Registry with signed verification.

## Resume Checklist

Start from:

```powershell
cd C:\Users\bahri\triproof-guard
npm.cmd run dev
```

Then open:

```text
http://localhost:3000
http://localhost:3000/dashboard/demo
http://localhost:3000/dashboard/new-analysis
```

Quick health check:

```powershell
npm.cmd run lint
npm.cmd run build
```
