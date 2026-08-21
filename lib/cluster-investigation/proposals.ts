import { chainAddressKey } from "@/lib/address-normalization"
import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"

export const CLUSTER_ANALYST_PROPOSAL_SCHEMA_VERSION = "tri-proof-cluster-analyst-proposal-v1" as const
export const MAX_SPLIT_PROPOSAL_MEMBERS = 500
export const MIN_ANALYST_PROPOSAL_NOTES = 8
export const MAX_ANALYST_PROPOSAL_NOTES = 4000

export const clusterAnalystProposalTypes = [
  "mark_likely_legitimate",
  "mark_suspicious",
  "needs_review",
  "merge_clusters",
  "split_cluster",
  "analyst_note",
] as const

export type ClusterAnalystProposalType = (typeof clusterAnalystProposalTypes)[number]

export type ClusterAnalystProposalMemberRef = {
  walletAddress: string
  chain: string
}

export type ClusterAnalystProposalPayload =
  | { targetClusterLabel: string }
  | { members: ClusterAnalystProposalMemberRef[] }
  | Record<string, never>

export type NormalizedClusterAnalystProposal = {
  proposalType: ClusterAnalystProposalType
  payload: ClusterAnalystProposalPayload
  notes: string
}

export type ClusterAnalystProposalRecord = {
  id: string
  analysisId: string
  clusterLabel: string
  analystId: string
  analystName: string
  proposalType: ClusterAnalystProposalType
  payload: ClusterAnalystProposalPayload
  notes: string | null
  source: string
  createdAt: string
}

type SplitNormalizationResult =
  | { members: ClusterAnalystProposalMemberRef[]; error: null }
  | { members: null; error: string }

export function normalizeClusterAnalystProposalType(value: unknown): ClusterAnalystProposalType | null {
  return clusterAnalystProposalTypes.includes(value as ClusterAnalystProposalType)
    ? (value as ClusterAnalystProposalType)
    : null
}

export function clusterAnalystProposalLabel(value: ClusterAnalystProposalType) {
  if (value === "mark_likely_legitimate") return "Likely legitimate context"
  if (value === "mark_suspicious") return "Suspicious pattern"
  if (value === "needs_review") return "Needs review"
  if (value === "merge_clusters") return "Propose cluster merge"
  if (value === "split_cluster") return "Propose cluster split"
  return "Analyst note"
}

export function normalizeProposalNotes(value: unknown) {
  if (typeof value !== "string") return null
  const notes = value.trim().slice(0, MAX_ANALYST_PROPOSAL_NOTES)
  return notes.length >= MIN_ANALYST_PROPOSAL_NOTES ? notes : null
}

function normalizeMemberRef(value: unknown): ClusterAnalystProposalMemberRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const candidate = value as { walletAddress?: unknown; chain?: unknown }
  if (typeof candidate.walletAddress !== "string" || typeof candidate.chain !== "string") return null
  const walletAddress = candidate.walletAddress.trim()
  const chain = candidate.chain.trim()
  if (!walletAddress || !chain) return null
  return { walletAddress, chain }
}

function normalizeSplitMembers(
  report: ClusterInvestigationReport,
  rawMembers: unknown,
): SplitNormalizationResult {
  if (!Array.isArray(rawMembers)) return { members: null, error: "split_cluster requires a members array" }
  if (rawMembers.length < 1) return { members: null, error: "split_cluster requires at least one member" }
  if (rawMembers.length > MAX_SPLIT_PROPOSAL_MEMBERS) {
    return {
      members: null,
      error: `split_cluster is limited to ${MAX_SPLIT_PROPOSAL_MEMBERS} proposed members in v1`,
    }
  }

  const currentByKey = new Map(
    report.members.map((member) => [
      chainAddressKey(member.walletAddress, member.chain),
      { walletAddress: member.walletAddress, chain: member.chain },
    ]),
  )
  const normalized: ClusterAnalystProposalMemberRef[] = []
  const seen = new Set<string>()

  for (const rawMember of rawMembers) {
    const member = normalizeMemberRef(rawMember)
    if (!member) {
      return { members: null, error: "split_cluster members must include walletAddress and chain" }
    }
    const key = chainAddressKey(member.walletAddress, member.chain)
    const current = currentByKey.get(key)
    if (!current) return { members: null, error: "split_cluster can only reference current cluster members" }
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(current)
  }

  if (!normalized.length) {
    return { members: null, error: "split_cluster requires at least one unique current member" }
  }
  if (normalized.length >= report.members.length) {
    return { members: null, error: "split_cluster must leave at least one wallet in the stored cluster" }
  }

  return { members: normalized, error: null }
}

export function normalizeClusterAnalystProposal(
  report: ClusterInvestigationReport,
  input: { proposalType?: unknown; payload?: unknown; notes?: unknown },
): { proposal: NormalizedClusterAnalystProposal | null; error: string | null } {
  const proposalType = normalizeClusterAnalystProposalType(input.proposalType)
  if (!proposalType) {
    return { proposal: null, error: `proposalType must be one of: ${clusterAnalystProposalTypes.join(", ")}` }
  }

  const notes = normalizeProposalNotes(input.notes)
  if (!notes) {
    return {
      proposal: null,
      error: `notes must contain at least ${MIN_ANALYST_PROPOSAL_NOTES} characters and no more than ${MAX_ANALYST_PROPOSAL_NOTES}`,
    }
  }

  const rawPayload = input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
    ? (input.payload as Record<string, unknown>)
    : {}

  if (proposalType === "merge_clusters") {
    const targetClusterLabel = typeof rawPayload.targetClusterLabel === "string"
      ? rawPayload.targetClusterLabel.trim()
      : ""
    if (!targetClusterLabel) {
      return { proposal: null, error: "merge_clusters requires targetClusterLabel" }
    }
    if (targetClusterLabel === report.cluster.clusterLabel) {
      return { proposal: null, error: "merge_clusters target must be a different stored cluster" }
    }
    return { proposal: { proposalType, payload: { targetClusterLabel }, notes }, error: null }
  }

  if (proposalType === "split_cluster") {
    const split = normalizeSplitMembers(report, rawPayload.members)
    if (split.error) return { proposal: null, error: split.error }
    return { proposal: { proposalType, payload: { members: split.members }, notes }, error: null }
  }

  return { proposal: { proposalType, payload: {}, notes }, error: null }
}

export function clusterAnalystProposalBoundaries() {
  return [
    "Analyst proposals are append-only investigation records and do not apply themselves.",
    "A proposal does not change stored cluster membership, wallet risk scores, wallet status, inferred archetypes, or campaign policy.",
    "Likely legitimate, suspicious, and needs-review proposals are analyst hypotheses rather than wallet-owner identity or malicious-intent findings.",
    "Merge and split proposals describe a possible future organization of investigation units; no membership mutation endpoint exists in v1.",
    "Neutralized infrastructure evidence remains neutral and cannot be promoted into Sybil risk by an analyst proposal.",
  ]
}
