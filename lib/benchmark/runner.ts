import { buildExplainableDecision } from "@/lib/campaign-security/decision-evidence"
import { analyzeWallets } from "@/lib/risk-engine"
import { normalizeAnalysisSemantics } from "@/lib/risk-engine/semantic-safety"
import type { WalletRiskResult } from "@/types"

import {
  calculateBenchmarkMetrics,
  DEFAULT_BENCHMARK_THRESHOLDS,
  type BenchmarkMetricThresholds,
  type BenchmarkMetricsReport,
  type BenchmarkObservation,
} from "./metrics"
import {
  asParsedWallet,
  asRiskPolicy,
  type BenchmarkScenario,
  type LabeledBenchmarkDataset,
} from "./schema"

export type BenchmarkScenarioCheck = {
  scenarioId: string
  passed: boolean
  clusterCount: number
  minClusters: number | null
  maxClusters: number | null
  errors: string[]
}

export type LabeledBenchmarkRunReport = {
  datasetVersion: string
  generatedAt: string
  totalScenarios: number
  observations: BenchmarkObservation[]
  scenarioChecks: BenchmarkScenarioCheck[]
  metrics: BenchmarkMetricsReport
}

function comparableAddress(address: string) {
  return address.startsWith("0x") ? address.toLowerCase() : address
}

function resultForCase(
  wallets: WalletRiskResult[],
  walletAddress: string
): WalletRiskResult {
  const target = comparableAddress(walletAddress)
  const result = wallets.find(
    (wallet) => comparableAddress(wallet.walletAddress) === target
  )
  if (!result) {
    throw new Error(`Benchmark result missing wallet ${walletAddress}`)
  }
  return result
}

function checkScenario(
  scenario: BenchmarkScenario,
  clusterCount: number
): BenchmarkScenarioCheck {
  const errors: string[] = []
  const minClusters = scenario.expectations.minClusters ?? null
  const maxClusters = scenario.expectations.maxClusters ?? null

  if (minClusters !== null && clusterCount < minClusters) {
    errors.push(
      `Expected at least ${minClusters} clusters but observed ${clusterCount}.`
    )
  }
  if (maxClusters !== null && clusterCount > maxClusters) {
    errors.push(
      `Expected at most ${maxClusters} clusters but observed ${clusterCount}.`
    )
  }

  return {
    scenarioId: scenario.id,
    passed: errors.length === 0,
    clusterCount,
    minClusters,
    maxClusters,
    errors,
  }
}

function maliciousRiskFamilyCount(
  decision: ReturnType<typeof buildExplainableDecision>
) {
  return new Set(
    decision.evidence
      .filter((item) => item.effect === "risk_signal")
      .map((item) => item.family)
  ).size
}

export function runLabeledBenchmark(
  dataset: LabeledBenchmarkDataset,
  thresholds: BenchmarkMetricThresholds = DEFAULT_BENCHMARK_THRESHOLDS
): LabeledBenchmarkRunReport {
  const observations: BenchmarkObservation[] = []
  const scenarioChecks: BenchmarkScenarioCheck[] = []

  dataset.scenarios.forEach((scenario) => {
    const rawResult = analyzeWallets(
      scenario.cases.map((benchmarkCase) =>
        asParsedWallet(benchmarkCase.input)
      ),
      null,
      asRiskPolicy(scenario.riskPolicy)
    )
    const result = normalizeAnalysisSemantics(rawResult)
    scenarioChecks.push(checkScenario(scenario, result.clusters.length))

    scenario.cases.forEach((benchmarkCase) => {
      const prediction = resultForCase(
        result.wallets,
        benchmarkCase.input.walletAddress
      )
      const explainableDecision = buildExplainableDecision(prediction)

      observations.push({
        scenarioId: scenario.id,
        caseId: benchmarkCase.id,
        chain: scenario.chain,
        split: scenario.split,
        provenanceKind: scenario.provenance.kind,
        label: benchmarkCase.groundTruth.label,
        expectedDecision: benchmarkCase.groundTruth.expectedDecision,
        acceptableDecisions:
          benchmarkCase.groundTruth.acceptableDecisions,
        maliciousRiskExpectation:
          benchmarkCase.groundTruth.maliciousRiskExpectation,
        predictedDecision: prediction.status,
        riskScore: prediction.riskScore,
        evidenceConfidence: explainableDecision.evidenceConfidence,
        independentRiskFamilyCount:
          maliciousRiskFamilyCount(explainableDecision),
      })
    })
  })

  const metrics = calculateBenchmarkMetrics(observations, thresholds)
  const failedScenarioChecks = scenarioChecks.filter((check) => !check.passed)
  if (failedScenarioChecks.length > 0) {
    metrics.operationalGate.checks.push({
      name: "scenario_cluster_expectations",
      passed: false,
      actual: failedScenarioChecks.length,
      required: "= 0 failed scenarios",
    })
    metrics.operationalGate.passed = false
  } else {
    metrics.operationalGate.checks.push({
      name: "scenario_cluster_expectations",
      passed: true,
      actual: true,
      required: "all scenario expectations satisfied",
    })
  }

  return {
    datasetVersion: dataset.datasetVersion,
    generatedAt: new Date().toISOString(),
    totalScenarios: dataset.scenarios.length,
    observations,
    scenarioChecks,
    metrics,
  }
}

function percent(value: number | null) {
  return value === null ? "n/a" : `${(value * 100).toFixed(2)}%`
}

export function formatBenchmarkMarkdown(
  report: LabeledBenchmarkRunReport
): string {
  const lines = [
    `# Tri-Proof Labeled Benchmark — ${report.datasetVersion}`,
    "",
    `Generated: ${report.generatedAt}`,
    `Scenarios: ${report.totalScenarios}`,
    `Cases: ${report.metrics.totalCases}`,
    "",
    "## Accuracy and safety",
    "",
    `- Operational gate: ${report.metrics.operationalGate.passed ? "PASS" : "FAIL"}`,
    `- Acceptable decision accuracy: ${percent(report.metrics.acceptableDecisionAccuracy)}`,
    `- Exact decision accuracy: ${percent(report.metrics.exactDecisionAccuracy)}`,
    `- Malicious precision: ${percent(report.metrics.maliciousPrecision)}`,
    `- Malicious recall: ${percent(report.metrics.maliciousRecall)}`,
    `- Malicious F1: ${percent(report.metrics.maliciousF1)}`,
    `- Malicious containment: ${percent(report.metrics.maliciousContainmentRate)}`,
    `- Critical false approvals: ${report.metrics.criticalFalseApprovals}`,
    `- Organic false reject rate: ${percent(report.metrics.organicFalseRejectRate)}`,
    `- High-confidence accuracy: ${percent(report.metrics.highConfidenceAccuracy)}`,
    `- Semantic risk leakage cases: ${report.metrics.semanticRiskLeakageCases}`,
    "",
    "## External accuracy-claim readiness",
    "",
    `- Ready: ${report.metrics.claimReadiness.ready ? "YES" : "NO"}`,
    `- Real-world holdout cases: ${report.metrics.claimReadiness.realWorldHoldoutCases}`,
    `- Real-world malicious cases: ${report.metrics.claimReadiness.realWorldMaliciousCases}`,
    `- Real-world organic cases: ${report.metrics.claimReadiness.realWorldOrganicCases}`,
    `- Represented chains: ${report.metrics.claimReadiness.representedChains}`,
  ]

  if (report.metrics.claimReadiness.reasons.length > 0) {
    lines.push("", "### Remaining evidence requirements", "")
    report.metrics.claimReadiness.reasons.forEach((reason) => {
      lines.push(`- ${reason}`)
    })
  }

  lines.push("", "## Operational gate checks", "")
  report.metrics.operationalGate.checks.forEach((check) => {
    lines.push(
      `- ${check.passed ? "PASS" : "FAIL"} — ${check.name}: ${String(check.actual)} (${check.required})`
    )
  })

  const failedScenarios = report.scenarioChecks.filter((check) => !check.passed)
  if (failedScenarios.length > 0) {
    lines.push("", "## Failed scenario expectations", "")
    failedScenarios.forEach((check) => {
      check.errors.forEach((error) => {
        lines.push(`- ${check.scenarioId}: ${error}`)
      })
    })
  }

  return `${lines.join("\n")}\n`
}
