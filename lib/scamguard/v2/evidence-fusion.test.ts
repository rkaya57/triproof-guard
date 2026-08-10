import assert from "node:assert/strict"
import test from "node:test"

import { resetPhishingDatabaseCacheForTests } from "@/lib/scamguard/providers/phishing-database"
import { resetToken2022RpcCacheForTests } from "@/lib/scamguard/providers/token-2022-rpc"
import { resetTokensXyzCacheForTests } from "@/lib/scamguard/providers/tokens-xyz"
import { observeScamGuardV2 } from "./evidence-fusion"

const originalFetch = globalThis.fetch
const originalEnv = {
  tokensKey: process.env.TOKENS_XYZ_API_KEY,
  tokensUrl: process.env.TOKENS_XYZ_API_URL,
  phishingEnabled: process.env.PHISHING_DATABASE_ENABLED,
  phishingUrl: process.env.PHISHING_DATABASE_FEED_URL,
  solanaRpc: process.env.SOLANA_RPC_URL,
  heliusKey: process.env.HELIUS_API_KEY,
}

function restoreEnv() {
  globalThis.fetch = originalFetch
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  restore("TOKENS_XYZ_API_KEY", originalEnv.tokensKey)
  restore("TOKENS_XYZ_API_URL", originalEnv.tokensUrl)
  restore("PHISHING_DATABASE_ENABLED", originalEnv.phishingEnabled)
  restore("PHISHING_DATABASE_FEED_URL", originalEnv.phishingUrl)
  restore("SOLANA_RPC_URL", originalEnv.solanaRpc)
  restore("HELIUS_API_KEY", originalEnv.heliusKey)
  resetTokensXyzCacheForTests()
  resetPhishingDatabaseCacheForTests()
  resetToken2022RpcCacheForTests()
}

test.afterEach(restoreEnv)

test("V2 observes weak Solana market health without changing the V1 decision", async () => {
  delete process.env.SOLANA_RPC_URL
  delete process.env.HELIUS_API_KEY
  process.env.TOKENS_XYZ_API_KEY = "test-key"
  process.env.TOKENS_XYZ_API_URL = "https://tokens.example/v1"
  process.env.PHISHING_DATABASE_ENABLED = "false"

  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes("/assets/resolve")) {
      return new Response(JSON.stringify({
        assetId: "solana-mint-a",
        resolvedBy: "singleton",
        mint: "mint-a",
        asset: { assetId: "solana-mint-a", name: "Example", symbol: "EX", category: "crypto" },
        variant: { mint: "mint-a", chain: "solana", kind: "native", trustTier: "tier3" },
      }), { status: 200 })
    }
    if (url.includes("/assets/risk-summary")) {
      return new Response(JSON.stringify({ score: 25, grade: "D", label: "Weak", hasInsufficientData: false }), { status: 200 })
    }
    if (url.includes("/assets/variant-markets")) {
      return new Response(JSON.stringify({
        rows: [{ mint: "mint-a", market: { liquidity: 500, volume24hUSD: 5_000, holder: 12 } }],
      }), { status: 200 })
    }
    throw new Error(`Unexpected fetch: ${url}`)
  }

  const observation = await observeScamGuardV2({ type: "token", value: "mint-a", chain: "solana" })

  assert.equal(observation.mode, "observe_only")
  assert.equal(observation.summary.decisionChanged, false)
  assert.equal(observation.evidence.tokensXyz?.status, "available")
  assert.equal(observation.evidence.token2022?.status, "unavailable")
  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_VERY_LOW_TOKEN_LIQUIDITY"))
  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_VERY_LOW_HOLDER_COUNT"))
  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_WEAK_MARKET_HEALTH_SCORE"))
})

test("V2 observes an independent phishing-feed match without mutating the V1 result", async () => {
  delete process.env.TOKENS_XYZ_API_KEY
  process.env.PHISHING_DATABASE_ENABLED = "true"
  process.env.PHISHING_DATABASE_FEED_URL = "https://phishing.example/active.txt"

  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url === "https://phishing.example/active.txt") {
      return new Response("evil.example\n", { status: 200 })
    }
    if (url.includes("eth-phishing-detect")) {
      return new Response(JSON.stringify({ blacklist: [], fuzzylist: [], whitelist: [] }), { status: 200 })
    }
    return new Response("", { status: 404 })
  }

  const observation = await observeScamGuardV2({
    type: "url",
    value: "https://evil.example/claim",
    chain: "solana",
  })

  assert.equal(observation.summary.decisionChanged, false)
  assert.equal(observation.evidence.phishingDatabase?.matched, true)
  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_ACTIVE_PHISHING_FEED_MATCH" && signal.severity === "critical"))
  assert.ok(observation.base.riskLevel)
})

test("V2 observes Token-2022 control surfaces without changing the V1 decision", async () => {
  const mint = "So11111111111111111111111111111111111111112"
  delete process.env.TOKENS_XYZ_API_KEY
  process.env.PHISHING_DATABASE_ENABLED = "false"
  process.env.SOLANA_RPC_URL = "https://rpc.example"
  delete process.env.HELIUS_API_KEY

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url !== "https://rpc.example") return new Response("", { status: 404 })
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string }
    if (body.method !== "getAccountInfo") return new Response(JSON.stringify({ result: null }), { status: 200 })
    return new Response(JSON.stringify({
      result: {
        value: {
          owner: "TokenzQdBNbLqP5VEhdkAS6EPF1SMH1dbKqP6Xk6mN",
          executable: false,
          data: {
            program: "spl-token-2022",
            parsed: {
              type: "mint",
              info: {
                decimals: 6,
                supply: "1000000",
                isInitialized: true,
                mintAuthority: null,
                freezeAuthority: null,
                extensions: [
                  { extension: "PermanentDelegate" },
                  { extension: "TransferHook" },
                  { extension: "TokenMetadata" },
                ],
              },
            },
          },
        },
      },
    }), { status: 200 })
  }

  const observation = await observeScamGuardV2({ type: "token", value: mint, chain: "solana" })

  assert.equal(observation.summary.decisionChanged, false)
  assert.equal(observation.evidence.token2022?.isToken2022, true)
  assert.equal(observation.evidence.token2022?.inspection?.highestSeverity, "high")
  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_TOKEN2022_PERMANENTDELEGATE" && signal.severity === "medium"))
  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_TOKEN2022_TRANSFERHOOK" && signal.severity === "low"))
  assert.ok(!observation.proposedSignals.some((signal) => signal.code === "V2_TOKEN2022_TOKENMETADATA"))
})

test("V2 provider failures remain observable but do not throw or replace the base decision", async () => {
  process.env.TOKENS_XYZ_API_KEY = "test-key"
  process.env.TOKENS_XYZ_API_URL = "https://tokens.example/v1"
  delete process.env.SOLANA_RPC_URL
  delete process.env.HELIUS_API_KEY

  globalThis.fetch = async () => new Response("provider unavailable", { status: 503 })

  const observation = await observeScamGuardV2({ type: "token", value: "mint-b", chain: "solana" })

  assert.equal(observation.evidence.tokensXyz?.status, "unavailable")
  assert.equal(observation.summary.decisionChanged, false)
  assert.equal(observation.proposedSignals.length, 0)
  assert.ok(observation.base)
})
