import type { ScamGuardV2HoldoutChain, ScamGuardV2HoldoutGroundTruth, ScamGuardV2HoldoutSurface } from "./holdout-dataset-contract"
import type { ScamGuardV2SecondHoldoutRecord } from "./second-holdout-dataset-contract"

export type SecondHoldoutCandidate = {
  id: string
  projectId: string
  surface: ScamGuardV2HoldoutSurface
  chain: ScamGuardV2HoldoutChain
  groundTruth: ScamGuardV2HoldoutGroundTruth
  target: string
  sourceUrl?: string
  provenanceId: string
  source1Url: string
  source2Url?: string
  verificationStatus: "verified" | "provisional"
  evidenceQuality: "high" | "medium" | "low"
  collectedAt: string
  collectorNote?: string
}

export function toSecondHoldoutRecord(candidate: SecondHoldoutCandidate): ScamGuardV2SecondHoldoutRecord {
  return {
    id: candidate.id,
    projectId: candidate.projectId,
    surface: candidate.surface,
    chain: candidate.chain,
    groundTruth: candidate.groundTruth,
    target: candidate.target,
    sourceUrl: candidate.sourceUrl,
    provenanceId: candidate.provenanceId,
    source1Url: candidate.source1Url,
    source2Url: candidate.source2Url,
    verificationStatus: candidate.verificationStatus,
    evidenceQuality: candidate.evidenceQuality,
    collectedAt: candidate.collectedAt,
  }
}

export function candidateFingerprint(candidate: SecondHoldoutCandidate) {
  return [candidate.surface, candidate.chain, candidate.target.trim().toLowerCase()].join(":")
}

export function validateCandidateIntake(candidates: SecondHoldoutCandidate[]) {
  const blockers: string[] = []
  const ids = new Set<string>()
  const fingerprints = new Set<string>()
  const provenanceIds = new Set<string>()

  for (const candidate of candidates) {
    const id = candidate.id.trim()
    const fingerprint = candidateFingerprint(candidate)
    const provenanceId = candidate.provenanceId.trim()
    if (!id) blockers.push("Candidate id is required.")
    else if (ids.has(id)) blockers.push(`Duplicate candidate id: ${id}`)
    else ids.add(id)
    if (!candidate.target.trim()) blockers.push(`Candidate ${id || "<missing-id>"} requires target.`)
    if (fingerprints.endsWith(":")) blockers.push(`Candidate ${id || "<missing-id>"} has an invalid target fingerprint.`)
    else if (fingerprints.has(fingerprint)) blockers.push(`Duplicate candidate target: ${fingerprint}`)
    else fingerprints.add(fingerprint)
    if (!provenanceId) blockers.push(`Candidate ${id || "<missing-id>"} requires provenanceId.`)
    else if (provenanceIds.has(provenanceId)) blockers.push(`Duplicate provenanceId: ${provenanceId}`)
    else provenanceIds.add(provenanceId)
    if (!candidate.source1Url.trim()) blockers.push(`Candidate ${id || "<missing-id>"} requires source1Url.`)
    if (candidate.groundTruth === "malicious" && candidate.verificationStatus === "verified" && !candidate.source2Url?.trim()) {
      blockers.push(`Verified malicious candidate ${id || "<missing-id>"} requires source2Url.`)
    }
    if (candidate.surface === "transaction" && !candidate.sourceUrl?.trim()) {
      blockers.push(`Transaction candidate ${id || "<missing-id>"} requires sourceUrl during intake.`)
    }
    if (!Number.isFinite(Date.parse(candidate.collectedAt))) blockers.push(`Candidate ${id || "<missing-id>"} requires valid collectedAt.`)
  }

  return { valid: blockers.length === 0, blockers, total: candidates.length }
}
