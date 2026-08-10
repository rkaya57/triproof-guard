import {
  preHoldoutBenchmarkCases,
  runPreHoldoutBenchmark,
  type PreHoldoutBenchmarkCase,
} from "./pre-holdout-benchmark"

export type PreHoldoutReadiness = {
  schemaVersion: 1
  ready: boolean
  totalCases: number
  passedCases: number
  failedCaseIds: string[]
  coverage: {
    hasSafe: boolean
    hasCaution: boolean
    hasHighRisk: boolean
    hasCritical: boolean
    hasDegradedSourceCase: boolean
    hasSameProviderCase: boolean
    hasTransactionCase: boolean
    hasInternalEvidenceCase: boolean
  }
  blockers: string[]
}

export function assessPreHoldoutReadiness(
  cases: PreHoldoutBenchmarkCase[] = preHoldoutBenchmarkCases,
): PreHoldoutReadiness {
  const results = runPreHoldoutBenchmark(cases)
  const failedCaseIds = results.filter((item) => !item.passed).map((item) => item.id)
  const levels = new Set(results.map((item) => item.actual.proposedRiskLevel))
  const ids = new Set(results.map((item) => item.id))

  const coverage = {
    hasSafe: levels.has("SAFE"),
    hasCaution: levels.has("CAUTION"),
    hasHighRisk: levels.has("HIGH_RISK"),
    hasCritical: levels.has("CRITICAL"),
    hasDegradedSourceCase: ids.has("degraded-phishing-plus-brand"),
    hasSameProviderCase: ids.has("same-provider-identity-market") && ids.has("same-rpc-authority-distribution"),
    hasTransactionCase: ids.has("transaction-capabilities-only") && ids.has("phishing-plus-unlimited-approval"),
    hasInternalEvidenceCase: ids.has("internal-human-risk-alone") && ids.has("internal-human-plus-phishing"),
  }

  const blockers: string[] = []
  if (results.length < 12) blockers.push("Benchmark must contain at least 12 adversarial/clean cases.")
  if (failedCaseIds.length) blockers.push(`${failedCaseIds.length} benchmark case(s) violate their expected invariant.`)
  if (!coverage.hasSafe) blockers.push("SAFE bounding coverage is missing.")
  if (!coverage.hasCaution) blockers.push("CAUTION/review coverage is missing.")
  if (!coverage.hasHighRisk) blockers.push("HIGH_RISK corroboration coverage is missing.")
  if (!coverage.hasCritical) blockers.push("CRITICAL three-source coverage is missing.")
  if (!coverage.hasDegradedSourceCase) blockers.push("Degraded-provider freshness coverage is missing.")
  if (!coverage.hasSameProviderCase) blockers.push("Same-provider self-corroboration coverage is missing.")
  if (!coverage.hasTransactionCase) blockers.push("Transaction-impact coverage is missing.")
  if (!coverage.hasInternalEvidenceCase) blockers.push("Internal-evidence bounding coverage is missing.")

  return {
    schemaVersion: 1,
    ready: blockers.length === 0,
    totalCases: results.length,
    passedCases: results.length - failedCaseIds.length,
    failedCaseIds,
    coverage,
    blockers,
  }
}
