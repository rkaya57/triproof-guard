# Tri-Proof Guard Progress Notes

Last updated: 2026-06-28

## Current State

Tri-Proof Guard MVP now has stronger wallet risk decisions, known entity detection, cluster-aware status handling, improved dashboard UX, and updated CSV/PDF exports.

The app builds successfully and the core known-entity plus cluster scenarios were tested through the API and browser smoke checks.

## Completed Work

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
  - known entity -> manual review
  - critical + severe cluster -> rejected
  - critical weak cluster -> manual review
  - high risk -> manual review
  - suspicious cluster member -> manual review minimum
  - shared funding source with 5+ wallets -> manual review minimum
  - medium risk -> manual review
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
  - Manual Review: amber/orange
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
  - manual review
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
3. Manual Review
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
- Manual review CSV includes known/high/cluster/shared-funding cases.
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
- Manual Review: 5
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
- A formal Prisma migration file has not yet been created in this pass.
- If a real database is used, run a migration before production use.
- Review drawer status changes currently work as UI/local state only. Persisting analyst decisions to the database is a good next step.
- Dev server was observed on `http://localhost:3000`.

## Suggested Next Steps

1. Create and apply a Prisma migration for the new wallet fields.
2. Add automated tests for risk decision order.
3. Persist Review drawer status/notes to the database.
4. Run a full browser test with the user's real CSV upload flow.
5. Check login/register behavior against the active database/local-store setup.
6. Prepare production deployment settings once the MVP behavior is accepted.

## Resume Checklist

Start from:

```powershell
cd C:\Users\bahri\tri-proof-guard
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
