import assert from "node:assert/strict"
import test from "node:test"

import { observeScamGuardV2 } from "./evidence-fusion"

const originalPhishingEnabled = process.env.PHISHING_DATABASE_ENABLED
const originalTokensKey = process.env.TOKENS_XYZ_API_KEY

function restore() {
  if (originalPhishingEnabled === undefined) delete process.env.PHISHING_DATABASE_ENABLED
  else process.env.PHISHING_DATABASE_ENABLED = originalPhishingEnabled
  if (originalTokensKey === undefined) delete process.env.TOKENS_XYZ_API_KEY
  else process.env.TOKENS_XYZ_API_KEY = originalTokensKey
}

test.afterEach(restore)

function addressWord(address: string) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0")
}

function word(value: bigint) {
  return value.toString(16).padStart(64, "0")
}

function disableRemoteEvidence() {
  process.env.PHISHING_DATABASE_ENABLED = "false"
  delete process.env.TOKENS_XYZ_API_KEY
}

test("trusted source context never suppresses a dangerous unlimited approval", async () => {
  disableRemoteEvidence()

  const token = "0x1111111111111111111111111111111111111111"
  const spender = "0x2222222222222222222222222222222222222222"
  const observation = await observeScamGuardV2({
    type: "transaction",
    chain: "evm",
    sourceUrl: "https://zerg.app/",
    value: JSON.stringify({
      method: "eth_sendTransaction",
      params: [{
        to: token,
        data: `0x095ea7b3${addressWord(spender)}${"f".repeat(64)}`,
      }],
    }),
  })

  assert.equal(observation.base.metadata.reputation?.verdict, "trusted")
  assert.equal(observation.evidence.transactionImpact?.action, "approval")
  assert.ok(observation.evidence.transactionImpact?.capabilities.includes("unlimited_approval"))
  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_TX_UNLIMITED_APPROVAL"))
  assert.ok(observation.proposedAssessment.independentFamilies.includes("transaction_impact"))
  assert.equal(observation.proposedAssessment.activationGate, "insufficient")
  assert.equal(observation.summary.decisionChanged, false)
})

test("spoofed brand context can warn on an otherwise ordinary transfer without inventing transaction risk", async () => {
  disableRemoteEvidence()

  const token = "0x3333333333333333333333333333333333333333"
  const recipient = "0x4444444444444444444444444444444444444444"
  const observation = await observeScamGuardV2({
    type: "transaction",
    chain: "evm",
    sourceUrl: "https://phantorn.app/claim",
    value: JSON.stringify({
      method: "eth_sendTransaction",
      params: [{
        to: token,
        data: `0xa9059cbb${addressWord(recipient)}${word(5n)}`,
      }],
    }),
  })

  assert.equal(observation.evidence.transactionImpact?.action, "transfer")
  assert.ok(observation.evidence.transactionImpact?.capabilities.includes("asset_outflow"))
  assert.equal(observation.proposedSignals.filter((signal) => signal.code.startsWith("V2_TX_")).length, 0)
  assert.ok(observation.proposedSignals.some((signal) => signal.code === "V2_BRAND_TYPOSQUAT"))
  assert.deepEqual(observation.proposedAssessment.independentFamilies, ["brand_impersonation"])
  assert.equal(observation.proposedAssessment.proposedRiskLevel, "CAUTION")
  assert.equal(observation.proposedAssessment.activationGate, "insufficient")
})

test("official brand source plus ordinary transfer stays free of synthetic brand or transaction maliciousness evidence", async () => {
  disableRemoteEvidence()

  const token = "0x5555555555555555555555555555555555555555"
  const recipient = "0x6666666666666666666666666666666666666666"
  const observation = await observeScamGuardV2({
    type: "transaction",
    chain: "evm",
    sourceUrl: "https://phantom.app/",
    value: JSON.stringify({
      method: "eth_sendTransaction",
      params: [{
        to: token,
        data: `0xa9059cbb${addressWord(recipient)}${word(1n)}`,
      }],
    }),
  })

  assert.equal(observation.evidence.transactionImpact?.action, "transfer")
  assert.equal(observation.proposedSignals.filter((signal) => signal.code.startsWith("V2_TX_")).length, 0)
  assert.equal(observation.proposedSignals.filter((signal) => signal.code.startsWith("V2_BRAND_")).length, 0)
  assert.equal(observation.proposedAssessment.evidenceScore, 0)
  assert.equal(observation.proposedAssessment.proposedRiskLevel, "SAFE")
  assert.equal(observation.proposedAssessment.activationGate, "insufficient")
})
