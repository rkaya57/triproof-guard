import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { HOLDOUT_EVALUATION_SCHEMA_VERSION } from "./holdout-evaluation"

test("holdout evaluation is explicitly one-shot and never invokes the risk engine", () => {
  const source = readFileSync("lib/benchmark/holdout-evaluation.ts", "utf8")

  assert.equal(
    HOLDOUT_EVALUATION_SCHEMA_VERSION,
    "tri-proof-independent-holdout-evaluation-v1"
  )
  assert.doesNotMatch(source, /analyzeWallets|runLabeledBenchmark|normalizeAnalysisSemantics/)
  assert.match(source, /getHoldoutArtifact<PrivateSealPayload>\(run\.id, "private_seal"\)/)
  assert.match(source, /getHoldoutArtifact<HoldoutGroundTruthSetPayload>\(run\.id, "ground_truth"\)/)
  assert.match(source, /putImmutableHoldoutArtifact\(\{[\s\S]*kind: "evaluation"/)
  assert.match(source, /updateHoldoutRunStatus\(run\.id, "ready_to_evaluate", "evaluated"\)/)
})

test("holdout evaluation uses human holdout provenance and frozen outputs", () => {
  const source = readFileSync("lib/benchmark/holdout-evaluation.ts", "utf8")
  assert.match(source, /provenanceKind: "verified_human"/)
  assert.match(source, /split: "holdout"/)
  assert.match(source, /engine_status/)
  assert.match(source, /risk_score/)
  assert.match(source, /buildExplainableDecision\(frozenResult\)/)
  assert.match(source, /buildHoldoutFinalClaimGate/)
  assert.match(source, /Frozen engine-output case set differs from sealed ground truth/)
})
