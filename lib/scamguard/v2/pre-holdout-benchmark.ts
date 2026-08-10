import type { ScamGuardSignal } from "@/lib/scamguard/engine"
import {
  assessV2Corroboration,
  type V2CorroborationAssessment,
  type V2EvidenceSourceGroup,
} from "./corroboration"

export type PreHoldoutBenchmarkCase = {
  id: string
  description: string
  signals: ScamGuardSignal[]
  activationEligibleSources?: V2EvidenceSourceGroup[]
  expected: {
    proposedRiskLevel: V2CorroborationAssessment["proposedRiskLevel"]
    activationGate: V2CorroborationAssessment["activationGate"]
    confidence: V2CorroborationAssessment["confidence"]
    independentFamilies: number
    independentSources: number
  }
}

export type PreHoldoutBenchmarkResult = {
  id: string
  passed: boolean
  expected: PreHoldoutBenchmarkCase["expected"]
  actual: Pick<
    V2CorroborationAssessment,
    "proposedRiskLevel" | "activationGate" | "confidence"
  > & {
    independentFamilies: number
    independentSources: number
  }
}

function signal(code: string, severity: ScamGuardSignal["severity"] = "low"): ScamGuardSignal {
  return { code, severity, title: code, detail: code }
}

export const preHoldoutBenchmarkCases: PreHoldoutBenchmarkCase[] = [
  {
    id: "clean-no-evidence",
    description: "A clean scan with no V2 evidence must remain SAFE.",
    signals: [],
    expected: { proposedRiskLevel: "SAFE", activationGate: "insufficient", confidence: "LOW", independentFamilies: 0, independentSources: 0 },
  },
  {
    id: "weak-market-only",
    description: "Multiple weak market-health anomalies from one provider must not escalate.",
    signals: [
      signal("V2_VERY_LOW_TOKEN_LIQUIDITY", "medium"),
      signal("V2_VERY_LOW_HOLDER_COUNT", "medium"),
      signal("V2_UNUSUAL_VOLUME_TO_LIQUIDITY"),
      signal("V2_WEAK_MARKET_HEALTH_SCORE"),
    ],
    expected: { proposedRiskLevel: "SAFE", activationGate: "insufficient", confidence: "LOW", independentFamilies: 1, independentSources: 1 },
  },
  {
    id: "token2022-capabilities-only",
    description: "Token-2022 control capabilities are context, not standalone maliciousness.",
    signals: [
      signal("V2_TOKEN2022_PERMANENTDELEGATE", "medium"),
      signal("V2_TOKEN2022_TRANSFERHOOK", "medium"),
      signal("V2_TOKEN2022_PAUSABLECONFIG", "medium"),
    ],
    expected: { proposedRiskLevel: "SAFE", activationGate: "insufficient", confidence: "LOW", independentFamilies: 1, independentSources: 1 },
  },
  {
    id: "transaction-capabilities-only",
    description: "High-impact signing capabilities without independent threat evidence stay bounded.",
    signals: [
      signal("V2_TX_UNLIMITED_APPROVAL", "medium"),
      signal("V2_TX_AUTHORITY_CONTROL", "medium"),
      signal("V2_TX_DELEGATE_RIGHTS", "medium"),
    ],
    expected: { proposedRiskLevel: "SAFE", activationGate: "insufficient", confidence: "LOW", independentFamilies: 1, independentSources: 1 },
  },
  {
    id: "single-phishing-source",
    description: "One strong phishing source requests caution but cannot activate HIGH_RISK.",
    signals: [signal("V2_ACTIVE_PHISHING_FEED_MATCH", "critical")],
    expected: { proposedRiskLevel: "CAUTION", activationGate: "single_strong_source", confidence: "MEDIUM", independentFamilies: 1, independentSources: 1 },
  },
  {
    id: "same-provider-identity-market",
    description: "Canonical identity and market health from Tokens.xyz cannot self-corroborate.",
    signals: [
      signal("V2_CANONICAL_IDENTITY_MISMATCH", "critical"),
      signal("V2_VERY_LOW_TOKEN_LIQUIDITY", "medium"),
    ],
    expected: { proposedRiskLevel: "CAUTION", activationGate: "single_strong_source", confidence: "MEDIUM", independentFamilies: 2, independentSources: 1 },
  },
  {
    id: "same-rpc-authority-distribution",
    description: "Authority and distribution families sharing Solana RPC cannot manufacture source diversity.",
    signals: [
      signal("V2_TOKEN2022_PERMANENTDELEGATE", "medium"),
      signal("V2_TOKEN2022_TRANSFERHOOK", "medium"),
      signal("V2_HIGH_LARGEST_TOKEN_ACCOUNT_CONCENTRATION"),
      signal("V2_HIGH_TOP10_TOKEN_ACCOUNT_CONCENTRATION"),
    ],
    expected: { proposedRiskLevel: "CAUTION", activationGate: "insufficient", confidence: "LOW", independentFamilies: 2, independentSources: 1 },
  },
  {
    id: "degraded-phishing-plus-brand",
    description: "Stale/degraded phishing evidence remains visible but cannot help form HIGH_RISK.",
    signals: [
      signal("V2_ACTIVE_PHISHING_FEED_MATCH", "critical"),
      signal("V2_BRAND_TYPOSQUAT", "medium"),
    ],
    activationEligibleSources: ["local-brand-registry"],
    expected: { proposedRiskLevel: "CAUTION", activationGate: "insufficient", confidence: "LOW", independentFamilies: 2, independentSources: 1 },
  },
  {
    id: "phishing-plus-brand",
    description: "Independent phishing and brand impersonation may propose HIGH_RISK, never CRITICAL with only two sources.",
    signals: [
      signal("V2_ACTIVE_PHISHING_FEED_MATCH", "critical"),
      signal("V2_BRAND_TYPOSQUAT", "medium"),
    ],
    expected: { proposedRiskLevel: "HIGH_RISK", activationGate: "corroborated", confidence: "HIGH", independentFamilies: 2, independentSources: 2 },
  },
  {
    id: "phishing-plus-unlimited-approval",
    description: "Threat intelligence plus high-impact signing may propose HIGH_RISK.",
    signals: [
      signal("V2_ACTIVE_PHISHING_FEED_MATCH", "critical"),
      signal("V2_TX_UNLIMITED_APPROVAL", "medium"),
    ],
    expected: { proposedRiskLevel: "HIGH_RISK", activationGate: "corroborated", confidence: "HIGH", independentFamilies: 2, independentSources: 2 },
  },
  {
    id: "identity-plus-solana-authority",
    description: "Canonical mismatch corroborated by an independently queried authority surface may propose HIGH_RISK.",
    signals: [
      signal("V2_CANONICAL_IDENTITY_MISMATCH", "critical"),
      signal("V2_TOKEN2022_PERMANENTDELEGATE", "medium"),
    ],
    expected: { proposedRiskLevel: "HIGH_RISK", activationGate: "corroborated", confidence: "HIGH", independentFamilies: 2, independentSources: 2 },
  },
  {
    id: "internal-human-risk-alone",
    description: "Human-confirmed internal adjudication alone is not sufficient for activation.",
    signals: [signal("V2_INTERNAL_CONFIRMED_RISK", "medium")],
    expected: { proposedRiskLevel: "CAUTION", activationGate: "insufficient", confidence: "LOW", independentFamilies: 1, independentSources: 1 },
  },
  {
    id: "internal-human-plus-phishing",
    description: "Human-confirmed risk plus an independent external phishing source may propose HIGH_RISK in live/shadow mode.",
    signals: [
      signal("V2_INTERNAL_CONFIRMED_RISK", "medium"),
      signal("V2_ACTIVE_PHISHING_FEED_MATCH", "critical"),
    ],
    expected: { proposedRiskLevel: "HIGH_RISK", activationGate: "corroborated", confidence: "HIGH", independentFamilies: 2, independentSources: 2 },
  },
  {
    id: "three-source-critical",
    description: "CRITICAL requires three independently controlled strong evidence sources.",
    signals: [
      signal("V2_ACTIVE_PHISHING_FEED_MATCH", "critical"),
      signal("V2_BRAND_TYPOSQUAT", "medium"),
      signal("V2_CANONICAL_IDENTITY_MISMATCH", "critical"),
    ],
    expected: { proposedRiskLevel: "CRITICAL", activationGate: "corroborated", confidence: "HIGH", independentFamilies: 3, independentSources: 3 },
  },
]

export function runPreHoldoutBenchmark(cases: PreHoldoutBenchmarkCase[] = preHoldoutBenchmarkCases): PreHoldoutBenchmarkResult[] {
  const ids = new Set<string>()
  return cases.map((item) => {
    if (!item.id.trim()) throw new Error("Pre-Holdout benchmark case id is required")
    if (ids.has(item.id)) throw new Error(`Duplicate pre-Holdout benchmark case id: ${item.id}`)
    ids.add(item.id)

    const assessment = assessV2Corroboration(item.signals, {
      activationEligibleSources: item.activationEligibleSources,
    })
    const actual: PreHoldoutBenchmarkResult["actual"] = {
      proposedRiskLevel: assessment.proposedRiskLevel,
      activationGate: assessment.activationGate,
      confidence: assessment.confidence,
      independentFamilies: assessment.independentFamilies.length,
      independentSources: assessment.independentSources.length,
    }
    const passed = actual.proposedRiskLevel === item.expected.proposedRiskLevel
      && actual.activationGate === item.expected.activationGate
      && actual.confidence === item.expected.confidence
      && actual.independentFamilies === item.expected.independentFamilies
      && actual.independentSources === item.expected.independentSources

    return { id: item.id, passed, expected: item.expected, actual }
  })
}
