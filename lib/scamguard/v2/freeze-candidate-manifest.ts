import { assessPreHoldoutReadiness } from "./pre-holdout-readiness"

export const scamGuardV2FreezeCandidateManifest = {
  schemaVersion: 1,
  candidate: {
    branch: "feat/risk-engine-v2",
    v1BaselineSha: "d46a1e6655c1c8d95455eb36015da0de9df524b0",
    runtimePolicySha: "6a4e57d578e11652ac32bbe6a79836be615596aa",
    validationHeadSha: "06559957d420b03c1341d66a9bc07b90782a9ec4",
    mode: "observe_only" as const,
    productionDecisionChangesEnabled: false,
    automaticDowngradesEnabled: false,
  },
  policy: {
    cautionScore: 25,
    highRiskScore: 55,
    highRiskMinimumFamilies: 2,
    highRiskMinimumSources: 2,
    criticalScore: 80,
    criticalMinimumFamilies: 3,
    criticalMinimumSources: 3,
    providerFreshnessBoundMinutes: 60,
  },
  sourceGroups: [
    "phishing.database",
    "tokens.xyz",
    "local-brand-registry",
    "solana-rpc",
    "v1-transaction-decoder",
    "triproof-adjudication",
  ] as const,
  holdoutIsolation: {
    internalAdjudicationExcluded: true,
    internalGraphContextExcluded: true,
    productionDecisionChanged: false,
  },
  validation: {
    minimumPreHoldoutCases: 24,
    expectedPreHoldoutCases: 26,
    requiresTypeCheck: true,
    requiresFocusedLint: true,
    requiresEvmAdversarial: true,
    requiresSolanaAdversarial: true,
    requiresCrossSurfaceConsistency: true,
    requiresProviderQuality: true,
    requiresHoldoutLeakageGuard: true,
  },
  freezePolicy: {
    isActualFreeze: false,
    requiresExplicitFreezeCommitPin: true,
    requiresNoPolicyChangesAfterFreeze: true,
    requiresNoThresholdChangesAfterFreeze: true,
    requiresNoProviderWeightChangesAfterFreeze: true,
  },
} as const

export type ScamGuardV2FreezeCandidateStatus = {
  readyToFreeze: boolean
  actualFreezeCreated: false
  benchmarkCases: number
  blockers: string[]
}

export function assessV2FreezeCandidateStatus(): ScamGuardV2FreezeCandidateStatus {
  const readiness = assessPreHoldoutReadiness()
  const blockers = [...readiness.blockers]

  if (readiness.totalCases !== scamGuardV2FreezeCandidateManifest.validation.expectedPreHoldoutCases) {
    blockers.push(
      `Freeze-candidate manifest expects ${scamGuardV2FreezeCandidateManifest.validation.expectedPreHoldoutCases} pre-Holdout cases, found ${readiness.totalCases}.`,
    )
  }
  if (scamGuardV2FreezeCandidateManifest.candidate.productionDecisionChangesEnabled) {
    blockers.push("Production decision changes must remain disabled before the actual V2 freeze and Holdout.")
  }
  if (scamGuardV2FreezeCandidateManifest.candidate.automaticDowngradesEnabled) {
    blockers.push("Automatic V2 downgrades are prohibited before Holdout validation.")
  }
  if (!scamGuardV2FreezeCandidateManifest.holdoutIsolation.internalAdjudicationExcluded) {
    blockers.push("Internal adjudication must be excluded from Holdout evaluation.")
  }
  if (!scamGuardV2FreezeCandidateManifest.holdoutIsolation.internalGraphContextExcluded) {
    blockers.push("Internal graph context must be excluded from Holdout evaluation.")
  }

  return {
    readyToFreeze: blockers.length === 0,
    actualFreezeCreated: false,
    benchmarkCases: readiness.totalCases,
    blockers,
  }
}
