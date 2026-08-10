import assert from "node:assert/strict"
import test from "node:test"

import { summarizeGraphContext } from "./internal-graph-context"

test("graph context summarizes analyses, components and risk-bearing edges without model scores", () => {
  const result = summarizeGraphContext(
    [
      { analysisId: "a1", componentId: "c1" },
      { analysisId: "a1", componentId: "c1" },
      { analysisId: "a2", componentId: "c2" },
    ],
    [
      { analysisId: "a1", componentId: "c1", kind: "shared_funder", confidence: 88, observedAt: new Date("2026-08-09T10:00:00Z"), createdAt: new Date("2026-08-09T10:00:00Z") },
      { analysisId: "a2", componentId: "c2", kind: "referral_link", confidence: 72, observedAt: null, createdAt: new Date("2026-08-10T10:00:00Z") },
    ],
  )

  assert.equal(result.observedAnalyses, 2)
  assert.equal(result.observedComponents, 2)
  assert.equal(result.riskBearingEdges, 2)
  assert.deepEqual(result.edgeKinds.sort(), ["referral_link", "shared_funder"])
  assert.equal(result.maxEdgeConfidence, 88)
  assert.equal(result.latestObservedAt, "2026-08-10T10:00:00.000Z")
})

test("empty graph context stays neutral", () => {
  const result = summarizeGraphContext([], [])
  assert.equal(result.observedAnalyses, 0)
  assert.equal(result.observedComponents, 0)
  assert.equal(result.riskBearingEdges, 0)
  assert.deepEqual(result.edgeKinds, [])
  assert.equal(result.maxEdgeConfidence, undefined)
})
