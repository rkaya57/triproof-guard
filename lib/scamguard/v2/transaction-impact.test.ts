import assert from "node:assert/strict"
import test from "node:test"

import type { ScamGuardScanResult } from "@/lib/scamguard/engine"
import { buildV2TransactionImpact } from "./transaction-impact"

function result(overrides: Partial<ScamGuardScanResult> = {}): ScamGuardScanResult {
  return {
    id: "scan-test",
    type: "transaction",
    score: 40,
    riskLevel: "CAUTION",
    summary: "test",
    confidence: "MEDIUM",
    explanation: "test",
    signals: [],
    actions: [],
    metadata: {
      chain: "solana",
      rpcStatus: "not_applicable",
      decodedIntent: { category: "unknown", warnings: [] },
    },
    scannedAt: new Date(0).toISOString(),
    ...overrides,
  }
}

test("Solana authority changes are surfaced without changing production", () => {
  const impact = buildV2TransactionImpact(result({
    signals: [{ code: "AUTHORITY_CHANGE", severity: "high", title: "Authority", detail: "Authority" }],
    metadata: {
      chain: "solana",
      rpcStatus: "checked",
      decodedIntent: {
        category: "authority",
        instructionCount: 1,
        programs: ["spl-token"],
        warnings: ["authority change"],
      },
      simulation: { attempted: true, ok: true, chain: "solana", mode: "transaction" },
    },
  }))

  assert.equal(impact.action, "authority_change")
  assert.equal(impact.highImpact, true)
  assert.ok(impact.capabilities.includes("authority_control"))
  assert.equal(impact.simulation, "succeeded")
  assert.equal(impact.productionDecisionChanged, false)
  assert.equal(impact.containsRawPayload, false)
})

test("Solana delegate approvals are normalized as delegated asset rights", () => {
  const impact = buildV2TransactionImpact(result({
    signals: [{ code: "DELEGATE_APPROVAL", severity: "high", title: "Delegate", detail: "Delegate" }],
    metadata: {
      chain: "solana",
      rpcStatus: "not_applicable",
      decodedIntent: {
        category: "approval",
        spender: "Delegate111111111111111111111111111111111",
        amount: "500",
        warnings: ["delegate approval"],
      },
    },
  }))

  assert.equal(impact.action, "approval")
  assert.equal(impact.approvalCount, 1)
  assert.equal(impact.hasSpender, true)
  assert.equal(impact.hasAmount, true)
  assert.ok(impact.capabilities.includes("delegate_rights"))
})

test("account close behavior remains visible as a separate capability", () => {
  const impact = buildV2TransactionImpact(result({
    signals: [{ code: "CLOSE_ACCOUNT", severity: "medium", title: "Close", detail: "Close" }],
    metadata: {
      chain: "solana",
      rpcStatus: "not_applicable",
      decodedIntent: { category: "account_close", warnings: ["close account"] },
    },
  }))

  assert.equal(impact.action, "account_close")
  assert.equal(impact.highImpact, true)
  assert.ok(impact.capabilities.includes("account_closure"))
})

test("unknown transactions do not invent asset effects", () => {
  const impact = buildV2TransactionImpact(result())
  assert.equal(impact.action, "unknown")
  assert.equal(impact.highImpact, false)
  assert.equal(impact.outgoingCount, 0)
  assert.equal(impact.approvalCount, 0)
  assert.equal(impact.confidence, "unavailable")
})

test("existing EVM asset impact is normalized without retaining raw payload", () => {
  const impact = buildV2TransactionImpact(result({
    metadata: {
      chain: "evm",
      rpcStatus: "checked",
      decodedIntent: {
        category: "approval",
        spender: "0x0000000000000000000000000000000000000001",
        amount: "all assets",
        warnings: [],
      },
      assetImpact: {
        confidence: "decoded_calldata",
        outgoing: [],
        approvals: [{
          asset: "0x0000000000000000000000000000000000000002",
          spender: "0x0000000000000000000000000000000000000001",
          amount: "all assets",
          unlimited: true,
        }],
        note: "decoded",
      },
    },
    signals: [{ code: "UNLIMITED_EVM_APPROVAL", severity: "critical", title: "Unlimited", detail: "Unlimited" }],
  }))

  assert.equal(impact.chain, "evm")
  assert.equal(impact.approvalCount, 1)
  assert.ok(impact.capabilities.includes("unlimited_approval"))
  assert.equal(impact.containsRawPayload, false)
})

test("non-transaction scans are explicitly not applicable", () => {
  const impact = buildV2TransactionImpact(result({ type: "token" }))
  assert.equal(impact.status, "not_applicable")
  assert.equal(impact.highImpact, false)
})
