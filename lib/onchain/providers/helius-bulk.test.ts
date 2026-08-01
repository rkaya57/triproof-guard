import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { enrichSolanaWalletsBulk } from "@/lib/onchain/providers/helius-bulk"

const walletA = "7VY6qgYEbPZ3H9WQeM3tK4pA8cJ2nF5xR6sT1uB9dLkM"
const walletB = "8WZ7rhZFcaA4J1XRfN4uL5qB9dK3oG6yS7tU2vC1eMnP"
const funder = "9Xa8siAGdbB5K2YSgP5vM6rC1eL4pH7zT8uV3wD2fNoQ"

function transaction(wallet: string, signature: string, blockTime: number) {
  return {
    signature,
    blockTime,
    meta: {
      preBalances: [2_000_000_000, 0],
      postBalances: [1_000_000_000, 1_000_000_000],
      innerInstructions: [],
    },
    transaction: {
      signatures: [signature],
      message: {
        accountKeys: [funder, wallet],
        instructions: [
          {
            program: "system",
            programId: "11111111111111111111111111111111",
            parsed: {
              type: "transfer",
              info: {
                source: funder,
                destination: wallet,
                lamports: 1_000_000_000,
              },
            },
          },
        ],
      },
    },
  }
}

describe("Helius high-volume screening", () => {
  it("uses batched account reads and bounded oldest/newest real transaction requests", async () => {
    const originalFetch = globalThis.fetch
    const originalApiKey = process.env.HELIUS_API_KEY
    const originalRps = process.env.HELIUS_BULK_RPC_RPS
    const originalConcurrency = process.env.HELIUS_BULK_CONCURRENCY
    const calls: Array<{ method: string; params: unknown[] }> = []

    process.env.HELIUS_API_KEY = "test-key"
    process.env.HELIUS_BULK_RPC_RPS = "1000"
    process.env.HELIUS_BULK_CONCURRENCY = "8"

    globalThis.fetch = async (_input, init) => {
      const payload = JSON.parse(String(init?.body)) as {
        method: string
        params: unknown[]
      }
      calls.push(payload)

      if (payload.method === "getMultipleAccounts") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "1",
            result: {
              value: [
                {
                  lamports: 2_000_000_000,
                  owner: "11111111111111111111111111111111",
                  executable: false,
                },
                {
                  lamports: 3_000_000_000,
                  owner: "11111111111111111111111111111111",
                  executable: false,
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      const address = String(payload.params[0])
      const options = payload.params[1] as { sortOrder?: string; limit?: number }
      const isOldest = options.sortOrder === "asc"
      const tx = transaction(
        address,
        `${isOldest ? "old" : "new"}-${address}`,
        isOldest ? 1_700_000_000 : 1_750_000_000
      )
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          result: { data: [tx], paginationToken: null },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    try {
      const output = await enrichSolanaWalletsBulk({
        addresses: [walletA, walletB],
      })

      assert.equal(output.results.size, 2)
      assert.equal(output.results.get(walletA)?.status, "completed")
      assert.equal(output.results.get(walletA)?.data.accountType, "system_user_wallet")
      assert.equal(output.results.get(walletA)?.data.fundingSource, funder)
      assert.equal(output.results.get(walletA)?.data.nativeBalance, 2)
      assert.equal(output.results.get(walletB)?.data.nativeBalance, 3)
      assert.equal(output.results.get(walletA)?.data.historyTruncated, false)
      assert.equal(output.results.get(walletA)?.data.txCount, 2)

      const accountCalls = calls.filter((call) => call.method === "getMultipleAccounts")
      const historyCalls = calls.filter(
        (call) => call.method === "getTransactionsForAddress"
      )
      assert.equal(accountCalls.length, 1)
      assert.equal(historyCalls.length, 5)
      assert.ok(
        historyCalls.some(
          (call) =>
            (call.params[1] as { sortOrder?: string }).sortOrder === "asc"
        )
      )
      assert.ok(
        historyCalls.some(
          (call) =>
            (call.params[1] as { sortOrder?: string }).sortOrder === "desc"
        )
      )
    } finally {
      globalThis.fetch = originalFetch
      if (originalApiKey === undefined) delete process.env.HELIUS_API_KEY
      else process.env.HELIUS_API_KEY = originalApiKey
      if (originalRps === undefined) delete process.env.HELIUS_BULK_RPC_RPS
      else process.env.HELIUS_BULK_RPC_RPS = originalRps
      if (originalConcurrency === undefined) delete process.env.HELIUS_BULK_CONCURRENCY
      else process.env.HELIUS_BULK_CONCURRENCY = originalConcurrency
    }
  })
})
