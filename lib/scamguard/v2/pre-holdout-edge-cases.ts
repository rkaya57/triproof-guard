import type { ScamGuardSignal } from "@/lib/scamguard/engine"
import type { PreHoldoutBenchmarkCase } from "./pre-holdout-benchmark"

function signal(code: string, severity: ScamGuardSignal["severity"] = "low"): ScamGuardSignal {
  return { code, severity, title: code, detail: code }
}

export const preHoldoutEdgeCases: PreHoldoutBenchmarkCase[] = [
  {
    id: "brand-only-typosquat",
    description: "A local brand typosquat without independent threat intelligence stays at CAUTION.",
    signals: [signal("V2_BRAND_TYPOSQUAT", "medium")],
    expected: { proposedRiskLevel: "CAUTION", activationGate: "insufficient", confidence: "LOW", independentFamilies: 1, independentSources: 1 },
  },
  {
    id: "embedded-brand-only",
    description: "Weak embedded-brand evidence alone remains SAFE.",
    signals: [signal("V2_BRAND_EMBEDDED_BRAND", "low")],
    expected: { proposedRiskLevel: "SAFE", activationGate: "insufficient", confidence: "LOW", independentFamilies: 1, independentSources: 1 },
  },
  {
    id: "canonical-mismatch-only",
    description: "A canonical identity mismatch is strong but cannot self-activate without another source.",
    signals: [signal("V2_CANONICAL_IDENTITY_MISMATCH", "critical")],
    expected: { proposedRiskLevel: "CAUTION", activationGate: "single_strong_source", confidence: "MEDIUM", independentFamilies: 1, independentSources: 1 },
  },
  {
    id: "unknown-signal-neutrality",
    description: "Unrecognized signal codes must not affect V2 scoring.",
    signals: [signal("V2_UNKNOWN_FUTURE_SIGNAL", "critical")],
    expected: { proposedRiskLevel: "SAFE", activationGate: "insufficient", confidence: "LOW", independentFamilies: 0, independentSources: 0 },
  },
  {
    id: "market-plus-authority-below-high",
    description: "Two contextual families from different providers remain below HIGH_RISK when the score is weak.",
    signals: [
      signal("V2_VERY_LOW_TOKEN_LIQUIDITY", "medium"),
      signal("V2_VERY_LOW_HOLDER_COUNT", "medium"),
      signal("V2_TOKEN2022_PERMANENTDELEGATE", "medium"),
      signal("V2_TOKEN2022_TRANSFERHOOK", "medium"),
    ],
    expected: { proposedRiskLevel: "CAUTION", activationGate: "insufficient", confidence: "LOW", independentFamilies: 2, independentSources: 2 },
  },
  {
    id: "identity-plus-distribution-below-threshold",
    description: "Canonical mismatch plus distribution context remains below HIGH_RISK at the 54-point boundary.",
    signals: [
      signal("V2_CANONICAL_IDENTITY_MISMATCH", "critical"),
      signal("V2_HIGH_LARGEST_TOKEN_ACCOUNT_CONCENTRATION"),
      signal("V2_HIGH_TOP10_TOKEN_ACCOUNT_CONCENTRATION"),
    ],
    expected: { proposedRiskLevel: "CAUTION", activationGate: "single_strong_source", confidence: "MEDIUM", independentFamilies: 2, independentSources: 2 },
  },
  {
    id: "brand-plus-transaction-high",
    description: "Brand impersonation plus a high-impact transaction may propose HIGH_RISK.",
    signals: [
      signal("V2_BRAND_TYPOSQUAT", "medium"),
      signal("V2_TX_UNLIMITED_APPROVAL", "medium"),
      signal("V2_TX_AUTHORITY_CONTROL", "medium"),
    ],
    expected: { proposedRiskLevel: "HIGH_RISK", activationGate: "corroborated", confidence: "HIGH", independentFamilies: 2, independentSources: 2 },
  },
  {
    id: "internal-human-plus-transaction-high",
    description: "Human-confirmed risk plus high-impact signing may propose HIGH_RISK in live/shadow mode.",
    signals: [
      signal("V2_INTERNAL_CONFIRMED_RISK", "medium"),
      signal("V2_TX_UNLIMITED_APPROVAL", "medium"),
      signal("V2_TX_DELEGATE_RIGHTS", "medium"),
    ],
    expected: { proposedRiskLevel: "HIGH_RISK", activationGate: "corroborated", confidence: "HIGH", independentFamilies: 2, independentSources: 2 },
  },
  {
    id: "degraded-identity-plus-authority",
    description: "A degraded identity provider cannot combine with Solana authority evidence to create HIGH_RISK.",
    signals: [
      signal("V2_CANONICAL_IDENTITY_MISMATCH", "critical"),
      signal("V2_TOKEN2022_PERMANENTDELEGATE", "medium"),
    ],
    activationEligibleSources: ["solana-rpc"],
    expected: { proposedRiskLevel: "CAUTION", activationGate: "insufficient", confidence: "LOW", independentFamilies: 2, independentSources: 1 },
  },
  {
    id: "three-families-one-source-degraded",
    description: "Three observed families cannot become CRITICAL when one of the three source groups is degraded.",
    signals: [
      signal("V2_ACTIVE_PHISHING_FEED_MATCH", "critical"),
      signal("V2_BRAND_TYPOSQUAT", "medium"),
      signal("V2_CANONICAL_IDENTITY_MISMATCH", "critical"),
    ],
    activationEligibleSources: ["phishing.database", "local-brand-registry"],
    expected: { proposedRiskLevel: "HIGH_RISK", activationGate: "corroborated", confidence: "HIGH", independentFamilies: 3, independentSources: 2 },
  },
  {
    id: "transaction-plus-authority-context",
    description: "Transaction impact plus authority context stays at CAUTION when total evidence is below activation threshold.",
    signals: [
      signal("V2_TX_UNLIMITED_APPROVAL", "medium"),
      signal("V2_TX_AUTHORITY_CONTROL", "medium"),
      signal("V2_TOKEN2022_PERMANENTDELEGATE", "medium"),
      signal("V2_TOKEN2022_TRANSFERHOOK", "medium"),
    ],
    expected: { proposedRiskLevel: "CAUTION", activationGate: "insufficient", confidence: "LOW", independentFamilies: 2, independentSources: 2 },
  },
  {
    id: "account-closure-only",
    description: "Account closure capability alone is informational and remains SAFE.",
    signals: [signal("V2_TX_ACCOUNT_CLOSURE", "medium")],
    expected: { proposedRiskLevel: "SAFE", activationGate: "insufficient", confidence: "LOW", independentFamilies: 1, independentSources: 1 },
  },
]
