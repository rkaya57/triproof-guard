import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { calculateBenchmarkMetrics } from "./metrics"
import { runLabeledBenchmark } from "./runner"
import {
  labeledBenchmarkDatasetSchema,
  parseLabeledBenchmarkDataset,
} from "./schema"

function loadReferenceDataset() {
  const path = join(
    process.cwd(),
    "data",
    "benchmarks",
    "reference-v1.json"
  )
  return parseLabeledBenchmarkDataset(
    JSON.parse(readFileSync(path, "utf8"))
  )
}

describe("labeled benchmark framework", () => {
  it("validates the versioned reference dataset and provenance metadata", () => {
    const dataset = loadReferenceDataset()
    const cases = dataset.scenarios.reduce(
      (total, scenario) => total + scenario.cases.length,
      0
    )

    assert.equal(dataset.schemaVersion, "tri-proof-labeled-benchmark-v1")
    assert.equal(dataset.datasetVersion, "reference-v1.0.0")
    assert.equal(cases, 15)
    assert.ok(
      dataset.scenarios.some(
        (scenario) => scenario.provenance.kind === "public_reference"
      )
    )
    assert.ok(
      dataset.scenarios.some(
        (scenario) => scenario.provenance.kind === "synthetic_adversarial"
      )
    )
  })

  it("passes the operational regression gate without claiming real-world readiness", () => {
    const report = runLabeledBenchmark(loadReferenceDataset())

    assert.equal(report.metrics.operationalGate.passed, true)
    assert.equal(report.metrics.criticalFalseApprovals, 0)
    assert.equal(report.metrics.semanticRiskLeakageCases, 0)
    assert.equal(report.metrics.acceptableDecisionAccuracy, 1)
    assert.equal(report.metrics.maliciousPrecision, 1)
    assert.equal(report.metrics.maliciousRecall, 1)
    assert.equal(report.metrics.maliciousF1, 1)
    assert.equal(report.metrics.maliciousContainmentRate, 1)
    assert.equal(report.metrics.claimReadiness.ready, false)
    assert.ok(report.metrics.claimReadiness.reasons.length > 0)
    assert.ok(report.scenarioChecks.every((check) => check.passed))
  })

  it("does not count review-only evidence as a malicious prediction", () => {
    const report = calculateBenchmarkMetrics(
      Array.from({ length: 12 }, (_, index) => ({
        scenarioId: "review-only-control",
        caseId: `review-${index}`,
        chain: "Base",
        split: "development" as const,
        provenanceKind: "synthetic_regression" as const,
        label: "organic_user" as const,
        expectedDecision: "manual_review" as const,
        acceptableDecisions: ["manual_review" as const],
        maliciousRiskExpectation: "unknown" as const,
        predictedDecision: "manual_review" as const,
        riskScore: 42,
        evidenceConfidence: "medium" as const,
        independentRiskFamilyCount: 2,
        maliciousSignalCount: 0,
        clusterLinked: false,
      }))
    )

    assert.equal(report.maliciousPrecision, null)
    assert.equal(report.criticalFalseApprovals, 0)
  })

  it("counts a linked cluster with two independent families as malicious evidence", () => {
    const observations = Array.from({ length: 12 }, (_, index) => ({
      scenarioId: "corroborated-cluster",
      caseId: `cluster-${index}`,
      chain: "Base",
      split: "development" as const,
      provenanceKind: "synthetic_adversarial" as const,
      label: "sybil" as const,
      expectedDecision: "manual_review" as const,
      acceptableDecisions: ["manual_review" as const, "rejected" as const],
      maliciousRiskExpectation: "present" as const,
      predictedDecision: "manual_review" as const,
      riskScore: 55,
      evidenceConfidence: "medium" as const,
      independentRiskFamilyCount: 2,
      maliciousSignalCount: 0,
      clusterLinked: true,
    }))

    const report = calculateBenchmarkMetrics(observations)
    assert.equal(report.maliciousPrecision, 1)
    assert.equal(report.maliciousRecall, 1)
    assert.equal(report.operationalGate.passed, true)
  })

  it("rejects a human-verified label without reviewer provenance", () => {
    const dataset = loadReferenceDataset()
    const invalid = structuredClone(dataset)
    invalid.scenarios[0].provenance = {
      kind: "verified_human",
      sourceRef: "internal review",
      reviewers: [],
      reviewedAt: null,
      notes: "Missing mandatory reviewer provenance.",
    }

    const parsed = labeledBenchmarkDatasetSchema.safeParse(invalid)
    assert.equal(parsed.success, false)
  })

  it("fails the safety gate when a malicious wallet is auto-approved", () => {
    const report = calculateBenchmarkMetrics([
      {
        scenarioId: "unsafe",
        caseId: "unsafe-1",
        chain: "Base",
        split: "development",
        provenanceKind: "synthetic_adversarial",
        label: "sybil",
        expectedDecision: "manual_review",
        acceptableDecisions: ["manual_review", "rejected"],
        maliciousRiskExpectation: "present",
        predictedDecision: "approved",
        riskScore: 0,
        evidenceConfidence: "low",
        independentRiskFamilyCount: 0,
        maliciousSignalCount: 0,
        clusterLinked: false,
      },
      ...Array.from({ length: 11 }, (_, index) => ({
        scenarioId: "safe-control",
        caseId: `safe-${index}`,
        chain: "Base",
        split: "development" as const,
        provenanceKind: "synthetic_regression" as const,
        label: "organic_user" as const,
        expectedDecision: "approved" as const,
        acceptableDecisions: ["approved" as const],
        maliciousRiskExpectation: "absent" as const,
        predictedDecision: "approved" as const,
        riskScore: 0,
        evidenceConfidence: "high" as const,
        independentRiskFamilyCount: 0,
        maliciousSignalCount: 0,
        clusterLinked: false,
      })),
    ])

    assert.equal(report.criticalFalseApprovals, 1)
    assert.equal(report.operationalGate.passed, false)
  })

  it("fails semantic safety when non-user eligibility becomes malicious risk", () => {
    const observations = Array.from({ length: 12 }, (_, index) => ({
      scenarioId: "non-user-leakage",
      caseId: `case-${index}`,
      chain: "Solana",
      split: "development" as const,
      provenanceKind: "synthetic_regression" as const,
      label: "non_user_entity" as const,
      expectedDecision: "rejected" as const,
      acceptableDecisions: ["rejected" as const],
      maliciousRiskExpectation: "absent" as const,
      predictedDecision: "rejected" as const,
      riskScore: index === 0 ? 75 : 0,
      evidenceConfidence: "high" as const,
      independentRiskFamilyCount: index === 0 ? 2 : 0,
      maliciousSignalCount: index === 0 ? 1 : 0,
      clusterLinked: false,
    }))

    const report = calculateBenchmarkMetrics(observations)
    assert.equal(report.nonUserRiskLeakageCases, 1)
    assert.equal(report.operationalGate.passed, false)
  })
})
