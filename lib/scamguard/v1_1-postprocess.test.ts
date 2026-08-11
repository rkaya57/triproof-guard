import assert from "node:assert/strict"
import test from "node:test"

import type { ScamGuardScanResult } from "@/lib/scamguard/engine"
import { applyScamGuardV11TransactionHardening } from "@/lib/scamguard/v1_1-postprocess"

function baseResult(): ScamGuardScanResult {
  return {
    id: "test",
    type: "transaction",
    score: 10,
    riskLevel: "SAFE",
    summary: "No major risk found.",
    confidence: "MEDIUM",
    explanation: "Base V1 result.",
    signals: [],
    actions: [],
    metadata: {
      chain: "evm",
      rpcStatus: "skipped",
      decodedIntent: { warnings: [] },
      feedback: { enabled: false, endpoint: "/api/scamguard/feedback" },
    },
    scannedAt: new Date(0).toISOString(),
  }
}

function word(address: string) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0")
}

test("V1.1 raises upgradeTo from SAFE to CAUTION but not higher", () => {
  const calldata = `0x3659cfe6${word("0x1111111111111111111111111111111111111111")}`
  const result = applyScamGuardV11TransactionHardening(baseResult(), calldata)
  assert.equal(result.riskLevel, "CAUTION")
  assert.equal(result.score, 45)
  assert.equal(result.metadata.decodedIntent?.category, "authority")
  assert.ok(result.signals.some((signal) => signal.code === "V11_AUTHORITY_CHANGE"))
})

test("V1.1 never downgrades a stronger V1 decision", () => {
  const input = baseResult()
  input.riskLevel = "CRITICAL"
  input.score = 95
  const calldata = `0x3659cfe6${word("0x1111111111111111111111111111111111111111")}`
  const result = applyScamGuardV11TransactionHardening(input, calldata)
  assert.equal(result.riskLevel, "CRITICAL")
  assert.equal(result.score, 95)
})

test("V1.1 flags unlimited approval conservatively", () => {
  const maxUint = "f".repeat(64)
  const calldata = `0x095ea7b3${word("0x2222222222222222222222222222222222222222")}${maxUint}`
  const result = applyScamGuardV11TransactionHardening(baseResult(), calldata)
  assert.equal(result.riskLevel, "CAUTION")
  assert.equal(result.metadata.decodedIntent?.spender, "0x2222222222222222222222222222222222222222")
  assert.ok(result.signals.some((signal) => signal.code === "V11_UNLIMITED_APPROVAL"))
})

test("V1.1 leaves ordinary limited approval risk unchanged", () => {
  const calldata = `0x095ea7b3${word("0x2222222222222222222222222222222222222222")}${"1".padStart(64, "0")}`
  const result = applyScamGuardV11TransactionHardening(baseResult(), calldata)
  assert.equal(result.riskLevel, "SAFE")
  assert.equal(result.score, 10)
  assert.equal(result.metadata.decodedIntent?.category, "approval")
})
