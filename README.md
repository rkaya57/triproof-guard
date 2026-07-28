# Tri-Proof Guard

Tri-Proof Guard is a Solana-first Web3 security product for campaign teams, wallets, launchpads, and dApps. It combines wallet-list Sybil analysis with ScamGuard pre-sign protection so projects can reduce fake campaign participation and users can avoid unsafe claim, mint, reward, and wallet-signing flows.

The current product build includes a public landing page, ScamGuard scanner, Telegram bot webhook beta, Group Guardian link scanning, Chrome extension beta, authenticated API, admin intelligence console, Sybil analysis dashboard, CSV/PDF exports, and production-oriented tests.

## Grant Reviewer Summary

**Problem:** Solana campaigns attract Sybil wallets, fake reward pages, risky token mints, and wallet drain attempts. Teams need a practical security layer before rewards are distributed or signatures are requested.

**Solution:** Tri-Proof Guard provides two connected protection layers:

- **Sybil Analysis:** upload campaign wallet CSVs, enrich wallet context, detect suspicious clusters, review gray-zone wallets, and export reward decisions.
- **ScamGuard:** scan URLs, wallets, token mints, contracts, and transaction intent before a user clicks or signs.

**Why this fits Solana Foundation Turkey Grants:** the product protects high-frequency Solana onboarding surfaces: airdrops, quests, mints, rewards, token launches, and community campaigns. It is designed as reusable infrastructure for Turkish Solana builders, not a one-off dashboard.

## Live Product Surfaces

- Landing page: `/`
- ScamGuard scanner: `/scamguard`
- Sybil mini audit: `/audit`
- Demo report: `/dashboard/demo`
- API docs: `/docs/api`
- Admin intelligence console: `/dashboard/admin/scamguard`
- Chrome extension package: `/downloads/scamguard-chrome-extension.zip`
- Telegram bot webhook: `/api/telegram/webhook`

## Core Features

### ScamGuard Pre-Sign Intelligence

- URL, wallet, token mint, and transaction intent scans
- Solana and EVM scan routing
- Suspicious claim, airdrop, mint, presale, reward, and wallet-drain pattern detection
- Punycode, redirect, URL credential, encoded payload, shortener, and typosquat checks
- Verified project registry to reduce false positives for real projects
- Known-bad and suspicious domain/counterparty intelligence
- External phishing feed support
- SSRF-safe passive URL Sandbox with DNS/IP validation, pinned connections, bounded HTML reads, and redirect revalidation
- Scam DNA fingerprinting across DOM structure, scripts, copy, styles, redirects, static behavior, and wallet/program targets
- Cross-domain campaign clone matching with corroboration thresholds and reviewed campaign verdicts
- Solana wallet/account and token mint checks when RPC is configured
- EVM contract bytecode, verified source, proxy, and deployer checks when provider keys are configured
- EVM approval and unlimited allowance detection
- Solana parsed instruction handling for delegate approvals, authority changes, transfers, and account-close style risk
- Explainable result layer with score, confidence, decision reason, evidence, and user action

### Chrome Extension Beta

- Current-tab protection status
- Page link scanner
- Inline banner for browsing sessions
- Solana provider pre-sign observer:
  - `signTransaction`
  - `signAndSendTransaction`
  - `signAllTransactions`
  - generic provider request calls
- EVM provider pre-sign observer:
  - `eth_sendTransaction`
  - `personal_sign`
  - `eth_sign`
  - `eth_signTypedData_v4`
  - `wallet_switchEthereumChain`
- Balanced, Strict, and Paranoid protection profiles
- Trusted domain controls
- Configurable ScamGuard API base URL

### Telegram Bot and Group Guardian

- Webhook endpoint for Telegram Bot API updates
- Private chat commands:
  - `/start`
  - `/help`
  - `/scan <link|wallet|token|tx>`
  - `/wallet <address>`
  - `/token <mint|contract>`
  - `/tx <transaction payload>`
  - `/report <item>`
  - `/history`
  - `/summary`
  - `/settings`
- Natural input scanning when a user sends a URL, wallet, token, or transaction payload directly
- Group Guardian mode for Telegram groups and supergroups
- Automatic URL extraction from messages and Telegram URL entities
- Persistent private and group scan history
- Telegram-verified, admin-only `/guardian` controls
- Per-group protection status, approval, alert threshold, and daily summary settings
- Repeated campaign detection after the same target appears multiple times
- Scheduled 24-hour community protection summaries
- Admin operations console at `/dashboard/admin/telegram`
- Configurable group alert threshold: `CAUTION`, `HIGH_RISK`, or `CRITICAL`
- Replies only when a scanned group link meets the configured risk threshold
- Uses the same ScamGuard engine as the web scanner, extension, and API

### Sybil Campaign Analysis

- CSV wallet uploads
- Basic and enriched CSV support
- Wallet age, transaction count, funding source, activity, balance, and contract-interaction context
- Shared funding cluster detection
- Persistent wallet, referral, and funding evidence graphs
- Referral fan-out, self-referral, burst funding, circular path, and coordinated cohort detection
- Known exchange/service funding neutralization to reduce false positives
- Known entity handling for exchange, service, contract, and protocol accounts
- Approved, Gray Zone, and rejected/not-eligible outputs
- CSV and PDF exports
- Dashboard review flow
- Public demo mode

### Admin Intelligence

- Trusted, suspicious, and known-bad domain management
- EVM spender/counterparty intelligence
- Solana wallet/token/program intelligence
- Scam DNA campaign clusters, cross-domain evidence, labels, and reviewed `SUSPICIOUS` / `KNOWN_BAD` verdicts
- False positive and missed-risk feedback loop
- Admin operations console at `/dashboard/admin/scamguard`

### URL Sandbox and Scam DNA

- `POST /api/scamguard/scan-url` runs a bounded passive HTML inspection by default.
- JavaScript is never executed, forms are never submitted, downloads are never opened, and wallet providers are never connected.
- Every target and redirect is restricted to HTTP/HTTPS, resolved across all A/AAAA records, rejected if any answer is private or reserved, and connected through a validated pinned IP.
- The response body is limited by time and bytes. Non-HTML responses are reported without parsing.
- Static analysis detects secret-material collection, cross-origin forms, hidden wallet frames, obfuscated wallet code, automatic downloads, wallet APIs, clipboard access, and urgency patterns.
- Scam DNA stores deduplicated fingerprints and groups related observations into campaign clusters.
- A generic framework or same-domain repeat does not create a risk escalation. Automated clone signals require a cross-domain match, at least two independent matching components, a similarity threshold, and prior high-risk or reviewed campaign context.
- Admin-reviewed `KNOWN_BAD` DNA can create a critical signal; unreviewed `UNKNOWN` clusters remain evidence only.
- Seed intelligence plus database-backed overrides

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide React icons
- PostgreSQL with Prisma ORM
- bcrypt password auth and signed HTTP-only JWT cookies
- PapaParse CSV parsing
- Recharts
- Zod validation
- pdf-lib report exports
- Chrome extension, Manifest V3

## Repository Structure

```text
app/                         Next.js routes and API endpoints
components/                  UI components and product pages
components/scamguard/        ScamGuard public scanner page
components/admin/            Admin intelligence console
lib/scamguard/               ScamGuard risk engine and tests
lib/risk-engine/             Campaign wallet risk engine and tests
lib/onchain/                 Provider routing and enrichment adapters
lib/sdk/                     Tri-Proof API client
lib/telegram/                Telegram bot and Group Guardian handlers
chrome-extension/            ScamGuard Chrome extension beta
sample-data/                 Example wallet CSV files
scripts/                     Build, validation, and maintenance scripts
prisma/                      Prisma schema and migrations
public/downloads/            Downloadable extension package
```

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
copy .env.example .env
```

3. Configure the required local secrets:

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="long-random-session-secret"
ACCESS_PASS_SIGNING_SECRET="long-random-access-pass-secret"
WORKER_SECRET="long-random-worker-secret"
TRIPROOF_API_KEY="server-to-server-api-key"
TRIPROOF_API_USER_EMAIL="api-user@example.com"
```

For local development only, you can opt into insecure fallback secrets:

```env
DEV_ALLOW_INSECURE_SECRETS="true"
```

Never enable insecure fallback secrets in production.

4. Generate Prisma Client and migrate:

```bash
npm run db:generate
npm run db:migrate
```

5. Run locally:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Provider Configuration

### Solana

Use either a direct Solana RPC URL or a Helius API key:

```env
SOLANA_RPC_URL="https://your-solana-rpc"
HELIUS_API_KEY="helius-key"
```

### EVM

Use Etherscan V2, Alchemy, or Blockscout-compatible providers:

```env
ETHERSCAN_API_KEY=""
ALCHEMY_API_KEY=""
BLOCKSCOUT_API_URL=""

BASESCAN_API_KEY=""
ARBISCAN_API_KEY=""
OPTIMISTIC_ETHERSCAN_API_KEY=""
POLYGONSCAN_API_KEY=""
BSCSCAN_API_KEY=""
```

Recommended provider order:

```env
ONCHAIN_PROVIDER_PRIORITY="helius,etherscan,alchemy,blockscout,mock"
```

Local/demo runs can fall back to the deterministic mock provider when no real provider is configured.

## On-Chain Enrichment

The On-Chain Enrichment Engine lets a campaign team upload a CSV containing wallet addresses and fetch additional activity data before running the risk engine.

Supported modes:

- **CSV Only:** use fields provided in the uploaded CSV.
- **On-Chain Enrichment:** fetch wallet activity, age, funding source, balances, and interaction data from providers.
- **Hybrid:** use uploaded CSV fields first and enrich missing values.

Runtime controls:

```env
ONCHAIN_ENRICHMENT_ENABLED="true"
ONCHAIN_MAX_WALLETS_PER_ANALYSIS="100"
ONCHAIN_BATCH_SIZE="10"
ONCHAIN_REQUEST_DELAY_MS="500"
ONCHAIN_CACHE_TTL_HOURS="24"
```

Provider calls run server-side only. API keys never reach the browser, and raw provider responses are not exposed in the UI.

## CSV Formats

Basic:

```csv
wallet_address
0x123...
0x456...
```

Enriched:

```csv
wallet_address,chain,tx_count,wallet_age_days,funding_source,first_seen,last_seen,total_volume,contracts_count,campaign_actions_count,referrer_address,referral_code,referral_timestamp
0x123...,Base,12,45,0xabc...,2026-01-10,2026-02-12,102.5,5,8,0xreferrer...,SPRING-26,2026-01-10T09:30:00Z
```

Referral columns are optional. Supported aliases include `referrer_wallet`,
`referred_by`, `inviter_wallet`, `invite_code`, `ref_code`, `referred_at`, and
`invited_at`. Invalid referrer addresses are ignored and reported without
dropping the participant row.

## Wallet, Referral, and Funding Graph Intelligence

Every completed analysis now persists a campaign-scoped evidence graph:

- participant wallets, external funders, referrers, referral codes, and known services become typed nodes
- first funding relationships and explicit campaign referrals become confidence-scored edges
- connected components retain the evidence behind each relationship
- known exchange, bridge, protocol, and service funding sources are neutralized instead of being treated as Sybil evidence
- admin-managed `TRUSTED` wallet intelligence can neutralize partner funders, while `KNOWN_BAD` funding origins become high-confidence evidence
- shared unknown funding alone remains a review signal; timing bursts, low-activity referral fan-out, funding/referral overlap, self-referral, and circular paths provide corroboration
- only corroborated graph patterns add graph risk to wallet decisions

The dashboard renders component-level graph evidence and the authenticated
`GET /api/v1/analysis/:id` response includes `graphIntelligence`.

Sample files are available in `sample-data/`:

- `basic-wallets.csv`
- `enriched-wallets.csv`
- `suspicious-cluster-demo.csv`
- `referral-funding-graph-demo.csv`

## ScamGuard API

Public scanner endpoints:

```text
POST /api/scamguard/scan-url
POST /api/scamguard/scan-wallet
POST /api/scamguard/scan-token
POST /api/scamguard/scan-transaction
POST /api/scamguard/feedback
```

Authenticated B2B endpoint:

```text
POST /api/v1/scamguard/scan
Authorization: Bearer <TRIPROOF_API_KEY>
```

Example:

```bash
curl -X POST https://triproofprotocol.com/api/v1/scamguard/scan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "type": "transaction",
    "chain": "evm",
    "value": "{\"method\":\"eth_sendTransaction\",\"params\":[{\"to\":\"0x1111111111111111111111111111111111111111\",\"data\":\"0x095ea7b3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff\"}]}",
    "sourceUrl": "https://app.project.xyz/claim"
  }'
```

SDK helper:

```ts
import { TriProofClient } from "@/lib/sdk/triproof-client"

const client = new TriProofClient({
  baseUrl: "https://triproofprotocol.com",
  apiKey: process.env.TRIPROOF_API_KEY!,
})

const result = await client.scanScamGuard({
  type: "url",
  chain: "solana",
  value: "https://app.project.io/rewards",
})
```

## Chrome Extension

Local install:

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the `chrome-extension` folder.

Validation:

```bash
npm run extension:validate
```

The extension default API base URL is:

```text
https://triproofprotocol.com
```

## Telegram Bot and Group Guardian

Required production environment variables:

```text
TELEGRAM_BOT_TOKEN=123456:telegram_bot_token
TELEGRAM_WEBHOOK_SECRET=random-long-secret
NEXT_PUBLIC_APP_URL=https://triproofprotocol.com
```

Optional:

```text
TELEGRAM_GROUP_ALERT_LEVEL=HIGH_RISK
TELEGRAM_GROUP_ALLOWLIST=-1001234567890,-1009876543210
```

Allowed values for `TELEGRAM_GROUP_ALERT_LEVEL`:

- `CAUTION`: warn on medium and stronger risk
- `HIGH_RISK`: warn on high and critical risk
- `CRITICAL`: warn only on critical risk

New groups start blocked and must be approved from `/dashboard/admin/telegram`.
`TELEGRAM_GROUP_ALLOWLIST` adds an optional deployment-level restriction. When
it is set, a group must be present in both the environment allowlist and the
database allowlist.

Group admin commands:

```text
/guardian
/guardian on
/guardian off
/guardian threshold caution
/guardian threshold high
/guardian threshold critical
/guardian summary on
/guardian summary off
/history
/summary
```

Setting changes call Telegram `getChatMember`; only the group creator or a
current Telegram administrator can change protection.

Set the Telegram webhook after deployment:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://triproofprotocol.com/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
  -d "drop_pending_updates=true"
```

Health check:

```text
GET /api/telegram/webhook
```

Daily summaries run through:

```text
GET /api/telegram/daily-summary
```

The production cron is declared in `vercel.json` and authenticated with
`CRON_SECRET`. The endpoint is idempotent within its summary window.

## Testing and Validation

Run the risk-engine test suite:

```bash
npm test
```

Run lint:

```bash
npm run lint
```

Validate the Chrome extension:

```bash
npm run extension:validate
```

Build production output:

```bash
npm run build
```

Current core coverage includes:

- clean wallet approval behavior
- new/low-activity wallet rejection
- shared funding clusters
- campaign-only farming behavior
- known public entity detection
- policy overrides
- known scam domains
- verified project false-positive reduction
- clean unknown rewards surfaces
- risky claim domains on suspicious TLDs
- EVM approval payloads
- unlimited approvals
- known bad EVM counterparties
- Solana parsed token instructions
- Telegram bot command routing
- Group Guardian risky-link warning behavior

## Grant Milestones

Proposed Solana Foundation Turkey Grants scope:

1. **Solana transaction decoding:** expand SPL Token, Token-2022, account close, delegate, authority, transfer, and serialized transaction review.
2. **Project intelligence registry:** improve admin-managed trusted, suspicious, and known-bad domain/spender intelligence and reduce false positives.
3. **Extension public beta:** polish onboarding, warning overlays, protection profiles, and real browsing-session UX.
4. **Partner API package:** document B2B endpoint examples, SDK usage, response schema, and integration patterns for Solana teams.

## Security and Privacy Boundary

- Tri-Proof Guard never asks for seed phrases, private keys, wallet passwords, or custody permissions.
- ScamGuard scans URLs, public addresses, token mints, transaction payloads, and optional wallet public key context.
- Provider keys are server-side only.
- Risk results are decision support, not absolute truth.
- Verified domain context reduces false positives but does not override dangerous transaction intent.
- Feedback can report false positives and missed risks for review.

## Roadmap

- Telegram Bot hardening: language preference, richer `/report`, and abuse/rate limits
- Group Guardian moderation: suspicious poster correlation and account-level campaign views
- Larger reviewed Scam DNA corpus and scheduled retention controls
- Stronger Solana serialized transaction decoding
- Wider SPL Token and Token-2022 instruction coverage
- Public verified project registry workflow
- External threat feed expansion
- Chrome Web Store listing
- Workspace-level scan history
- Partner SDK examples
- More production-grade Sybil enrichment for Solana campaigns
- Full Project Registry with signed project verification messages

## Active Development Order

1. Telegram Bot MVP - complete
2. Group Guardian for Telegram groups - complete
3. URL Sandbox and Scam DNA fingerprinting - complete
4. Wallet, referral, and funding graph intelligence - complete
5. AI-assisted explanation layer for reports and user replies
6. Production observability, distributed rate limits, retention, and privacy controls
7. Full Project Registry with signed verification

## Disclaimer

Tri-Proof Guard provides risk analysis and decision support. It does not guarantee that a wallet, URL, token, contract, or transaction is definitively malicious or legitimate. Final reward, security, and operational decisions should be made by the project team and the user should always verify the wallet prompt before signing.
