import assert from "node:assert/strict"
import test from "node:test"

import { observeScamGuardV2 } from "./evidence-fusion"

test("holdout mode excludes Tri-Proof adjudication and graph evidence", async () => {
  const observation = await observeScamGuardV2({
    type: "wallet",
    chain: "evm",
    value: "0x1111111111111111111111111111111111111111",
  }, { evaluationMode: "holdout" })

  assert.equal(observation.summary.evaluationMode, "holdout")
  assert.equal(observation.summary.internalEvidenceExcluded, true)
  assert.equal(observation.evidence.internalAdjudication, undefined)
  assert.equal(observation.evidence.internalGraphContext, undefined)
  assert.equal(observation.provenance.some((entry) => entry.source === "triproof-adjudication"), false)
  assert.equal(observation.provenance.some((entry) => entry.source === "triproof-graph"), false)
  assert.equal(observation.proposedSignals.some((signal) => signal.code.startsWith("V2_INTERNAL_")), false)
})

test("default mode remains live/shadow and does not claim holdout isolation", async () => {
  const observation = await observeScamGuardV2({
    type: "url",
    value: "https://example.com",
  })

  assert.equal(observation.summary.evaluationMode, "live")
  assert.equal(observation.summary.internalEvidenceExcluded, false)
  assert.equal(observation.summary.decisionChanged, false)
})
