import assert from "node:assert/strict"
import test from "node:test"

import { decodeSharedScamGuardReport } from "./share-report"

const report = {
  version: 1,
  generatedAt: "2026-07-28T00:00:00.000Z",
  type: "transaction",
  chain: "evm",
  target: "app.example.org",
  riskLevel: "CAUTION",
  shieldScore: 72,
  confidence: "MEDIUM",
  summary: "A few signals need review.",
  primaryReason: "The source is not verified.",
  timeline: [{ label: "Source", value: "app.example.org", status: "Source not yet verified" }],
  signals: [{ severity: "low", title: "Unknown source", detail: "No registry entry was found." }],
  actions: ["Confirm the source from an official profile."],
}

test("decodes a share-safe ScamGuard report snapshot", () => {
  const encoded = Buffer.from(JSON.stringify(report), "utf8").toString("base64url")
  const decoded = decodeSharedScamGuardReport(encoded)

  assert.equal(decoded?.target, "app.example.org")
  assert.equal(decoded?.shieldScore, 72)
  assert.equal(decoded?.signals[0]?.title, "Unknown source")
})

test("rejects malformed ScamGuard report snapshots", () => {
  assert.equal(decodeSharedScamGuardReport("not-a-valid-report"), null)
  assert.equal(decodeSharedScamGuardReport("%$#"), null)
})
