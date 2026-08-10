import assert from "node:assert/strict"
import test from "node:test"

import { inspectSolanaDistributionRpc, resetSolanaDistributionRpcCacheForTests } from "./solana-distribution-rpc"

const originalFetch = globalThis.fetch
const originalRpc = process.env.SOLANA_RPC_URL
const originalHelius = process.env.HELIUS_API_KEY
const mint = "So11111111111111111111111111111111111111112"

function restore() {
  globalThis.fetch = originalFetch
  if (originalRpc === undefined) delete process.env.SOLANA_RPC_URL
  else process.env.SOLANA_RPC_URL = originalRpc
  if (originalHelius === undefined) delete process.env.HELIUS_API_KEY
  else process.env.HELIUS_API_KEY = originalHelius
  resetSolanaDistributionRpcCacheForTests()
}

test.afterEach(restore)

test("distribution provider is disabled when Solana RPC is not configured", async () => {
  delete process.env.SOLANA_RPC_URL
  delete process.env.HELIUS_API_KEY
  const evidence = await inspectSolanaDistributionRpc(mint)
  assert.equal(evidence.status, "disabled")
})

test("distribution provider computes largest and top-10 token-account concentration safely", async () => {
  process.env.SOLANA_RPC_URL = "https://rpc.example"

  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string }
    if (body.method === "getTokenSupply") {
      return new Response(JSON.stringify({ result: { value: { amount: "1000000", decimals: 6 } } }), { status: 200 })
    }
    if (body.method === "getTokenLargestAccounts") {
      return new Response(JSON.stringify({
        result: {
          value: [
            { address: "A", amount: "400000" },
            { address: "B", amount: "200000" },
            { address: "C", amount: "100000" },
            { address: "D", amount: "50000" },
          ],
        },
      }), { status: 200 })
    }
    return new Response(JSON.stringify({ error: { message: "unexpected method" } }), { status: 400 })
  }

  const evidence = await inspectSolanaDistributionRpc(mint)
  assert.equal(evidence.status, "available")
  assert.equal(evidence.supplyRaw, "1000000")
  assert.equal(evidence.largestAccountPercent, 40)
  assert.equal(evidence.top10AccountPercent, 75)
  assert.equal(evidence.sampledAccounts, 4)
})

test("distribution provider handles very large integer supplies without precision overflow", async () => {
  process.env.SOLANA_RPC_URL = "https://rpc.example"
  const supply = "1000000000000000000000000000000"
  const largest = "500000000000000000000000000000"

  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string }
    if (body.method === "getTokenSupply") {
      return new Response(JSON.stringify({ result: { value: { amount: supply, decimals: 9 } } }), { status: 200 })
    }
    return new Response(JSON.stringify({ result: { value: [{ address: "A", amount: largest }] } }), { status: 200 })
  }

  const evidence = await inspectSolanaDistributionRpc(mint)
  assert.equal(evidence.status, "available")
  assert.equal(evidence.largestAccountPercent, 50)
  assert.equal(evidence.top10AccountPercent, 50)
})

test("distribution provider fails closed to unavailable evidence on RPC errors", async () => {
  process.env.SOLANA_RPC_URL = "https://rpc.example"
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 })

  const evidence = await inspectSolanaDistributionRpc(mint)
  assert.equal(evidence.status, "unavailable")
  assert.match(evidence.error ?? "", /rate limited/)
})
