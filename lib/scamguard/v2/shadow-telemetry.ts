import type { ScamGuardChain, ScamGuardScanType } from "@/lib/scamguard/engine"
import type { V2ShadowDecision } from "@/lib/scamguard/v2/shadow-decision"

export type V2ShadowTelemetryRecord = {
  schemaVersion: 1
  mode: "shadow"
  scanType: ScamGuardScanType
  chain: ScamGuardChain
  relation: V2ShadowDecision["relation"]
  levelDelta: number
  v1RiskLevel: V2ShadowDecision["v1RiskLevel"]
  v2ProposedRiskLevel: V2ShadowDecision["v2ProposedRiskLevel"]
  activationGate: V2ShadowDecision["activationGate"]
  evidenceScore: number
  confidence: V2ShadowDecision["confidence"]
  independentFamilies: V2ShadowDecision["independentFamilies"]
  independentSources: V2ShadowDecision["independentSources"]
  providerCount: number
  availableProviders: number
  activationEligibleSources: number
  degradedOrUnavailableSources: number
  proposedSignalCount: number
  eligibleForActivationStudy: boolean
  containsRawTarget: false
  productionDecisionChanged: false
}

export function buildShadowTelemetryRecord(input: {
  scanType: ScamGuardScanType
  chain?: ScamGuardChain
  shadow: V2ShadowDecision
  providerCount: number
  availableProviders: number
  activationEligibleSources?: number
  degradedOrUnavailableSources?: number
  proposedSignalCount: number
}): V2ShadowTelemetryRecord {
  return {
    schemaVersion: 1,
    mode: "shadow",
    scanType: input.scanType,
    chain: input.chain ?? "unknown",
    relation: input.shadow.relation,
    levelDelta: input.shadow.levelDelta,
    v1RiskLevel: input.shadow.v1RiskLevel,
    v2ProposedRiskLevel: input.shadow.v2ProposedRiskLevel,
    activationGate: input.shadow.activationGate,
    evidenceScore: input.shadow.evidenceScore,
    confidence: input.shadow.confidence,
    independentFamilies: [...input.shadow.independentFamilies],
    independentSources: [...input.shadow.independentSources],
    providerCount: Math.max(0, Math.trunc(input.providerCount)),
    availableProviders: Math.max(0, Math.trunc(input.availableProviders)),
    activationEligibleSources: Math.max(0, Math.trunc(input.activationEligibleSources ?? input.shadow.independentSources.length)),
    degradedOrUnavailableSources: Math.max(0, Math.trunc(input.degradedOrUnavailableSources ?? 0)),
    proposedSignalCount: Math.max(0, Math.trunc(input.proposedSignalCount)),
    eligibleForActivationStudy: input.shadow.eligibleForActivationStudy,
    containsRawTarget: false,
    productionDecisionChanged: false,
  }
}
