import assert from "node:assert/strict"
import test from "node:test"

import { inspectToken2022Rpc, resetToken2022RpcCacheForTests } from "./token-2022-rpc"

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
  resetToken2022RpcCacheForTests()
}

test.afterEach(restore)

test("returns disabled evidence without a configured Solana RPC", async () => {
  delete process.env.SOLANA_RPC_URL
  delete process.env.HELIUS_API_KEY
  const evidence = await inspectToken2022Rpc(mint)
  assert.equal(evidence.status, "disabled")
})

test("detects Token-2022 and classifies parsed extensions", async () => {
  process.env.SOLANA_RPC_URL = "https://rpc.example"
  globalThis.fetch = async () => new Response(JSON.stringify({
    jsonrpc: "2.0",
    id: "test",
    result: {
      value: {
        owner: "TokenzQdBNbLqP5VEhdkAS6EPF1SMH1dbKqP6Xk6mN",
        data: {
          program: "spl-token-2022",
          parsed: {
            type: "mint",
            info: {
              extensions: [
                { extension: "PermanentDelegate" },
                { extension: "TransferHook" },
              ],
            },
          },
        },
      },
    },
  }), { status: 200 })

  const evidence = await inspectToken2022Rpc(mint)

  assert.equal(evidence.status, "available")
  assert.equal(evidence.isToken2022, true)
  assert.equal(evidence.inspection?.highestSeverity, "high")
  assert.equal(evidence.inspection?.controlSurfaceCount, 2)
})

test("standard SPL tokens remain available evidence without Token-2022 findings", async () => {
  process.env.SOLANA_RPC_URL = "https://rpc.example"
  globalThis.fetch = async () => new Response(JSON.stringify({
    result: {
      value: {
        owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        data: { program: "spl-token", parsed: { type: "mint", info: {} } },
      },
    },
  }), { status: 200 })

  const evidence = await inspectToken2022Rpc(mint)
  assert.equal(evidence.status, "available")
  assert.equal(evidence.isToken2022, false)
  assert.equal(evidence.inspection, undefined)
})

test("RPC failures degrade to unavailable evidence and do not throw", async () => {
  process.env.SOLANA_RPC_URL = "https://rpc.example"
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "upstream unavailable" } }), { status: 503 })

  const evidence = await inspectToken2022Rpc(mint)
  assert.equal(evidence.status, "unavailable")
  assert.match(evidence.error ?? "", /upstream unavailable/)
})
