import assert from "node:assert/strict"
import test from "node:test"

import {
  extractEvmAddresses,
  inspectEvmPublicThreatCorpus,
  resetEvmPublicThreatCorpusCacheForTests,
} from "./evm-public-threat-corpus"

const originalFetch = globalThis.fetch
const originalEnabled = process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED

function restore() {
  globalThis.fetch = originalFetch
  if (originalEnabled === undefined) delete process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED
  else process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED = originalEnabled
  resetEvmPublicThreatCorpusCacheForTests()
}

test.afterEach(restore)

test("extracts normalized EVM addresses from CSV and TSV-style text", () => {
  const values = extractEvmAddresses("row,0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD\nfoo\t0x1111111111111111111111111111111111111111")
  assert.equal(values.has("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"), true)
  assert.equal(values.has("0x1111111111111111111111111111111111111111"), true)
})

test("reports one-source and two-source matches without manufacturing duplicates", async () => {
  process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED = "true"
  const shared = "0x2222222222222222222222222222222222222222"
  const realCatsOnly = "0x3333333333333333333333333333333333333333"
  let calls = 0
  globalThis.fetch = async (input) => {
    calls += 1
    const url = String(input)
    if (url.includes("Real-CATS")) return new Response(`${shared}\n${realCatsOnly}\n`, { status: 200 })
    return new Response(`Address\n${shared}\n`, { status: 200 })
  }

  const sharedResult = await inspectEvmPublicThreatCorpus(shared)
  const singleResult = await inspectEvmPublicThreatCorpus(realCatsOnly)

  assert.equal(sharedResult.status, "available")
  assert.equal(sharedResult.matched, true)
  assert.equal(sharedResult.independentSourceCount, 2)
  assert.deepEqual(sharedResult.matchedSources.sort(), ["real-cats", "rug-pull-dataset"])
  assert.equal(singleResult.independentSourceCount, 1)
  assert.deepEqual(singleResult.matchedSources, ["real-cats"])
  assert.equal(calls, 2, "second lookup should reuse the bounded cache")
})

test("provider degrades safely if all upstream corpora fail", async () => {
  process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED = "true"
  globalThis.fetch = async () => new Response("upstream error", { status: 503 })
  const result = await inspectEvmPublicThreatCorpus("0x4444444444444444444444444444444444444444")
  assert.equal(result.status, "unavailable")
  assert.equal(result.matched, false)
  assert.match(result.error ?? "", /unavailable/i)
})

test("provider can be disabled without network access", async () => {
  process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED = "false"
  let called = false
  globalThis.fetch = async () => {
    called = true
    return new Response("", { status: 200 })
  }
  const result = await inspectEvmPublicThreatCorpus("0x5555555555555555555555555555555555555555")
  assert.equal(result.status, "disabled")
  assert.equal(called, false)
})
