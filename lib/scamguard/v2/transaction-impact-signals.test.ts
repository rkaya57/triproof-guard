import assert from "node:assert/strict"
import test from "node:test"

import type { V2TransactionImpact } from "./transaction-impact"
import { transactionImpactSignals } from "./transaction-impact-signals"

function impact(capabilities: V2TransactionImpact["capabilities"], overrides: Partial<V2TransactionImpact> = {}): V2TransactionImpact {
  return {
    mode: "observe_only",
    status: "available",
    chain: "solana",
    action: "unknown",
    confidence: "decoded",
    simulation: "succeeded",
    highImpact: capabilities.length > 0,
    highImpactReasons: [],
    capabilities,
    outgoingCount: 0,
    approvalCount: 0,
    hasRecipient: false,
    hasSpender: false,
    hasAmount: false,
    containsRawPayload: false,
    productionDecisionChanged: false,
    note: "test",
    ...overrides,
  }
}

test("ordinary asset outflow alone does not become a V2 maliciousness signal", () => {
  assert.deepEqual(transactionImpactSignals(impact(["asset_outflow"], { action: "transfer", outgoingCount: 1 })), [])
})

test("simulation failure alone does not become a V2 maliciousness signal", () => {
  assert.deepEqual(transactionImpactSignals(impact([], { simulation: "failed" })), [])
})

test("authority and delegated rights become bounded transaction evidence", () => {
  const signals = transactionImpactSignals(impact(["authority_control", "delegate_rights"]))
  assert.ok(signals.some((signal) => signal.code === "V2_TX_AUTHORITY_CONTROL"))
  assert.ok(signals.some((signal) => signal.code === "V2_TX_DELEGATE_RIGHTS"))
  assert.ok(signals.every((signal) => signal.severity !== "critical" && signal.severity !== "high"))
})

test("unlimited approval is visible but not emitted as a critical standalone signal", () => {
  const signals = transactionImpactSignals(impact(["unlimited_approval"]))
  assert.equal(signals.length, 1)
  assert.equal(signals[0]?.code, "V2_TX_UNLIMITED_APPROVAL")
  assert.equal(signals[0]?.severity, "medium")
})
