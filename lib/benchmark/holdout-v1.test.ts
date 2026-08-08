import assert from "node:assert/strict"
import test from "node:test"

import type { BenchmarkMetricsReport } from "./metrics"
import {
  HOLDOUT_GROUND_TRUTH_SCHEMA_VERSION,
  HOLDOUT_REVIEW_SCHEMA_VERSION,
  adjudicateIndependentHoldoutReviews,
  buildHoldoutDesignReadiness,
  buildHoldoutFinalClaimGate,
  buildHoldoutStackFingerprint,
  buildHoldoutStackFreeze,
  verifyHoldoutFreezeIntegrity,
  type HoldoutGroundTruthCase,
  type HoldoutReview,
} from "./holdout-v1"

const COMMIT = "0123456789abcdef0123456789abcdef01234567"
const FROZEN_AT = "2026-08-08T10:00:00.000Z"

function review(
  overrides: Partial<HoldoutReview> = {}
): HoldoutReview {
  return {
    schemaVersion: HOLDOUT_REVIEW_SCHEMA_VERSION,
    caseId: "case-1",
    chain: "Solana",
    reviewer: "reviewer-a",
    reviewedAt: "2026-08-08T11:00:00.000Z",
    label: "organic_user",
    expectedDecision: "approved",
    acceptableDecisions: ["approved"],
    maliciousRiskExpectation: "absent",
    confidence: "high",
    rationale: "Observed evidence supports the assigned label.",
    ...overrides,
  }
}

function groundTruthCase(
  index: number,
  overrides: Partial<HoldoutGroundTruthCase> = {}
): HoldoutGroundTruthCase {
  return {
    schemaVersion: HOLDOUT_GROUND_TRUTH_SCHEMA_VERSION,
    caseId: `case-${index}`,
    chain: index % 2 === 0 ? "Solana" : "Ethereum",
    createdAt: "2026-08-08T10:01:00.000Z",
    label: index <= 30 ? "sybil" : "organic_user",
    expectedDecision: index <= 30 ? "rejected" : "approved",
    acceptableDecisions: index <= 30 ? ["rejected", "manual_review"] : ["approved"],
    maliciousRiskExpectation: index <= 30 ? "present" : "absent",
    confidence: "high",
    rationale: "Independent blinded reviewers supplied sufficient evidence.",
    reviewers: ["reviewer-a", "reviewer-b"],
    supportingLabelReviewers: ["reviewer-a", "reviewer-b"],
    adjudicated: false,
    ...overrides,
  }
}

function passingMetrics(): BenchmarkMetricsReport {
  return {
    totalCases: 100,
    acceptableDecisionAccuracy: 0.96,
    exactDecisionAccuracy: 0.94,
    maliciousPrecision: 0.95,
    maliciousRecall: 0.93,
    maliciousF1: 0.94,
    maliciousContainmentRate: 1,
    criticalFalseApprovals: 0,
    organicFalseRejectRate: 0.02,
    manualReviewRate: 0.12,
    highConfidenceAccuracy: 1,
    semanticRiskLeakageCases: 0,
    nonUserRiskLeakageCases: 0,
    insufficientDataRiskLeakageCases: 0,
    confusionMatrix: {
      approved: { approved: 40, manual_review: 0, rejected: 0 },
      manual_review: { approved: 0, manual_review: 30, rejected: 0 },
      rejected: { approved: 0, manual_review: 0, rejected: 30 },
    },
    byChain: {},
    bySplit: {
      development: {
        cases: 0,
        acceptableDecisionAccuracy: 0,
        maliciousPrecision: null,
        maliciousRecall: null,
        maliciousF1: null,
        maliciousContainmentRate: null,
        organicFalseRejectRate: null,
        manualReviewRate: 0,
        averageRiskScore: 0,
      },
      validation: {
        cases: 0,
        acceptableDecisionAccuracy: 0,
        maliciousPrecision: null,
        maliciousRecall: null,
        maliciousF1: null,
        maliciousContainmentRate: null,
        organicFalseRejectRate: null,
        manualReviewRate: 0,
        averageRiskScore: 0,
      },
      holdout: {
        cases: 100,
        acceptableDecisionAccuracy: 0.96,
        maliciousPrecision: 0.95,
        maliciousRecall: 0.93,
        maliciousF1: 0.94,
        maliciousContainmentRate: 1,
        organicFalseRejectRate: 0.02,
        manualReviewRate: 0.12,
        averageRiskScore: 32,
      },
    },
    operationalGate: { passed: true, checks: [] },
    claimReadiness: {
      ready: true,
      reasons: [],
      realWorldHoldoutCases: 100,
      realWorldMaliciousCases: 30,
      realWorldOrganicCases: 30,
      representedChains: 2,
    },
  }
}

test("holdout freeze is deterministic and integrity protected", () => {
  const freeze = buildHoldoutStackFreeze({
    commitSha: COMMIT,
    frozenAt: FROZEN_AT,
  })
  assert.equal(freeze.candidateNotBefore, FROZEN_AT)
  assert.equal(freeze.stack.commitSha, COMMIT)
  assert.equal(freeze.stack.ai.model, "gemini-3.6-flash")
  assert.equal(verifyHoldoutFreezeIntegrity(freeze), true)

  const tampered = {
    ...freeze,
    minimums: { ...freeze.minimums, cases: 99 },
  }
  assert.equal(verifyHoldoutFreezeIntegrity(tampered), false)
})

test("two agreeing independent reviewers freeze a non-malicious case", () => {
  const result = adjudicateIndependentHoldoutReviews(
    review({ reviewer: "alice" }),
    review({ reviewer: "bob" })
  )
  assert.equal(result.status, "resolved")
  if (result.status === "resolved") {
    assert.deepEqual(result.groundTruth.reviewers, ["alice", "bob"])
    assert.equal(result.groundTruth.adjudicated, false)
  }
})

test("duplicate reviewer identity is rejected", () => {
  assert.throws(
    () =>
      adjudicateIndependentHoldoutReviews(
        review({ reviewer: "Alice" }),
        review({ reviewer: " alice " })
      ),
    /distinct reviewer identities/
  )
})

test("review disagreement never auto-resolves", () => {
  const result = adjudicateIndependentHoldoutReviews(
    review({ reviewer: "alice", label: "organic_user" }),
    review({
      reviewer: "bob",
      label: "insufficient_data",
      expectedDecision: "manual_review",
      acceptableDecisions: ["manual_review"],
      maliciousRiskExpectation: "unknown",
    })
  )
  assert.deepEqual(result, {
    status: "conflict",
    reason: "independent_reviews_disagree_and_require_adjudication",
    caseId: "case-1",
  })
})

test("malicious ground truth requires two independent supporters", () => {
  const result = adjudicateIndependentHoldoutReviews(
    review({ reviewer: "alice", label: "sybil", expectedDecision: "rejected", acceptableDecisions: ["rejected", "manual_review"], maliciousRiskExpectation: "present" }),
    review({ reviewer: "bob", label: "organic_user" }),
    review({ reviewer: "charlie", label: "organic_user" })
  )
  assert.equal(result.status, "resolved")

  const unresolvedMalicious = adjudicateIndependentHoldoutReviews(
    review({ reviewer: "alice", label: "sybil", expectedDecision: "rejected", acceptableDecisions: ["rejected", "manual_review"], maliciousRiskExpectation: "present" }),
    review({ reviewer: "bob", label: "organic_user" }),
    review({ reviewer: "charlie", label: "sybil", expectedDecision: "rejected", acceptableDecisions: ["rejected", "manual_review"], maliciousRiskExpectation: "present" })
  )
  assert.equal(unresolvedMalicious.status, "resolved")
  if (unresolvedMalicious.status === "resolved") {
    assert.deepEqual(unresolvedMalicious.groundTruth.supportingLabelReviewers, ["alice", "charlie"])
  }
})

test("design readiness rejects pre-freeze cases and undersized samples", () => {
  const freeze = buildHoldoutStackFreeze({ commitSha: COMMIT, frozenAt: FROZEN_AT })
  const design = buildHoldoutDesignReadiness({
    freeze,
    cases: [groundTruthCase(1, { createdAt: "2026-08-08T09:59:59.000Z" })],
  })
  assert.equal(design.ready, false)
  assert.equal(design.preFreezeCases, 1)
  assert.ok(design.reasons.some((reason) => reason.includes("pre-date")))
  assert.ok(design.reasons.some((reason) => reason.includes("at least 100")))
})

test("100-case, 30-malicious, 30-organic, two-chain design can become ready", () => {
  const freeze = buildHoldoutStackFreeze({ commitSha: COMMIT, frozenAt: FROZEN_AT })
  const cases = Array.from({ length: 100 }, (_, index) =>
    groundTruthCase(index + 1, {
      label: index < 30 ? "sybil" : index < 60 ? "organic_user" : "insufficient_data",
      expectedDecision: index < 30 ? "rejected" : index < 60 ? "approved" : "manual_review",
      acceptableDecisions:
        index < 30
          ? ["rejected", "manual_review"]
          : index < 60
            ? ["approved"]
            : ["manual_review"],
      maliciousRiskExpectation: index < 30 ? "present" : index < 60 ? "absent" : "unknown",
    })
  )
  const design = buildHoldoutDesignReadiness({ freeze, cases })
  assert.equal(design.ready, true)
  assert.equal(design.totalCases, 100)
  assert.equal(design.maliciousCases, 30)
  assert.equal(design.organicCases, 30)
  assert.equal(design.representedChains, 2)
})

test("final claim gate fails if the evaluated stack changed after freeze", () => {
  const freeze = buildHoldoutStackFreeze({ commitSha: COMMIT, frozenAt: FROZEN_AT })
  const cases = Array.from({ length: 100 }, (_, index) =>
    groundTruthCase(index + 1, {
      label: index < 30 ? "sybil" : index < 60 ? "organic_user" : "insufficient_data",
      expectedDecision: index < 30 ? "rejected" : index < 60 ? "approved" : "manual_review",
      acceptableDecisions:
        index < 30
          ? ["rejected", "manual_review"]
          : index < 60
            ? ["approved"]
            : ["manual_review"],
      maliciousRiskExpectation: index < 30 ? "present" : index < 60 ? "absent" : "unknown",
    })
  )
  const design = buildHoldoutDesignReadiness({ freeze, cases })
  const changedStack = buildHoldoutStackFingerprint({
    commitSha: "fedcba9876543210fedcba9876543210fedcba98",
  })
  const gate = buildHoldoutFinalClaimGate({
    freeze,
    currentStack: changedStack,
    design,
    metrics: passingMetrics(),
  })
  assert.equal(gate.ready, false)
  assert.equal(gate.stackMatchesFreeze, false)
  assert.ok(gate.reasons.some((reason) => reason.includes("differs from the frozen")))
})
