import assert from "node:assert/strict"
import test from "node:test"

import { inspectTokensXyzAsset, resetTokensXyzCacheForTests, resolveTokensXyzReference } from "./tokens-xyz"

const originalFetch = globalThis.fetch
const originalApiKey = process.env.TOKENS_XYZ_API_KEY
const originalApiUrl = process.env.TOKENS_XYZ_API_URL

function restoreEnv() {
  if (originalApiKey === undefined) delete process.env.TOKENS_XYZ_API_KEY
  else process.env.TOKENS_XYZ_API_KEY = originalApiKey
  if (originalApiUrl === undefined) delete process.env.TOKENS_XYZ_API_URL
  else process.env.TOKENS_XYZ_API_URL = originalApiUrl
  globalThis.fetch = originalFetch
  resetTokensXyzCacheForTests()
}

test.afterEach(restoreEnv)

test("Tokens.xyz adapter is disabled cleanly without a server-side API key", async () => {
  delete process.env.TOKENS_XYZ_API_KEY
  const result = await inspectTokensXyzAsset("So11111111111111111111111111111111111111112")
  assert.equal(result.status, "disabled")
  assert.equal(result.source, "tokens.xyz")
})

test("Tokens.xyz adapter merges canonical, risk, and market evidence", async () => {
  process.env.TOKENS_XYZ_API_KEY = "test-key"
  process.env.TOKENS_XYZ_API_URL = "https://tokens.example/v1"

  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes("/assets/resolve")) {
      return new Response(JSON.stringify({
        assetId: "usd",
        resolvedBy: "mint",
        mint: "mint-a",
        asset: { assetId: "usd", name: "US Dollar", symbol: "USD", category: "currency" },
        variant: { mint: "mint-a", chain: "solana", kind: "stablecoin", trustTier: "tier1" },
      }), { status: 200 })
    }
    if (url.includes("/assets/risk-summary")) {
      return new Response(JSON.stringify({ score: 92, grade: "A", label: "Strong", hasInsufficientData: false }), { status: 200 })
    }
    return new Response(JSON.stringify({
      rows: [{ mint: "mint-a", market: { symbol: "USDC", liquidity: 5000000, volume24hUSD: 2000000, marketCap: 50000000000, holder: 1000000 } }],
    }), { status: 200 })
  }

  const result = await inspectTokensXyzAsset("mint-a")
  assert.equal(result.status, "available")
  assert.equal(result.canonical?.assetId, "usd")
  assert.equal(result.canonical?.trustTier, "tier1")
  assert.equal(result.risk?.grade, "A")
  assert.equal(result.market?.liquidity, 5000000)
  assert.equal(result.market?.holder, 1000000)
})

test("Tokens.xyz reference resolver maps a claimed brand to canonical identity", async () => {
  process.env.TOKENS_XYZ_API_KEY = "test-key"
  process.env.TOKENS_XYZ_API_URL = "https://tokens.example/v1"
  globalThis.fetch = async (input) => {
    const url = String(input)
    assert.match(url, /\/assets\/resolve\?ref=USDC/)
    return new Response(JSON.stringify({
      assetId: "usd",
      resolvedBy: "alias",
      asset: { assetId: "usd", name: "US Dollar", symbol: "USD" },
      variant: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
    }), { status: 200 })
  }

  const result = await resolveTokensXyzReference("USDC")
  assert.equal(result.status, "available")
  assert.equal(result.assetId, "usd")
  assert.equal(result.mint, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
})

test("Tokens.xyz adapter degrades to unavailable instead of throwing", async () => {
  process.env.TOKENS_XYZ_API_KEY = "test-key"
  process.env.TOKENS_XYZ_API_URL = "https://tokens.example/v1"
  globalThis.fetch = async () => new Response("provider error", { status: 503 })

  const result = await inspectTokensXyzAsset("mint-b")
  assert.equal(result.status, "unavailable")
  assert.match(result.error ?? "", /HTTP 503/)
})
