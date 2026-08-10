import assert from "node:assert/strict"
import test from "node:test"

import {
  inspectEvmPublicThreatCorpus,
  parseMewDarklistAddresses,
  parseRealCatsCriminalAddresses,
  parseValidatedEthereumRugPullAddresses,
  resetEvmPublicThreatCorpusCacheForTests,
} from "./evm-public-threat-corpus"

const originalFetch = globalThis.fetch
const originalEnabled = process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED

function restore() {
  globalThis.fetch = originalFetch
  if (originalEnabled === undefined) delete process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED
  else process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED = originalEnabled
  delete process.env.EVM_REAL_CATS_FEED_URL
  resetEvmPublicThreatCorpusCacheForTests()
}

test.afterEach(restore)

test("Real-CATS parser includes malicious labels and excludes neutral labels", () => {
  const malicious = "0x1111111111111111111111111111111111111111"
  const neutral = "0x2222222222222222222222222222222222222222"
  const metamorphic = "0x3333333333333333333333333333333333333333"
  const values = parseRealCatsCriminalAddresses([
    "address\tlabel\tbalance",
    `${malicious}\tHack Scam\t0`,
    `${neutral}\tOther\t0`,
    `${metamorphic}\tMetamorphic Contract\t0`,
  ].join("\n"))
  assert.equal(values.has(malicious), true)
  assert.equal(values.has(neutral), false)
  assert.equal(values.has(metamorphic), false)
})

test("rug-pull parser only imports the validated ETH address column", () => {
  const eth = "0x4444444444444444444444444444444444444444"
  const bsc = "0x5555555555555555555555555555555555555555"
  const unrelated = "0x6666666666666666666666666666666666666666"
  const values = parseValidatedEthereumRugPullAddresses([
    "No.,Chain,address,Losses,Type,Root Causes,Sources,URL",
    `1,ETH,${eth},Unknown,Combination,Combination,Source,https://example.com/${unrelated}`,
    `2,BSC,${bsc},Unknown,Combination,Combination,Source,https://example.com`,
  ].join("\n"))
  assert.equal(values.has(eth), true)
  assert.equal(values.has(bsc), false)
  assert.equal(values.has(unrelated), false)
})

test("MyEtherWallet darklist parser imports only valid EVM addresses", () => {
  const valid = "0x7777777777777777777777777777777777777777"
  const values = parseMewDarklistAddresses(JSON.stringify([
    { address: valid, comment: "phishing" },
    { address: "not-an-address", comment: "invalid" },
    { comment: "missing" },
  ]))
  assert.equal(values.has(valid), true)
  assert.equal(values.size, 1)
  assert.equal(parseMewDarklistAddresses("not-json").size, 0)
})

test("default Real-CATS feed targets the repository master branch", async () => {
  process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED = "true"
  const seenUrls: string[] = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    seenUrls.push(url)
    if (url.includes("Real-CATS")) return new Response("address\tlabel\n", { status: 200 })
    if (url.includes("rugpull")) return new Response("No.,Chain,address,Losses,Type,Root Causes,Sources,URL\n", { status: 200 })
    return new Response("[]", { status: 200 })
  }
  await inspectEvmPublicThreatCorpus("0x8888888888888888888888888888888888888888")
  assert.ok(seenUrls.includes("https://raw.githubusercontent.com/sjdseu/Real-CATS/master/CE.tsv"))
  assert.ok(!seenUrls.some((url) => url.includes("Real-CATS/main/CE.tsv")))
})

test("reports independent matches across three separately maintained corpora", async () => {
  process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED = "true"
  const shared = "0x8888888888888888888888888888888888888888"
  const realCatsOnly = "0x9999999999999999999999999999999999999999"
  let calls = 0
  globalThis.fetch = async (input) => {
    calls += 1
    const url = String(input)
    if (url.includes("Real-CATS")) {
      return new Response(`address\tlabel\n${shared}\tHack Scam\n${realCatsOnly}\tPhishing\n`, { status: 200 })
    }
    if (url.includes("rugpull")) {
      return new Response(`No.,Chain,address,Losses,Type,Root Causes,Sources,URL\n1,ETH,${shared},Unknown,Combination,Combination,Source,https://example.com\n`, { status: 200 })
    }
    return new Response(JSON.stringify([{ address: shared, comment: "phishing" }]), { status: 200 })
  }

  const sharedResult = await inspectEvmPublicThreatCorpus(shared)
  const singleResult = await inspectEvmPublicThreatCorpus(realCatsOnly)

  assert.equal(sharedResult.status, "available")
  assert.equal(sharedResult.matched, true)
  assert.equal(sharedResult.independentSourceCount, 3)
  assert.deepEqual(sharedResult.matchedSources.sort(), ["mew-darklist", "real-cats", "rug-pull-dataset"])
  assert.equal(singleResult.independentSourceCount, 1)
  assert.deepEqual(singleResult.matchedSources, ["real-cats"])
  assert.equal(calls, 3, "second lookup should reuse the bounded cache")
})

test("provider degrades safely if all upstream corpora fail", async () => {
  process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED = "true"
  globalThis.fetch = async () => new Response("upstream error", { status: 503 })
  const result = await inspectEvmPublicThreatCorpus("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
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
  const result = await inspectEvmPublicThreatCorpus("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
  assert.equal(result.status, "disabled")
  assert.equal(called, false)
})
