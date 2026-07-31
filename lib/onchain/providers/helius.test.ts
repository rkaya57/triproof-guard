import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import { RateLimitError } from "@/lib/onchain/rate-limit"
import { getSolanaRpcUrls, getSolanaSignatureHistory, heliusProvider, solanaRpc } from "./helius"

const originalFetch = globalThis.fetch
const originalRpcUrl = process.env.SOLANA_RPC_URL
const originalFallbackUrls = process.env.SOLANA_RPC_FALLBACK_URLS
const originalHeliusKey = process.env.HELIUS_API_KEY
const originalAlchemyKey = process.env.ALCHEMY_API_KEY
const originalSampleLimit = process.env.SOLANA_SIGNATURE_SAMPLE_LIMIT
const originalDeepLimit = process.env.SOLANA_DEEP_HISTORY_LIMIT
const originalTransactionLimit = process.env.SOLANA_TRANSACTION_SAMPLE_LIMIT
const originalRpcInterval = process.env.SOLANA_RPC_MIN_INTERVAL_MS

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalRpcUrl === undefined) delete process.env.SOLANA_RPC_URL
  else process.env.SOLANA_RPC_URL = originalRpcUrl
  if (originalFallbackUrls === undefined) delete process.env.SOLANA_RPC_FALLBACK_URLS
  else process.env.SOLANA_RPC_FALLBACK_URLS = originalFallbackUrls
  if (originalHeliusKey === undefined) delete process.env.HELIUS_API_KEY
  else process.env.HELIUS_API_KEY = originalHeliusKey
  if (originalAlchemyKey === undefined) delete process.env.ALCHEMY_API_KEY
  else process.env.ALCHEMY_API_KEY = originalAlchemyKey
  if (originalSampleLimit === undefined) delete process.env.SOLANA_SIGNATURE_SAMPLE_LIMIT
  else process.env.SOLANA_SIGNATURE_SAMPLE_LIMIT = originalSampleLimit
  if (originalDeepLimit === undefined) delete process.env.SOLANA_DEEP_HISTORY_LIMIT
  else process.env.SOLANA_DEEP_HISTORY_LIMIT = originalDeepLimit
  if (originalTransactionLimit === undefined) delete process.env.SOLANA_TRANSACTION_SAMPLE_LIMIT
  else process.env.SOLANA_TRANSACTION_SAMPLE_LIMIT = originalTransactionLimit
  if (originalRpcInterval === undefined) delete process.env.SOLANA_RPC_MIN_INTERVAL_MS
  else process.env.SOLANA_RPC_MIN_INTERVAL_MS = originalRpcInterval
})

describe("Solana RPC resilience", () => {
  it("uses configured fallback RPC URLs after a rate limit response", async () => {
    process.env.SOLANA_RPC_URL = "https://primary.rpc.example"
    process.env.SOLANA_RPC_FALLBACK_URLS = "https://fallback.rpc.example"
    delete process.env.HELIUS_API_KEY
    delete process.env.ALCHEMY_API_KEY

    const calls: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      if (url.includes("primary")) {
        return new Response(JSON.stringify({ error: { code: -32005, message: "rate limit" } }), {
          status: 429,
          headers: { "content-type": "application/json" },
        })
      }
      return new Response(JSON.stringify({ result: { value: 7 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }) as typeof fetch

    const result = await solanaRpc<{ value: number }>("getBalance", ["wallet"])

    assert.equal(result.value, 7)
    assert.deepEqual(calls, ["https://primary.rpc.example", "https://fallback.rpc.example"])
  })

  it("automatically uses an Alchemy Solana endpoint after Helius is rate limited", async () => {
    process.env.SOLANA_RPC_URL = "https://helius.rpc.example"
    process.env.HELIUS_API_KEY = "helius-key"
    process.env.ALCHEMY_API_KEY = "alchemy-key"
    delete process.env.SOLANA_RPC_FALLBACK_URLS

    const calls: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      if (url.includes("helius")) {
        return new Response(JSON.stringify({ error: { code: -32005, message: "rate limit" } }), {
          status: 429,
          headers: { "content-type": "application/json" },
        })
      }
      return new Response(JSON.stringify({ result: { value: 9 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }) as typeof fetch

    const result = await solanaRpc<{ value: number }>("getBalance", ["wallet"])

    assert.equal(result.value, 9)
    assert.ok(calls.some((url) => url.includes("solana-mainnet.g.alchemy.com")))
  })

  it("keeps a rate-limited endpoint on cooldown while a healthy fallback is available", async () => {
    process.env.SOLANA_RPC_URL = "https://cooldown-primary.rpc.example"
    process.env.SOLANA_RPC_FALLBACK_URLS = "https://cooldown-fallback.rpc.example"
    delete process.env.HELIUS_API_KEY
    delete process.env.ALCHEMY_API_KEY

    const calls: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      if (url.includes("primary")) {
        return new Response(JSON.stringify({ error: { code: -32005, message: "rate limit" } }), {
          status: 429,
          headers: { "content-type": "application/json" },
        })
      }
      return new Response(JSON.stringify({ result: { value: 3 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }) as typeof fetch

    await solanaRpc<{ value: number }>("getBalance", ["wallet-one"])
    await solanaRpc<{ value: number }>("getBalance", ["wallet-two"])

    assert.deepEqual(calls, [
      "https://cooldown-primary.rpc.example",
      "https://cooldown-fallback.rpc.example",
      "https://cooldown-fallback.rpc.example",
    ])
  })

  it("exposes all configured RPC endpoints without duplicates", () => {
    process.env.SOLANA_RPC_URL = "https://primary.rpc.example"
    process.env.SOLANA_RPC_FALLBACK_URLS = "https://primary.rpc.example, https://fallback.rpc.example"
    delete process.env.HELIUS_API_KEY
    delete process.env.ALCHEMY_API_KEY

    assert.deepEqual(getSolanaRpcUrls(), ["https://primary.rpc.example", "https://fallback.rpc.example"])
  })

  it("surfaces rate limiting as a typed error when every endpoint is exhausted", async () => {
    process.env.SOLANA_RPC_URL = "https://primary.rpc.example"
    delete process.env.SOLANA_RPC_FALLBACK_URLS
    delete process.env.HELIUS_API_KEY
    delete process.env.ALCHEMY_API_KEY
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { code: -32005, message: "too many requests" } }), {
        status: 429,
        headers: { "content-type": "application/json" },
      })) as typeof fetch

    await assert.rejects(() => solanaRpc("getBalance", ["wallet"]), RateLimitError)
  })

  it("uses the bounded deep-history signature window only when requested", async () => {
    process.env.SOLANA_RPC_URL = "https://primary.rpc.example"
    process.env.SOLANA_SIGNATURE_SAMPLE_LIMIT = "2"
    process.env.SOLANA_DEEP_HISTORY_LIMIT = "3"
    delete process.env.HELIUS_API_KEY
    delete process.env.ALCHEMY_API_KEY

    const requests: Array<{ method: string; params: unknown[] }> = []
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)) as { method: string; params: unknown[] })
      return new Response(
        JSON.stringify({
          result: [
            { signature: "sig-3", blockTime: 3 },
            { signature: "sig-2", blockTime: 2 },
            { signature: "sig-1", blockTime: 1 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }) as typeof fetch

    const history = await getSolanaSignatureHistory("wallet", true)

    assert.equal(history.targetLimit, 3)
    assert.equal(history.signatures.length, 3)
    assert.equal(history.historyTruncated, true)
    assert.equal((requests[0]?.params[1] as { limit: number }).limit, 3)
  })

  it("does not manufacture behavior risk when transaction details are unavailable", async () => {
    process.env.SOLANA_RPC_URL = "https://coverage.rpc.example"
    process.env.SOLANA_TRANSACTION_SAMPLE_LIMIT = "4"
    process.env.SOLANA_RPC_MIN_INTERVAL_MS = "1"
    delete process.env.SOLANA_RPC_FALLBACK_URLS
    delete process.env.HELIUS_API_KEY
    delete process.env.ALCHEMY_API_KEY

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string; params: unknown[] }
      let result: unknown

      if (request.method === "getBalance") result = { value: 1_000_000_000 }
      else if (request.method === "getSignaturesForAddress") {
        result = [
          { signature: "sig-4", blockTime: 400 },
          { signature: "sig-3", blockTime: 300 },
          { signature: "sig-2", blockTime: 200 },
          { signature: "sig-1", blockTime: 100 },
        ]
      } else if (request.method === "getTokenAccountsByOwner") {
        const filter = request.params[1] as { programId?: string }
        if (filter.programId?.startsWith("TokenzQd")) {
          return new Response(JSON.stringify({ error: { code: -32000, message: "unavailable" } }), {
            status: 503,
            headers: { "content-type": "application/json" },
          })
        }
        result = { value: [] }
      }
      else if (request.method === "getAccountInfo") {
        result = {
          value: {
            executable: false,
            owner: "11111111111111111111111111111111",
            lamports: 1_000_000_000,
          },
        }
      } else if (request.method === "getTransaction") result = null
      else throw new Error(`Unexpected RPC method: ${request.method}`)

      return new Response(JSON.stringify({ result }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }) as typeof fetch

    const enriched = await heliusProvider.enrichWallet(
      "22222222222222222222222222222222",
      "Solana"
    )
    const rawData = enriched.rawData as Record<string, unknown>

    assert.equal(enriched.accountType, "system_user_wallet")
    assert.equal(enriched.tokenCount, null)
    assert.equal(enriched.contractsCount, null)
    assert.equal(enriched.uniqueCounterparties, null)
    assert.equal(enriched.totalVolume, null)
    assert.equal(enriched.behaviorDiversityScore, null)
    assert.equal(enriched.botScriptScore, null)
    assert.equal(enriched.campaignQualityScore, null)
    assert.equal(rawData.behaviorSampleReliable, false)
    assert.equal(rawData.sampledTransactionsRequested, 4)
    assert.equal(rawData.sampledTransactionsResolved, 0)
  })

  it("distinguishes historical activity from a currently missing account and counts Token-2022", async () => {
    process.env.SOLANA_RPC_URL = "https://historical.rpc.example"
    process.env.SOLANA_TRANSACTION_SAMPLE_LIMIT = "1"
    process.env.SOLANA_RPC_MIN_INTERVAL_MS = "1"
    delete process.env.SOLANA_RPC_FALLBACK_URLS
    delete process.env.HELIUS_API_KEY
    delete process.env.ALCHEMY_API_KEY

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string; params: unknown[] }
      let result: unknown

      if (request.method === "getBalance") result = { value: 0 }
      else if (request.method === "getSignaturesForAddress") {
        result = [{ signature: "historical-sig", blockTime: 100 }]
      } else if (request.method === "getTokenAccountsByOwner") {
        const filter = request.params[1] as { programId?: string }
        result = filter.programId?.startsWith("TokenzQd")
          ? {
              value: [
                {
                  pubkey: "token-2022-account",
                  account: { data: { parsed: { info: { tokenAmount: { uiAmount: 1 } } } } },
                },
              ],
            }
          : { value: [] }
      } else if (request.method === "getAccountInfo") result = { value: null }
      else if (request.method === "getTransaction") result = null
      else throw new Error(`Unexpected RPC method: ${request.method}`)

      return new Response(JSON.stringify({ result }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }) as typeof fetch

    const enriched = await heliusProvider.enrichWallet(
      "33333333333333333333333333333333",
      "Solana"
    )

    assert.equal(enriched.accountType, "historical_unresolved_account")
    assert.equal(enriched.txCount, 1)
    assert.equal(enriched.tokenCount, 1)
    assert.equal(enriched.botScriptScore, null)
  })
})
