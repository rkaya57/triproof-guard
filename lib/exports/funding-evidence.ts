import type {
  AnalysisDetail,
  DecisionEvidenceItem,
  WalletRiskResult,
} from "@/types"

export const CANONICAL_FUNDING_EVIDENCE_PREFIX = "CANONICAL_"

export function canonicalFundingEvidence(wallet: WalletRiskResult) {
  return (
    wallet.decisionEvidence?.evidence.filter(
      (item) =>
        item.family === "funding" &&
        item.code.startsWith(CANONICAL_FUNDING_EVIDENCE_PREFIX),
    ) ?? []
  )
}

export function canonicalFundingEvidenceCodes(wallet: WalletRiskResult) {
  return Array.from(new Set(canonicalFundingEvidence(wallet).map((item) => item.code)))
}

export function canonicalFundingEvidenceSummary(wallet: WalletRiskResult) {
  return Array.from(
    new Set(canonicalFundingEvidence(wallet).map((item) => item.description)),
  )
}

export type CanonicalFundingEvidenceReportSummary = {
  walletsWithEvidence: number
  evidenceItems: number
  riskSignals: number
  corroboratingSignals: number
  neutralizingContexts: number
  byCode: Array<{ code: string; count: number }>
}

export function summarizeCanonicalFundingEvidence(
  analysis: AnalysisDetail,
): CanonicalFundingEvidenceReportSummary {
  const items: DecisionEvidenceItem[] = []
  let walletsWithEvidence = 0

  analysis.wallets.forEach((wallet) => {
    const evidence = canonicalFundingEvidence(wallet)
    if (evidence.length > 0) walletsWithEvidence += 1
    items.push(...evidence)
  })

  const counts = new Map<string, number>()
  items.forEach((item) => counts.set(item.code, (counts.get(item.code) ?? 0) + 1))

  return {
    walletsWithEvidence,
    evidenceItems: items.length,
    riskSignals: items.filter((item) => item.effect === "risk_signal").length,
    corroboratingSignals: items.filter((item) => item.effect === "corroborating_signal").length,
    neutralizingContexts: items.filter((item) => item.effect === "neutralizing_context").length,
    byCode: Array.from(counts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code)),
  }
}
