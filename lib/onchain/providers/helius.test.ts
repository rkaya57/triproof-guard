import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import { RateLimitError } from "@/lib/onchain/rate-limit"
import { getSolanaRpcUrls, solanaRpc } from "./helius"

const originalFetch = globalThis.fetch
const originalRpcUrl = process.env.SOLANA_RPC_URL
const originalFallbackUrls = process.env.SOLANA_RPC_FALLBACK_URLS
const originalHeliusKey = process.env.HELIUS_API_KEY

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalRpcUrl === undefined) delete process.env.SOLANA_RPC_URL
  else process.env.SOLANA_RPC_URL = originalRpcUrl
  if (originalFallbackUrls === undefined) delete process.env.SOLANA_RPC_FALLBACK_URLS
  else process.env.SOLANA_RPC_FALLBACK_URLS = originalFallbackUrls
  if (originalHeliusKey === undefined) delete process.env.HELIUS_API_KEY
  else process.env.HELIUS_API_KEY = originalHeliusKey
})

describe("Solana RPC resilience", () => {
  it("uses configured fallback RPC URLs after a rate limit response", async () => {
    process.env.SOLANA_RPC_URL = "https://primary.rpc.example"
    process.env.SOLANA_RPC_FALLBACK_URLS = "https://fallback.rpc.example"
    delete process.env.HELIUS_API_KEY

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

  it("exposes all configured RPC endpoints without duplicates", () => {
    process.env.SOLANA_RPC_URL = "https://primary.rpc.example"
    process.env.SOLANA_RPC_FALLBACK_URLS = "https://primary.rpc.example, https://fallback.rpc.example"
    delete process.env.HELIUS_API_KEY

    assert.deepEqual(getSolanaRpcUrls(), ["https://primary.rpc.example", "https://fallback.rpc.example"])
  })

  it("surfaces rate limiting as a typed error when every endpoint is exhausted", async () => {
    process.env.SOLANA_RPC_URL = "https://primary.rpc.example"
    delete process.env.SOLANA_RPC_FALLBACK_URLS
    delete process.env.HELIUS_API_KEY
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { code: -32005, message: "too many requests" } }), {
        status: 429,
        headers: { "content-type": "application/json" },
      })) as typeof fetch

    await assert.rejects(() => solanaRpc("getBalance", ["wallet"]), RateLimitError)
  })
})
