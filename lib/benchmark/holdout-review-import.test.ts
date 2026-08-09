import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  HOLDOUT_REVIEW_SCHEMA_VERSION,
  adjudicateIndependentHoldoutReviews,
  type HoldoutReview,
} from "./holdout-v1"

function review(overrides: Partial<HoldoutReview> = {}): HoldoutReview {
  return {
    schemaVersion: HOLDOUT_REVIEW_SCHEMA_VERSION,
    caseId: "rw-case",
    chain: "Solana",
    reviewer: "reviewer-a",
    reviewedAt: "2026-08-09T11:00:00.000Z",
    label: "organic_user",
    expectedDecision: "approved",
    acceptableDecisions: ["approved"],
    maliciousRiskExpectation: "absent",
    confidence: "high",
    rationale: "Independent evidence supports this reviewer conclusion.",
    ...overrides,
  }
}

test("holdout core never auto-resolves an A/B disagreement", () => {
  const result = adjudicateIndependentHoldoutReviews(
    review({ reviewer: "alice" }),
    review({
      reviewer: "bob",
      label: "insufficient_data",
      expectedDecision: "manual_review",
      acceptableDecisions: ["manual_review"],
      maliciousRiskExpectation: "unknown",
    })
  )
  assert.equal(result.status, "conflict")
})

test("malicious adjudication still requires two supporting independent reviewers", () => {
  const result = adjudicateIndependentHoldoutReviews(
    review({
      reviewer: "alice",
      label: "organic_user",
    }),
    review({
      reviewer: "bob",
      label: "insufficient_data",
      expectedDecision: "manual_review",
      acceptableDecisions: ["manual_review"],
      maliciousRiskExpectation: "unknown",
    }),
    review({
      reviewer: "charlie",
      label: "sybil",
      expectedDecision: "rejected",
      acceptableDecisions: ["rejected", "manual_review"],
      maliciousRiskExpectation: "present",
    })
  )
  assert.equal(result.status, "conflict")
  if (result.status === "conflict") {
    assert.equal(
      result.reason,
      "malicious_label_requires_two_supporting_independent_reviewers"
    )
  }
})

test("review import source enforces frozen evidence, distinct reviewers and canonical decisions", () => {
  const source = readFileSync("lib/benchmark/holdout-review-import.ts", "utf8")
  const route = readFileSync(
    "app/api/admin/benchmark/holdout/reviews/route.ts",
    "utf8"
  )

  assert.match(source, /immutable field \$\{header\} differs from the frozen bundle/)
  assert.match(source, /exactly one reviewer identity/)
  assert.match(source, /must use a distinct reviewer identity/)
  assert.match(source, /expected_decision must be approved, manual_review, or rejected/)
  assert.match(source, /reviewed_at predates the frozen reviewer bundle/)
  assert.match(source, /Ground truth cannot be sealed/)
  assert.match(source, /putImmutableHoldoutArtifact\(\{[\s\S]*kind: "ground_truth"/)
  assert.match(route, /completedCsvSha256/)
  assert.match(route, /already frozen with a different completed-review hash/)
})
