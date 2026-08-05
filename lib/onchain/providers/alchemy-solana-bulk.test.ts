import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import {
  enrichSolanaWalletsAlchemyHybrid,
  isAlchemySolanaHistoryConfigured,
} from "@/lib/onchain/providers/alchemy-solana-bulk"

const originalFetch = globalThis.fetch
const originalAlchemyKey = process.env.ALCHEMY_API_KEY
const originalHeliusKey = process.env.HELIUS_API_KEY
const originalRpcUrl = process.env.SOLANA_RPC_URL
const originalAlchemyRps = process.env.ALCHEMY_SOLANA_HISTORY_RPS
const originalHeliusRps = process.env.HELIUS_STATE_RPS
const originalConcurrency = process.env.ALCHEMY_SOLANA_WALLET_CONCURRENCY
const originalDeepLimit = process.env.SOLANA_DEEP_HISTORY_LIMIT

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalAlchemyKey === undefined) delete process.env.ALCHEMY_API_KEY
  else process.env.ALCHEMY_API_KEY = originalAlchemyKey
  if (originalHeliusKey === undefined) delete process.env.HELIUS_API_KEY
  else process.env.HELIUS_API_KEY = originalHeliusKey
  if (originalRpcUrl === undefined) delete process.env.SOLANA_RPC_URL
  else process.env.SOLANA_RPC_URL = originalRpcUrl
  if (originalAlchemyRps === undefined) delete process.env.ALCHEMY_SOLANA_HISTORY_RPS
  else process.env.ALCHEMY_SOLANA_HISTORY_RPS = originalAlchemyRps
  if (originalHeliusRps === undefined) delete process.env.HELIUS_STATE_RPS
  else process.env.HELIUS_STATE_RPS = originalHeliusRps
  if (originalConcurrency === undefined) {
    delete process.env.ALCHEMY_SOLANA_WALLET_CONCURRENCY
  } else {
    process.env.ALCHEMY_SOLANA_WALLET_CONCURRENCY = originalConcurrency
  }
  if (originalDeepLimit === undefined) delete process.env.SOLANA_DEEP_HISTORY_LIMIT
  else process.env.SOLANA_DEEP_HISTORY_LIMIT = originalDeepLimit
})

function transaction({
  signature,
  blockTime,
  source,
  destination,
}: {
  signature: string
  blockTime: number
  source?: string
  destination?: string
}) {
  return {
    signature,
    blockTime,
    transaction: {
      signatures: [signature],
      message: {
        accountKeys: [
          source ?? "Source111111111111111111111111111111111",
          destination ?? "22222222222222222222222222222222",
          "Program11111111111111111111111111111111",
        ],
        instructions:
          source && destination
            ? [
                {
                  program: "system",
                  programId: "11111111111111111111111111111111",
                  parsed: {
                    type: "transfer",
                    info: {
                      source,
                      destination,
                      lamports: 500_000_000,
                    },
                  },
                },
              ]
            : [],
      },
    },
    meta: {
      preBalances: [1_000_000_000, 0, 0],
      postBalances: [500_000_000, 500_000_000, 0],
      innerInstructions: [],
    },
  }
}

describe("Alchemy-first Solana enrichment", () => {
  it("uses Helius for batched account state and Alchemy for paginated history", async () => {
    process.env.ALCHEMY_API_KEY = "alchemy-test-key"
    process.env.HELIUS_API_KEY = "helius-test-key"
    delete process.env.SOLANA_RPC_URL
    process.env.ALCHEMY_SOLANA_HISTORY_RPS = "10"
    process.env.HELIUS_STATE_RPS = "9"
    process.env.ALCHEMY_SOLANA_WALLET_CONCURRENCY = "1"
    process.env.SOLANA_DEEP_HISTORY_LIMIT = "100"

    const wallet = "22222222222222222222222222222222"
    const funder = "33333333333333333333333333333333"
    const calls: Array<{ url: string; method: string; params: unknown[] }> = []
    let newestPage = 0

    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url = String(input)
      const body = JSON.parse(String(init?.body)) as {
        method: string
        params: unknown[]
      }
      calls.push({ url, method: body.method, params: body.params })

      if (body.method === "getMultipleAccounts") {
        assert.match(url, /helius-rpc/)
        return new Response(
          JSON.stringify({
            result: {
              value: [
                {
                  lamports: 1_500_000_000,
                  owner: "11111111111111111111111111111111",
                  executable: false,
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      assert.match(url, /solana-mainnet\.g\.alchemy\.com/)
      assert.equal(body.method, "getTransactionsForAddress")
      const options = body.params[1] as {
        sortOrder: string
        paginationToken?: string
      }

      if (options.sortOrder === "asc") {
        return new Response(
          JSON.stringify({
            result: {
              data: [
                transaction({
                  signature: "oldest",
                  blockTime: 100,
                  source: funder,
                  destination: wallet,
                }),
              ],
              paginationToken: null,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      newestPage += 1
      return new Response(
        JSON.stringify({
          result:
            newestPage === 1
              ? {
                  data: [transaction({ signature: "newest", blockTime: 300 })],
                  paginationToken: "page-2",
                }
              : {
                  data: [transaction({ signature: "middle", blockTime: 200 })],
                  paginationToken: null,
                },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }) as typeof fetch

    assert.equal(isAlchemySolanaHistoryConfigured(), true)
    const output = await enrichSolanaWalletsAlchemyHybrid({
      addresses: [wallet],
      options: { deepHistory: true },
    })
    const result = output.results.get(wallet)

    assert.equal(result?.status, "completed")
    assert.equal(result?.provider, "alchemy+helius-state")
    assert.equal(result?.data.nativeBalance, 1.5)
    assert.equal(result?.data.txCount, 3)
    assert.equal(result?.data.fundingSource, funder)
    assert.equal(result?.data.firstFundingAmount, 0.5)
    assert.equal(result?.data.historyTruncated, false)
    assert.equal(
      calls.filter((call) => call.method === "getMultipleAccounts").length,
      1
    )
    assert.equal(
      calls.filter((call) => call.method === "getTransactionsForAddress").length,
      3
    )
    assert.ok(
      calls
        .filter((call) => call.method === "getTransactionsForAddress")
        .every((call) => call.url.includes("alchemy"))
    )
  })

  it("recovers an Alchemy throughput response with backoff", async () => {
    process.env.ALCHEMY_API_KEY = "alchemy-test-key"
    delete process.env.HELIUS_API_KEY
    delete process.env.SOLANA_RPC_URL
    process.env.ALCHEMY_SOLANA_HISTORY_RPS = "10"
    process.env.ALCHEMY_SOLANA_WALLET_CONCURRENCY = "1"

    const wallet = "44444444444444444444444444444444"
    let historyAttempts = 0

    globalThis.fetch = (async (
      _input: string | URL | Request,
      init?: RequestInit
    ) => {
      const body = JSON.parse(String(init?.body)) as {
        method: string
        params: unknown[]
      }
      if (body.method === "getMultipleAccounts") {
        return new Response(
          JSON.stringify({
            result: {
              value: [
                {
                  lamports: 0,
                  owner: "11111111111111111111111111111111",
                  executable: false,
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      historyAttempts += 1
      if (historyAttempts === 1) {
        return new Response(
          JSON.stringify({ error: { code: -32005, message: "throughput exceeded" } }),
          {
            status: 429,
            headers: {
              "content-type": "application/json",
              "retry-after": "0",
            },
          }
        )
      }

      return new Response(
        JSON.stringify({ result: { data: [], paginationToken: null } }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }) as typeof fetch

    const output = await enrichSolanaWalletsAlchemyHybrid({
      addresses: [wallet],
      options: { deepHistory: false },
    })

    assert.equal(output.results.get(wallet)?.status, "completed")
    assert.ok(historyAttempts >= 3)
    assert.ok(output.rateLimitCount >= 1)
  })

  it("keeps a closed account with confirmed signature history out of automatic rejection", async () => {
    process.env.ALCHEMY_API_KEY = "alchemy-test-key"
    process.env.HELIUS_API_KEY = "helius-test-key"
    delete process.env.SOLANA_RPC_URL
    process.env.ALCHEMY_SOLANA_HISTORY_RPS = "10"
    process.env.HELIUS_STATE_RPS = "9"
    process.env.ALCHEMY_SOLANA_WALLET_CONCURRENCY = "1"

    const wallet = "ClosedHistory1111111111111111111111111111111"

    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url = String(input)
      const body = JSON.parse(String(init?.body)) as {
        method: string
      }

      if (body.method === "getMultipleAccounts") {
        return new Response(
          JSON.stringify({ result: { value: [null] } }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      if (body.method === "getTransactionsForAddress") {
        assert.match(url, /alchemy/)
        return new Response(
          JSON.stringify({ result: { data: [], paginationToken: null } }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      assert.equal(body.method, "getSignaturesForAddress")
      assert.match(url, /helius-rpc/)
      return new Response(
        JSON.stringify({ result: [{ signature: "confirmed-history" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }) as typeof fetch

    const output = await enrichSolanaWalletsAlchemyHybrid({
      addresses: [wallet],
      options: { deepHistory: false },
    })
    const result = output.results.get(wallet)
    const rawData = result?.data.rawData as
      | { historicalSignatureObserved?: boolean }
      | undefined

    assert.equal(result?.status, "completed")
    assert.equal(result?.data.accountType, "historical_unresolved_account")
    assert.equal(rawData?.historicalSignatureObserved, true)
    assert.ok(
      output.warnings.some((warning) => warning.includes("Historical signatures were confirmed"))
    )
  })
})
