const OPENPHISH_FEED = process.env.PHISHING_DATABASE_FEED_URL || "https://openphish.com/feed.txt"
const SOLANA_RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"

async function probeHttp(url, options = {}) {
  const startedAt = Date.now()
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    })
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      error: response.ok ? null : `HTTP ${response.status}`,
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function probeSolanaRpc() {
  return probeHttp(SOLANA_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
  })
}

const tokensConfigured = Boolean(process.env.TOKENS_XYZ_API_KEY?.trim())
const phishing = await probeHttp(OPENPHISH_FEED)
const solana = await probeSolanaRpc()

const report = {
  schemaVersion: 1,
  evaluationOnly: true,
  frozenCommit: "8561f45c72868ae75e8a5bcfeb554b964717d8ff",
  providers: {
    tokensXyz: {
      configured: tokensConfigured,
      activationEligible: tokensConfigured,
      blocker: tokensConfigured ? null : "TOKENS_XYZ_API_KEY is not available to the Holdout workflow.",
    },
    phishingFeed: {
      source: "OpenPhish Community Feed evaluation override",
      url: OPENPHISH_FEED,
      reachable: phishing.ok,
      status: phishing.status,
      latencyMs: phishing.latencyMs,
      activationEligible: phishing.ok,
      blocker: phishing.ok ? null : phishing.error,
    },
    solanaRpc: {
      source: process.env.SOLANA_RPC_URL ? "configured SOLANA_RPC_URL" : "Solana public mainnet RPC fallback",
      reachable: solana.ok,
      status: solana.status,
      latencyMs: solana.latencyMs,
      activationEligible: solana.ok,
      blocker: solana.ok ? null : solana.error,
    },
  },
}

const blockers = Object.values(report.providers)
  .map((item) => item.blocker)
  .filter(Boolean)

report.providerParityReady = blockers.length === 0
report.blockers = blockers

console.log(JSON.stringify(report, null, 2))

if (!report.providerParityReady) {
  console.error("ScamGuard V2 provider parity is incomplete. Holdout metrics must not be used for production activation.")
  process.exitCode = 2
}
