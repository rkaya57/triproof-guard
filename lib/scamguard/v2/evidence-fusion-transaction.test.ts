import assert from "node:assert/strict"
import test from "node:test"

import { resetPhishingDatabaseCacheForTests } from "@/lib/scamguard/providers/phishing-database"
import { observeScamGuardV2 } from "./evidence-fusion"

const originalFetch = globalThis.fetch
const originalEnabled = process.env.PHISHING_DATABASE_ENABLED
const originalFeedUrl = process.env.PHISHING_DATABASE_FEED_URL
const originalTokensKey = process.env.TOKENS_XYZ_API_KEY

function restore() {
  globalThis.fetch = originalFetch
  if (originalEnabled === undefined) delete process.env.PHISHING_DATABASE_ENABLED
  else process.env.PHISHING_DATABASE_ENABLED = originalEnabled
  if (originalFeedUrl === undefined) delete process.env.PHISHING_DATABASE_FEED_URL
  else process.env.PHISHING_DATABASE_FEED_URL = originalFeedUrl
  if (originalTokensKey === undefined) delete process.env.TOKENS_XYZ_API_KEY
  else process.env.TOKENS_XYZ_API_KEY = originalTokensKey
  resetPhishingDatabaseCacheForTests()
}

test.afterEach(restore)

function evmAddressWord(address: string) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0")
}

function evmWord(value: bigint) {
  return value.toString(16).padStart(64, "0")
}

test("real EVM unlimited approval plus phishing and brand evidence reaches three-family critical shadow proposal", async () => {
  process.env.PHISHING_DATABASE_ENABLED = "true"
  process.env.PHISHING_DATABASE_FEED_URL = "https://phishing.example/active.txt"
  delete process.env.TOKENS_XYZ_API_KEY

  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url === "https://phishing.example/active.txt") {
      return new Response("phantorn.app\n", { status: 200 })
    }
    if (url.includes("eth-phishing-detect")) {
      return new Response(JSON.stringify({ blacklist: [], fuzzylist: [], whitelist: [] }), { status: 200 })
    }
    return new Response("", { status: 404 })
  }

  const token = "0x1111111111111111111111111111111111111111"
  const spender = "0x2222222222222222222222222222222222222222"
  const observation = await observeScamGuardV2({
    type: "transaction",
    chain: "evm",
    sourceUrl: "https://phantorn.app/claim",
    value: JSON.stringify({
      method: "eth_sendTransaction",
      params: [{
        to: token,
        data: `0x095ea7b3${evmAddressWord(spender)}${"f".repeat(64)}`,
      }],
    }),
  })

  assert.equal(observation.evidence.transactionImpact?.action, "approval")
  assert.ok(observation.evidence.transactionImpact?.capabilities.includes("unlimited_approval"))
  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_TX_UNLIMITED_APPROVAL"))
  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_ACTIVE_PHISHING_FEED_MATCH"))
  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_BRAND_TYPOSQUAT"))
  assert.ok(observation.proposedAssessment.independentFamilies.includes("transaction_impact"))
  assert.ok(observation.proposedAssessment.independentFamilies.includes("threat_intelligence"))
  assert.ok(observation.proposedAssessment.independentFamilies.includes("brand_impersonation"))
  assert.equal(observation.proposedAssessment.activationGate, "corroborated")
  assert.equal(observation.proposedAssessment.proposedRiskLevel, "CRITICAL")
  assert.equal(observation.summary.decisionChanged, false)
})

test("real EVM limited approval alone remains bounded and cannot self-escalate", async () => {
  process.env.PHISHING_DATABASE_ENABLED = "false"
  delete process.env.TOKENS_XYZ_API_KEY

  const token = "0x3333333333333333333333333333333333333333"
  const spender = "0x4444444444444444444444444444444444444444"
  const observation = await observeScamGuardV2({
    type: "transaction",
    chain: "evm",
    value: JSON.stringify({
      method: "eth_sendTransaction",
      params: [{
        to: token,
        data: `0x095ea7b3${evmAddressWord(spender)}${evmWord(1n)}`,
      }],
    }),
  })

  assert.equal(observation.evidence.transactionImpact?.action, "approval")
  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_TX_DELEGATE_RIGHTS"))
  assert.ok(!observation.proposedSignals.some((signal) => signal.code === "V2_TX_UNLIMITED_APPROVAL"))
  assert.deepEqual(observation.proposedAssessment.independentFamilies, ["transaction_impact"])
  assert.equal(observation.proposedAssessment.activationGate, "insufficient")
  assert.equal(observation.proposedAssessment.proposedRiskLevel, "SAFE")
})

test("ordinary decoded EVM transfer remains visible as asset impact without adding maliciousness score", async () => {
  process.env.PHISHING_DATABASE_ENABLED = "false"
  delete process.env.TOKENS_XYZ_API_KEY

  const token = "0x5555555555555555555555555555555555555555"
  const recipient = "0x6666666666666666666666666666666666666666"
  const observation = await observeScamGuardV2({
    type: "transaction",
    chain: "evm",
    value: JSON.stringify({
      method: "eth_sendTransaction",
      params: [{
        to: token,
        data: `0xa9059cbb${evmAddressWord(recipient)}${evmWord(5n)}`,
      }],
    }),
  })

  assert.equal(observation.evidence.transactionImpact?.action, "transfer")
  assert.ok(observation.evidence.transactionImpact?.capabilities.includes("asset_outflow"))
  assert.equal(observation.proposedSignals.filter((signal) => signal.code.startsWith("V2_TX_")).length, 0)
  assert.ok(!observation.proposedAssessment.independentFamilies.includes("transaction_impact"))
  assert.equal(observation.summary.decisionChanged, false)
})
