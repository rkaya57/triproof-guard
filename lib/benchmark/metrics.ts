import type {
  BenchmarkLabel,
  BenchmarkMaliciousExpectation,
  BenchmarkProvenanceKind,
  BenchmarkSplit,
} from "./schema"
import type {
  DecisionEvidenceConfidence,
  WalletStatus,
} from "@/types"

export type BenchmarkObservation = {
  scenarioId: string
  caseId: string
  chain: string
  split: BenchmarkSplit
  provenanceKind: BenchmarkProvenanceKind
  label: BenchmarkLabel
  expectedDecision: WalletStatus
  acceptableDecisions: WalletStatus[]
  maliciousRiskExpectation: BenchmarkMaliciousExpectation
  predictedDecision: WalletStatus
  riskScore: number
  evidenceConfidence: DecisionEvidenceConfidence
  independentRiskFamilyCount: number
  maliciousSignalCount: number
}

export type BenchmarkMetricThresholds = {
  minimumCases: number
  minimumAcceptableDecisionAccuracy: number
  minimumMaliciousContainmentRate: number
  maximumOrganicFalseRejectRate: number
  minimumHighConfidenceAccuracy: number
  maximumSemanticRiskLeakageCases: number
  minimumRealWorldHoldoutCasesForClaim: number
  minimumRealWorldMaliciousCasesForClaim: number
  minimumRealWorldOrganicCasesForClaim: number
  minimumChainsForClaim: number
}

export const DEFAULT_BENCHMARK_THRESHOLDS: BenchmarkMetricThresholds = {
  minimumCases: 12,
  minimumAcceptableDecisionAccuracy: 0.95,
  minimumMaliciousContainmentRate: 1,
  maximumOrganicFalseRejectRate: 0.03,
  minimumHighConfidenceAccuracy: 1,
  maximumSemanticRiskLeakageCases: 0,
  minimumRealWorldHoldoutCasesForClaim: 100,
  minimumRealWorldMaliciousCasesForClaim: 30,
  minimumRealWorldOrganicCasesForClaim: 30,
  minimumChainsForClaim: 2,
}

export type BenchmarkConfusionMatrix = Record<
  WalletStatus,
  Record<WalletStatus, number>
>

export type BenchmarkSliceMetrics = {
  cases: number
  acceptableDecisionAccuracy: number
  maliciousPrecision: number | null
  maliciousRecall: number | null
  maliciousF1: number | null
  maliciousContainmentRate: number | null
  organicFalseRejectRate: number | null
  manualReviewRate: number
  averageRiskScore: number
}

export type BenchmarkQualityGate = {
  passed: boolean
  checks: Array<{
    name: string
    passed: boolean
    actual: number | boolean
    required: string
  }>
}

export type BenchmarkClaimReadiness = {
  ready: boolean
  reasons: string[]
  realWorldHoldoutCases: number
  realWorldMaliciousCases: number
  realWorldOrganicCases: number
  representedChains: number
}

export type BenchmarkMetricsReport = {
  totalCases: number
  acceptableDecisionAccuracy: number
  exactDecisionAccuracy: number
  maliciousPrecision: number | null
  maliciousRecall: number | null
  maliciousF1: number | null
  maliciousContainmentRate: number | null
  criticalFalseApprovals: number
  organicFalseRejectRate: number | null
  manualReviewRate: number
  highConfidenceAccuracy: number | null
  semanticRiskLeakageCases: number
  nonUserRiskLeakageCases: number
  insufficientDataRiskLeakageCases: number
  confusionMatrix: BenchmarkConfusionMatrix
  byChain: Record<string, BenchmarkSliceMetrics>
  bySplit: Record<BenchmarkSplit, BenchmarkSliceMetrics>
  operationalGate: BenchmarkQualityGate
  claimReadiness: BenchmarkClaimReadiness
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator
}

function rounded(value: number | null) {
  return value === null ? null : Number(value.toFixed(6))
}

function isMaliciousLabel(label: BenchmarkLabel) {
  return label === "sybil" || label === "bot"
}

function isRealWorldProvenance(kind: BenchmarkProvenanceKind) {
  return kind === "verified_human" || kind === "public_reference"
}

function predictedMalicious(observation: BenchmarkObservation) {
  return (
    observation.predictedDecision !== "approved" &&
    observation.maliciousSignalCount > 0
  )
}

function emptyConfusionMatrix(): BenchmarkConfusionMatrix {
  return {
    approved: { approved: 0, manual_review: 0, rejected: 0 },
    manual_review: { approved: 0, manual_review: 0, rejected: 0 },
    rejected: { approved: 0, manual_review: 0, rejected: 0 },
  }
}

function buildSliceMetrics(
  observations: BenchmarkObservation[]
): BenchmarkSliceMetrics {
  const accepted = observations.filter((observation) =>
    observation.acceptableDecisions.includes(observation.predictedDecision)
  ).length
  const malicious = observations.filter((observation) =>
    isMaliciousLabel(observation.label)
  )
  const organic = observations.filter(
    (observation) => observation.label === "organic_user"
  )
  const predictedPositive = observations.filter(predictedMalicious)
  const truePositive = predictedPositive.filter((observation) =>
    isMaliciousLabel(observation.label)
  ).length
  const falsePositive = predictedPositive.length - truePositive
  const falseNegative = malicious.filter(
    (observation) => !predictedMalicious(observation)
  ).length
  const precision = ratio(truePositive, truePositive + falsePositive)
  const recall = ratio(truePositive, truePositive + falseNegative)
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall)

  return {
    cases: observations.length,
    acceptableDecisionAccuracy: rounded(
      ratio(accepted, observations.length) ?? 0
    ) as number,
    maliciousPrecision: rounded(precision),
    maliciousRecall: rounded(recall),
    maliciousF1: rounded(f1),
    maliciousContainmentRate: rounded(
      ratio(
        malicious.filter(
          (observation) => observation.predictedDecision !== "approved"
        ).length,
        malicious.length
      )
    ),
    organicFalseRejectRate: rounded(
      ratio(
        organic.filter(
          (observation) => observation.predictedDecision === "rejected"
        ).length,
        organic.length
      )
    ),
    manualReviewRate: rounded(
      ratio(
        observations.filter(
          (observation) => observation.predictedDecision === "manual_review"
        ).length,
        observations.length
      ) ?? 0
    ) as number,
    averageRiskScore: observations.length
      ? Number(
          (
            observations.reduce(
              (sum, observation) => sum + observation.riskScore,
              0
            ) / observations.length
          ).toFixed(3)
        )
      : 0,
  }
}

function buildOperationalGate(
  report: Omit<BenchmarkMetricsReport, "operationalGate" | "claimReadiness">,
  thresholds: BenchmarkMetricThresholds
): BenchmarkQualityGate {
  const checks: BenchmarkQualityGate["checks"] = [
    {
      name: "minimum_cases",
      passed: report.totalCases >= thresholds.minimumCases,
      actual: report.totalCases,
      required: `>= ${thresholds.minimumCases}`,
    },
    {
      name: "acceptable_decision_accuracy",
      passed:
        report.acceptableDecisionAccuracy >=
        thresholds.minimumAcceptableDecisionAccuracy,
      actual: report.acceptableDecisionAccuracy,
      required: `>= ${thresholds.minimumAcceptableDecisionAccuracy}`,
    },
    {
      name: "malicious_containment_rate",
      passed:
        (report.maliciousContainmentRate ?? 0) >=
        thresholds.minimumMaliciousContainmentRate,
      actual: report.maliciousContainmentRate ?? 0,
      required: `>= ${thresholds.minimumMaliciousContainmentRate}`,
    },
    {
      name: "critical_false_approvals",
      passed: report.criticalFalseApprovals === 0,
      actual: report.criticalFalseApprovals,
      required: "= 0",
    },
    {
      name: "organic_false_reject_rate",
      passed:
        (report.organicFalseRejectRate ?? 0) <=
        thresholds.maximumOrganicFalseRejectRate,
      actual: report.organicFalseRejectRate ?? 0,
      required: `<= ${thresholds.maximumOrganicFalseRejectRate}`,
    },
    {
      name: "high_confidence_accuracy",
      passed:
        (report.highConfidenceAccuracy ?? 1) >=
        thresholds.minimumHighConfidenceAccuracy,
      actual: report.highConfidenceAccuracy ?? 1,
      required: `>= ${thresholds.minimumHighConfidenceAccuracy}`,
    },
    {
      name: "semantic_risk_leakage",
      passed:
        report.semanticRiskLeakageCases <=
        thresholds.maximumSemanticRiskLeakageCases,
      actual: report.semanticRiskLeakageCases,
      required: `<= ${thresholds.maximumSemanticRiskLeakageCases}`,
    },
  ]

  return {
    passed: checks.every((check) => check.passed),
    checks,
  }
}

function buildClaimReadiness(
  observations: BenchmarkObservation[],
  thresholds: BenchmarkMetricThresholds
): BenchmarkClaimReadiness {
  const realWorldHoldout = observations.filter(
    (observation) =>
      observation.split === "holdout" &&
      isRealWorldProvenance(observation.provenanceKind)
  )
  const malicious = realWorldHoldout.filter((observation) =>
    isMaliciousLabel(observation.label)
  )
  const organic = realWorldHoldout.filter(
    (observation) => observation.label === "organic_user"
  )
  const chains = new Set(realWorldHoldout.map((observation) => observation.chain))
  const reasons: string[] = []

  if (
    realWorldHoldout.length <
    thresholds.minimumRealWorldHoldoutCasesForClaim
  ) {
    reasons.push(
      `Need at least ${thresholds.minimumRealWorldHoldoutCasesForClaim} real-world holdout cases; found ${realWorldHoldout.length}.`
    )
  }
  if (
    malicious.length < thresholds.minimumRealWorldMaliciousCasesForClaim
  ) {
    reasons.push(
      `Need at least ${thresholds.minimumRealWorldMaliciousCasesForClaim} real-world malicious cases; found ${malicious.length}.`
    )
  }
  if (organic.length < thresholds.minimumRealWorldOrganicCasesForClaim) {
    reasons.push(
      `Need at least ${thresholds.minimumRealWorldOrganicCasesForClaim} real-world organic-user cases; found ${organic.length}.`
    )
  }
  if (chains.size < thresholds.minimumChainsForClaim) {
    reasons.push(
      `Need at least ${thresholds.minimumChainsForClaim} represented chains; found ${chains.size}.`
    )
  }

  return {
    ready: reasons.length === 0,
    reasons,
    realWorldHoldoutCases: realWorldHoldout.length,
    realWorldMaliciousCases: malicious.length,
    realWorldOrganicCases: organic.length,
    representedChains: chains.size,
  }
}

export function calculateBenchmarkMetrics(
  observations: BenchmarkObservation[],
  thresholds: BenchmarkMetricThresholds = DEFAULT_BENCHMARK_THRESHOLDS
): BenchmarkMetricsReport {
  const confusionMatrix = emptyConfusionMatrix()
  observations.forEach((observation) => {
    confusionMatrix[observation.expectedDecision][
      observation.predictedDecision
    ] += 1
  })

  const accepted = observations.filter((observation) =>
    observation.acceptableDecisions.includes(observation.predictedDecision)
  ).length
  const exact = observations.filter(
    (observation) =>
      observation.expectedDecision === observation.predictedDecision
  ).length
  const malicious = observations.filter((observation) =>
    isMaliciousLabel(observation.label)
  )
  const organic = observations.filter(
    (observation) => observation.label === "organic_user"
  )
  const predictedPositive = observations.filter(predictedMalicious)
  const truePositive = predictedPositive.filter((observation) =>
    isMaliciousLabel(observation.label)
  ).length
  const falsePositive = predictedPositive.length - truePositive
  const falseNegative = malicious.filter(
    (observation) => !predictedMalicious(observation)
  ).length
  const maliciousPrecision = ratio(
    truePositive,
    truePositive + falsePositive
  )
  const maliciousRecall = ratio(truePositive, truePositive + falseNegative)
  const maliciousF1 =
    maliciousPrecision === null ||
    maliciousRecall === null ||
    maliciousPrecision + maliciousRecall === 0
      ? null
      : (2 * maliciousPrecision * maliciousRecall) /
        (maliciousPrecision + maliciousRecall)

  const highConfidence = observations.filter(
    (observation) => observation.evidenceConfidence === "high"
  )
  const highConfidenceCorrect = highConfidence.filter((observation) =>
    observation.acceptableDecisions.includes(observation.predictedDecision)
  ).length

  const nonUserRiskLeakageCases = observations.filter(
    (observation) =>
      observation.label === "non_user_entity" &&
      observation.maliciousRiskExpectation === "absent" &&
      (observation.riskScore > 0 || observation.maliciousSignalCount > 0)
  ).length
  const insufficientDataRiskLeakageCases = observations.filter(
    (observation) =>
      observation.label === "insufficient_data" &&
      observation.maliciousRiskExpectation === "absent" &&
      (observation.riskScore > 0 || observation.maliciousSignalCount > 0)
  ).length

  const byChain = Object.fromEntries(
    Array.from(new Set(observations.map((observation) => observation.chain)))
      .sort()
      .map((chain) => [
        chain,
        buildSliceMetrics(
          observations.filter((observation) => observation.chain === chain)
        ),
      ])
  )
  const bySplit = {
    development: buildSliceMetrics(
      observations.filter((observation) => observation.split === "development")
    ),
    validation: buildSliceMetrics(
      observations.filter((observation) => observation.split === "validation")
    ),
    holdout: buildSliceMetrics(
      observations.filter((observation) => observation.split === "holdout")
    ),
  }

  const baseReport = {
    totalCases: observations.length,
    acceptableDecisionAccuracy: rounded(
      ratio(accepted, observations.length) ?? 0
    ) as number,
    exactDecisionAccuracy: rounded(
      ratio(exact, observations.length) ?? 0
    ) as number,
    maliciousPrecision: rounded(maliciousPrecision),
    maliciousRecall: rounded(maliciousRecall),
    maliciousF1: rounded(maliciousF1),
    maliciousContainmentRate: rounded(
      ratio(
        malicious.filter(
          (observation) => observation.predictedDecision !== "approved"
        ).length,
        malicious.length
      )
    ),
    criticalFalseApprovals: malicious.filter(
      (observation) => observation.predictedDecision === "approved"
    ).length,
    organicFalseRejectRate: rounded(
      ratio(
        organic.filter(
          (observation) => observation.predictedDecision === "rejected"
        ).length,
        organic.length
      )
    ),
    manualReviewRate: rounded(
      ratio(
        observations.filter(
          (observation) => observation.predictedDecision === "manual_review"
        ).length,
        observations.length
      ) ?? 0
    ) as number,
    highConfidenceAccuracy: rounded(
      ratio(highConfidenceCorrect, highConfidence.length)
    ),
    semanticRiskLeakageCases:
      nonUserRiskLeakageCases + insufficientDataRiskLeakageCases,
    nonUserRiskLeakageCases,
    insufficientDataRiskLeakageCases,
    confusionMatrix,
    byChain,
    bySplit,
  }

  return {
    ...baseReport,
    operationalGate: buildOperationalGate(baseReport, thresholds),
    claimReadiness: buildClaimReadiness(observations, thresholds),
  }
}
