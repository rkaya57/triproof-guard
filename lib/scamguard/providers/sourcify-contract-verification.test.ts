import assert from "node:assert/strict"
import test from "node:test"

import {
  inspectSourcifyContractVerification,
  resetSourcifyContractVerificationForTests,
} from "./sourcify-contract-verification"

const address = "0x1111111111111111111111111111111111111111"

async function withMockedProvider(
  rpcCode: string,
  sourcifyResponse: Response | null,
  run: () => Promise<void>,
) {
  const originalFetch = global.fetch
  const originalRpc = process.env.EVM_RPC_URL
  process.env.EVM_RPC_URL = "https://rpc.fixture.invalid"
  resetSourcifyContractVerificationForTests()
  global.fetch = async (input) => {
    const url = String(input)
    if (url === "https://rpc.fixture.invalid") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: rpcCode }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    if (url.startsWith("https://sourcify.dev/server/v2/contract/1/")) {
      if (!sourcifyResponse) throw new Error("Sourcify should not be queried for an EOA")
      return sourcifyResponse
    }
    throw new Error(`Unexpected fetch target: ${url}`)
  }
  try {
    await run()
  } finally {
    global.fetch = originalFetch
    if (originalRpc === undefined) delete process.env.EVM_RPC_URL
    else process.env.EVM_RPC_URL = originalRpc
    resetSourcifyContractVerificationForTests()
  }
}

test("does not treat Sourcify absence as evidence for an EOA", async () => {
  await withMockedProvider("0x", null, async () => {
    const result = await inspectSourcifyContractVerification(address)
    assert.equal(result.status, "available")
    assert.equal(result.isContract, false)
    assert.equal(result.verifiedBySourcify, undefined)
  })
})

test("reports a Sourcify-verified contract without verification-absence evidence", async () => {
  await withMockedProvider(
    "0x6001600055",
    new Response(JSON.stringify({ match: "match" }), { status: 200, headers: { "content-type": "application/json" } }),
    async () => {
      const result = await inspectSourcifyContractVerification(address)
      assert.equal(result.status, "available")
      assert.equal(result.isContract, true)
      assert.equal(result.verifiedBySourcify, true)
      assert.equal(result.match, "match")
    },
  )
})

test("reports verification absence only when RPC confirms contract bytecode and Sourcify returns 404", async () => {
  await withMockedProvider(
    "0x6001600055",
    new Response("not found", { status: 404 }),
    async () => {
      const result = await inspectSourcifyContractVerification(address)
      assert.equal(result.status, "available")
      assert.equal(result.isContract, true)
      assert.equal(result.verifiedBySourcify, false)
      assert.match(result.note, /weak contract-integrity context/i)
    },
  )
})
