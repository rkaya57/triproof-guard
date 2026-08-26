import type { ScamGuardRiskLevel } from "@/lib/scamguard/engine"

export type ScamGuardHoldoutGroundTruth = "benign" | "malicious"
export type ScamGuardHoldoutPrediction = "benign" | "review" | "malicious"

export type ScamGuardHoldoutCase = {
  id: string
  groundTruth: ScamGuardHoldoutGroundTruth
  v1RiskLevel: ScamGuardRiskLevel
  v2RiskLevel: ScamGuardRiskLevel
}

export type ScamGuardHoldoutMetrics = {
  total: number
  decisive: number
  reviews: number
  reviewRate: number
  decisiveCoverage: number
  tp: number
  tn: number
  fp: number
  fn: number
  precision: number | null
  recall: number | null
  specificity: number | null
  falsePositiveRate: number | null
  falseNegativeRate: number | null
  accuracy: number | null
}

export type ScamGuardHoldoutComparison = {
  schemaVersion: 1
  v1: ScamGuardHoldoutMetrics
  v2: ScamGuardHoldoutMetrics
  deltas: {
    reviewRate: number
    decisiveCoverage: number
    precision: number | null
    recall: number | null
    falsePositiveRate: number | null
    falseNegativeRate: number | null
    accuracy: number | null
  }
}

export function predictionFromRiskLevel(level: ScamGuardRiskLevel): ScamGuardHoldoutPrediction {
  if (level === "SAFE") return "benign"
  if (level === "CAUTION") return "review"
  return "malicious"
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

function evaluate(
  cases: ScamGuardHoldoutCase[],
  selectRisk: (item: ScamGuardHoldoutCase) => ScamGuardRiskLevel,
): ScamGuardHoldoutMetrics {
  let reviews = 0
  let tp = 0
  let tn = 0
  let fp = 0
  let fn = 0

  for (const item of cases) {
    const prediction = predictionFromRiskLevel(selectRisk(item))
    if (prediction === "review") {
      reviews += 1
      continue
    }

    if (prediction === "malicious" && item.groundTruth === "malicious") tp += 1
    else if (prediction === "benign" && item.groundTruth === "benign") tn += 1
    else if (prediction === "malicious" && item.groundTruth === "benign") fp += 1
    else if (prediction === "benign" && item.groundTruth === "malicious") fn += 1
  }

  const decisive = tp + tn + fp + fn
  return {
    total: cases.length,
    decisive,
    reviews,
    reviewRate: cases.length ? reviews / cases.length : 0,
    decisiveCoverage: cases.length ? decisive / cases.length : 0,
    tp,
    tn,
    fp,
    fn,
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    specificity: ratio(tn, tn + fp),
    falsePositiveRate: ratio(fp, fp + tn),
    falseNegativeRate: ratio(fn, fn + tp),
    accuracy: ratio(tp + tn, decisive),
  }
}

function delta(next: number | null, previous: number | null): number | null {
  return next === null || previous === null ? null : next - previous
}

export function evaluateScamGuardHoldout(cases: ScamGuardHoldoutCase[]): ScamGuardHoldoutComparison {
  const ids = new Set<string>()
  for (const item of cases) {
    const id = item.id.trim()
    if (!id) throw new Error("Holdout case id is required")
    if (ids.has(id)) throw new Error(`Duplicate holdout case id: ${id}`)
    ids.add(id)
  }

  const v1 = evaluate(cases, (item) => item.v1RiskLevel)
  const v2 = evaluate(cases, (item) => item.v2RiskLevel)

  return {
    schemaVersion: 1,
    v1,
    v2,
    deltas: {
      reviewRate: v2.reviewRate - v1.reviewRate,
      decisiveCoverage: v2.decisiveCoverage - v1.decisiveCoverage,
      precision: delta(v2.precision, v1.precision),
      recall: delta(v2.recall, v1.recall),
      falsePositiveRate: delta(v2.falsePositiveRate, v1.falsePositiveRate),
      falseNegativeRate: delta(v2.falseNegativeRate, v1.falseNegativeRate),
      accuracy: delta(v2.accuracy, v1.accuracy),
    },
  }
}
