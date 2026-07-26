# Tri-Proof Guard

Tri-Proof Guard is a Web3 campaign wallet risk analysis and Sybil detection dashboard. It lets projects upload wallet CSVs, run heuristic risk scoring, review suspicious clusters, and export clean reward lists before airdrops, testnets, whitelists, quests, or reward campaigns.

## Tech Stack

- Next.js App Router, TypeScript, Tailwind CSS
- shadcn/ui with Lucide React icons
- PostgreSQL with Prisma ORM
- Simple email/password auth with bcrypt and signed HTTP-only JWT cookies
- PapaParse CSV parsing, Recharts charts, Zod validation
- CSV exports and PDF reports with pdf-lib
- ScamGuard Solana public scanner module for suspicious URLs, wallets, token mints, and transaction intent

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
copy .env.example .env
```

3. Set `DATABASE_URL` to a PostgreSQL database and configure required secrets:

```env
NEXTAUTH_SECRET="long-random-session-secret"
ACCESS_PASS_SIGNING_SECRET="long-random-access-pass-secret"
WORKER_SECRET="long-random-worker-secret"
TRIPROOF_API_KEY="server-to-server-api-key"
TRIPROOF_API_USER_EMAIL="api-user@example.com"
SOLANA_RPC_URL="https://your-solana-rpc"
# or HELIUS_API_KEY="helius-key"
```

For local development only, you can opt into insecure fallback secrets with
`DEV_ALLOW_INSECURE_SECRETS=true`. Never enable that in production.

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

## CSV Formats

Basic:

```csv
wallet_address
0x123...
0x456...
```

Enriched:

```csv
wallet_address,chain,tx_count,wallet_age_days,funding_source,first_seen,last_seen,total_volume,contracts_count,campaign_actions_count
0x123...,Base,12,45,0xabc...,2026-01-10,2026-02-12,102.5,5,8
```

Basic CSVs are supported with deterministic demo heuristics and show a limited analysis mode note.

## On-Chain Enrichment

The **On-Chain Enrichment Engine** lets you upload a CSV containing only
`wallet_address` and have Tri-Proof Guard fetch real on-chain data
(transaction count, wallet age, funding source, balances, contract interactions
and more) from blockchain APIs before running the risk engine.

### Analysis modes

Pick a mode on the **New Analysis** page:

- **CSV Only** — use only the fields provided in the uploaded CSV (default; the
  original behaviour, no API calls).
- **On-Chain Enrichment** — fetch wallet activity, age, funding source and
  interaction data from blockchain APIs. API data is authoritative; CSV values
  only fill gaps the API could not resolve.
- **Hybrid** — use uploaded CSV fields first and enrich only the missing data
  from blockchain APIs.

### How it works

1. The CSV is parsed and validated as usual.
2. For On-Chain / Hybrid modes, wallets are enriched in batches
   (`ONCHAIN_BATCH_SIZE`, default 25) with a delay between batches
   (`ONCHAIN_REQUEST_DELAY_MS`, default 250ms) to stay within API rate limits.
3. Transient failures retry with exponential backoff (up to 3 times). A wallet
   that still fails falls back to mock data or is marked `failed` — **a single
   failed wallet never fails the whole analysis**.
4. Results are merged into the wallet records and fed to the existing risk
   engine, cluster detection and known-entity detection.
5. The funding source for each wallet is derived from its **first incoming
   native transfer**, which powers shared-funding cluster detection.

### Supported chains

EVM chains share provider adapters: **Ethereum, Base, Arbitrum, Optimism,
Polygon, BNB Chain**. Solana is shown in the UI but on-chain enrichment is
*coming soon* (Solana still works in CSV Only mode).

### Providers

Providers are selected per chain following `ONCHAIN_PROVIDER_PRIORITY`.
Recommended MVP order:

```env
ONCHAIN_PROVIDER_PRIORITY="etherscan,alchemy,blockscout,mock"
```

1. **Etherscan V2** — recommended primary provider. One `ETHERSCAN_API_KEY`
   works across supported EVM chains through `chainid` routing.
2. **Alchemy** — JSON-RPC + `alchemy_getAssetTransfers`. Add
   `ALCHEMY_API_KEY` as an optional second provider/fallback.
3. **Blockscout-compatible** — optional fallback for a specific public/self-hosted
   explorer through `BLOCKSCOUT_API_URL`.
4. **Mock provider** — deterministic, realistic fallback used when no real key is
   configured, in local/demo runs and in tests. It can generate shared funding
   groups, known entities, contract wallets, brand-new wallets and dormant
   high-activity wallets, so the full pipeline works **without any API key**.

If no provider is configured for a chain the engine automatically falls back to
the mock provider and surfaces the warning *“API key not configured. Mock
enrichment data was used for this analysis.”*

### Environment variables

```env
ETHERSCAN_API_KEY=""
ALCHEMY_API_KEY=""
BLOCKSCOUT_API_URL=""

# Backward-compatible per-chain explorer keys. Usually not needed if ETHERSCAN_API_KEY is set.
BASESCAN_API_KEY=""
ARBISCAN_API_KEY=""
OPTIMISTIC_ETHERSCAN_API_KEY=""
POLYGONSCAN_API_KEY=""
BSCSCAN_API_KEY=""

ONCHAIN_ENRICHMENT_ENABLED="true"
ONCHAIN_PROVIDER_PRIORITY="etherscan,alchemy,blockscout,mock"
ONCHAIN_MAX_WALLETS_PER_ANALYSIS="100"
ONCHAIN_BATCH_SIZE="10"
ONCHAIN_REQUEST_DELAY_MS="500"
ONCHAIN_CACHE_TTL_HOURS="24"
```

For the first production tests, keep `ONCHAIN_MAX_WALLETS_PER_ANALYSIS` around
`100`, `ONCHAIN_BATCH_SIZE` around `10`, and `ONCHAIN_REQUEST_DELAY_MS` around
`500` to reduce rate-limit risk.

### Caching, limits and security

- Enriched wallets are cached for `ONCHAIN_CACHE_TTL_HOURS` (default 24h) per
  chain+address to avoid repeat API calls.
- On-chain enrichment is capped at `ONCHAIN_MAX_WALLETS_PER_ANALYSIS`
  (default 1000) per analysis. Larger files should use CSV Only mode.
- All provider calls run **server-side only**. API keys never reach the browser,
  raw API responses are never shown in the UI (only processed data), and keys
  are never written to logs.

### Campaign actions

Campaign action counts require the campaign's contract addresses. On the New
Analysis page (On-Chain / Hybrid modes) you can paste campaign contract
addresses (one per line); wallet interactions with those contracts are counted
as `campaign_actions_count`. Without them, campaign-only behaviour signals are
only applied when the value is present in the CSV.

## Demo Mode

Use `/dashboard/demo` or the landing page “View Demo Report” button. Demo mode includes 500 wallets, 320 approved, 110 Gray Zone, 70 rejected, 8 suspicious clusters, and exportable CSV/PDF reports.

## Sample Data

See `sample-data/`:

- `basic-wallets.csv`
- `enriched-wallets.csv`
- `suspicious-cluster-demo.csv`

## ScamGuard Solana

ScamGuard Solana is integrated as a public pre-sign security module at
`/scamguard`. It does not replace the Sybil analysis product; it adds a second
security surface for suspicious Solana links, wallets, token mints, and
transaction intent.

Current MVP checks:

- Suspicious airdrop, mint, claim, presale, and brand-impersonation URL patterns
- Seed phrase and private key lure language
- Suspicious wallet/program patterns with optional Solana RPC account checks
- Token mint authority and freeze authority checks when Solana RPC is configured
- Transaction intent signals such as approve delegate, set authority, close token account, and transfer-all
- Optional Solana `simulateTransaction` for base64 serialized transactions

Public scanner endpoints:

- `POST /api/scamguard/scan-url`
- `POST /api/scamguard/scan-wallet`
- `POST /api/scamguard/scan-token`
- `POST /api/scamguard/scan-transaction`

B2B endpoint and SDK:

- `POST /api/v1/scamguard/scan` accepts `{ type, value, walletAddress? }`
- Uses the same `Authorization: Bearer <TRIPROOF_API_KEY>` flow as the existing v1 API
- `TriProofClient.scanScamGuard()` is available in `lib/sdk/triproof-client.ts`
- Dashboard shows a unified security score combining Sybil safety and ScamGuard readiness

Production path:

- Persist ScamGuard scan history per workspace
- Add known drainer domain and wallet intelligence feeds
- Add wallet adapter packages for richer transaction decoding before sign

## Roadmap

- USDC payment integration for pricing plans
- API beta access for Pro accounts
- Background queue + live progress polling for very large on-chain enrichment jobs
- Solana on-chain enrichment support
- ScamGuard Solana production risk engine and B2B API

## Disclaimer

Tri-Proof Guard provides risk analysis and decision support. It does not guarantee that a wallet, URL, token, or transaction is definitively malicious or legitimate. Final reward, security, and operational decisions should be made by the project team.
