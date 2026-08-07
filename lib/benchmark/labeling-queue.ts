import { createHash } from "node:crypto"

export const REAL_WORLD_LABELING_SCHEMA_VERSION =
  "tri-proof-real-world-labeling-v2" as const

export type RealWorldLabelingCohort = "representative" | "challenge"

export type LabelingCandidateBase = {
  walletId: string
  analysisId: string
  projectId: string
  chain: string
  walletAddress: string
  createdAt: Date
  engineStatus: string
}

function stableHex(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

export function opaqueId(prefix: string, value: string, length = 16) {
  return `${prefix}-${stableHex(value).slice(0, length)}`
}

function comparableAddress(chain: string, address: string) {
  return /^(ethereum|base|arbitrum|optimism|polygon|bnb|bsc)$/i.test(chain)
    ? address.toLowerCase()
    : address
}

/**
 * The same wallet may appear in multiple historical analyses. Keep one stable,
 * most-recent candidate so the same participant cannot leak across benchmark
 * splits or be reviewed twice as if it were independent evidence.
 */
export function deduplicateLabelingCandidates<
  T extends LabelingCandidateBase,
>(candidates: T[]): T[] {
  const ordered = [...candidates].sort((left, right) => {
    const dateDifference = right.createdAt.getTime() - left.createdAt.getTime()
    if (dateDifference !== 0) return dateDifference
    return `${left.analysisId}:${left.walletId}`.localeCompare(
      `${right.analysisId}:${right.walletId}`
    )
  })

  const seen = new Set<string>()
  const result: T[] = []
  ordered.forEach((candidate) => {
    const key = `${candidate.chain.toLowerCase()}:${comparableAddress(
      candidate.chain,
      candidate.walletAddress
    )}`
    if (seen.has(key)) return
    seen.add(key)
    result.push(candidate)
  })
  return result
}

/**
 * Claim-eligible sampling is deliberately independent of engine status, score,
 * cluster membership, or reason codes. It samples a fixed number of wallets
 * per campaign/project and orders them only by a stable hash of public/input
 * identity. This prevents the model from choosing its own evaluation set.
 */
export function selectRepresentativeCandidates<
  T extends LabelingCandidateBase,
>(candidates: T[], perProject = 6): T[] {
  const deduplicated = deduplicateLabelingCandidates(candidates)
  const buckets = new Map<string, T[]>()

  deduplicated.forEach((candidate) => {
    const bucket = buckets.get(candidate.projectId) ?? []
    bucket.push(candidate)
    buckets.set(candidate.projectId, bucket)
  })

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([projectId, bucket]) =>
      [...bucket]
        .sort((left, right) =>
          stableHex(
            `${projectId}:${left.chain}:${comparableAddress(
              left.chain,
              left.walletAddress
            )}`
          ).localeCompare(
            stableHex(
              `${projectId}:${right.chain}:${comparableAddress(
                right.chain,
                right.walletAddress
              )}`
            )
          )
        )
        .slice(0, Math.max(1, perProject))
    )
}

/**
 * Challenge sampling is intentionally allowed to use hidden engine status to
 * discover false positives/negatives faster. These cases are never
 * claim-eligible and are excluded from external-readiness counts.
 */
export function selectChallengeCandidates<T extends LabelingCandidateBase>(
  candidates: T[],
  representative: T[],
  limit = 120
): T[] {
  const representativeKeys = new Set(
    representative.map((candidate) => `${candidate.analysisId}:${candidate.walletId}`)
  )
  const remaining = deduplicateLabelingCandidates(candidates).filter(
    (candidate) =>
      !representativeKeys.has(`${candidate.analysisId}:${candidate.walletId}`)
  )

  const buckets = new Map<string, T[]>()
  remaining.forEach((candidate) => {
    const bucketKey = `${candidate.chain}:${candidate.engineStatus}`
    const bucket = buckets.get(bucketKey) ?? []
    bucket.push(candidate)
    buckets.set(bucketKey, bucket)
  })

  const orderedKeys = Array.from(buckets.keys()).sort()
  orderedKeys.forEach((bucketKey) => {
    buckets.get(bucketKey)?.sort((left, right) =>
      stableHex(`${left.analysisId}:${left.walletId}`).localeCompare(
        stableHex(`${right.analysisId}:${right.walletId}`)
      )
    )
  })

  const selected: T[] = []
  let index = 0
  while (selected.length < Math.max(0, limit)) {
    let added = false
    for (const bucketKey of orderedKeys) {
      const candidate = buckets.get(bucketKey)?.[index]
      if (candidate && selected.length < limit) {
        selected.push(candidate)
        added = true
      }
    }
    if (!added) break
    index += 1
  }
  return selected
}

/**
 * Real-world labels reserve most independent campaign groups for holdout.
 * Synthetic/adversarial fixtures already provide abundant development safety
 * coverage, so a 20/20/60 split reaches an auditable holdout without requiring
 * hundreds of unnecessary human labels.
 */
export function deterministicRealWorldSplit(groupKey: string) {
  const value = Number.parseInt(stableHex(groupKey).slice(0, 8), 16) % 100
  if (value < 20) return "development" as const
  if (value < 40) return "validation" as const
  return "holdout" as const
}

export function claimEligibleForCohort(cohort: RealWorldLabelingCohort) {
  return cohort === "representative"
}
