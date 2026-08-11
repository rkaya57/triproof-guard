import type { ScamGuardV2Input, ScamGuardV2Observation } from "@/lib/scamguard/v2/evidence-fusion"
import { observeCalibratedScamGuardV2 } from "@/lib/scamguard/v2/calibrated-evidence-fusion"
import { compareShadowDecision } from "@/lib/scamguard/v2/shadow-decision"
import { buildShadowTelemetryRecord, type V2ShadowTelemetryRecord } from "@/lib/scamguard/v2/shadow-telemetry"

type V2Observer = (input: ScamGuardV2Input) => Promise<ScamGuardV2Observation>

export async function buildRuntimeShadowTelemetry(
  input: ScamGuardV2Input,
  observer: V2Observer = (value) => observeCalibratedScamGuardV2(value, { evaluationMode: "live" }),
): Promise<V2ShadowTelemetryRecord> {
  const observation = await observer(input)
  const shadow = compareShadowDecision(observation.base.riskLevel, observation.proposedAssessment)
  return buildShadowTelemetryRecord({
    scanType: input.type,
    chain: observation.base.metadata.chain,
    shadow,
    providerCount: observation.summary.providerCount,
    availableProviders: observation.summary.availableProviders,
    activationEligibleSources: observation.summary.activationEligibleSources,
    degradedOrUnavailableSources: observation.providerQuality.filter((item) => item.status !== "eligible").length,
    proposedSignalCount: observation.summary.proposedSignalCount,
    sourceContextPresent: Boolean(input.sourceUrl?.trim()),
  })
}

export async function emitRuntimeShadowTelemetry(input: ScamGuardV2Input) {
  try {
    const telemetry = await buildRuntimeShadowTelemetry(input)
    console.info("scamguard_v2_shadow", JSON.stringify(telemetry))
  } catch (error) {
    console.warn("scamguard_v2_shadow_failed", error instanceof Error ? error.message.slice(0, 240) : "unknown error")
  }
}
