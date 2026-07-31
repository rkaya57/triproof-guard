import assert from "node:assert/strict"
import test from "node:test"

import { buildScamGuardReplyFallback } from "@/lib/ai/scamguard-reply"
import type { ScamGuardScanResult } from "@/lib/scamguard/engine"

const result: ScamGuardScanResult = {
  id: "scan-test",
  scannedAt: "2026-07-31T00:00:00.000Z",
  type: "url",
  riskLevel: "HIGH_RISK",
  score: 18,
  confidence: "HIGH",
  summary: "High-confidence malicious pattern.",
  explanation: "A known scam pattern was found.",
  signals: [],
  actions: ["Close the page."],
  metadata: { chain: "solana", rpcStatus: "not_applicable" },
}

test("ScamGuard AI fallback preserves the security decision", () => {
  const reply = buildScamGuardReplyFallback(result)
  assert.equal(reply.source, "fallback")
  assert.equal(reply.headline, "Pause and verify before you interact.")
  assert.deepEqual(reply.nextSteps, ["Close the page."])
})
