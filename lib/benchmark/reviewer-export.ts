import { db } from "@/lib/db/prisma"
import {
  REAL_WORLD_LABELING_SCHEMA_VERSION,
  opaqueId,
  selectRepresentativeCandidates,
  type LabelingCandidateBase,
} from "@/lib/benchmark/labeling-queue"

export const REVIEWER_EXPORT_HEADERS = [
  "labeling_schema_version",
  "cohort",
  "scenario_id",
  "split_group_id",
  "case_id",
  "chain",
  "wallet_address",
  "campaign_type",
  "explorer_url",
  "review_evidence_json",
  "ground_truth_label",
  "expected_decision",
  "acceptable_decisions",
  "malicious_risk_expectation",
  "reviewer",
  "reviewed_at",
  "review_confidence",
  "rationale",
  "tags",
] as const

export const REVIEWER_EXPORT_FORBIDDEN_FIELDS = [
  "engine_status",
  "recommended_action",
  "risk_score",
  "risk_level",
  "cluster_id",
  "graph_component_id",
  "graph_risk_score",
  "entity_type",
  "entity_label",
  "status_explanation",
  "reasons_json",
  "bot_script_score",
  "behavior_diversity_score",
  "reputation_label",
  "policy_action",
] as const

type Candidate = LabelingCandidateBase & {
  id: string
  fundingSource: string | null
  txCount: number | null
  walletAgeDays: number | null
  totalVolume: number | null
  contractsCount: number | null
  campaignActionsCount: number | null
  firstSeen: Date | null
  lastSeen: Date | null
  nativeBalance: number | null
  tokenCount: number | null
  uniqueCounterparties: number | null
  lastActiveDaysAgo: number | null
  isContract: boolean | null
  enrichmentProvider: string | null
  campaignType: string
}

type Enrichment = {
  analysisId: string
  walletAddress: string
  chain: string
  provider: string
  rawData: unknown
  createdAt: Date
}

export type BlindReviewerRow = Record<(typeof REVIEWER_EXPORT_HEADERS)[number], string>

function rawObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function nullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null
}

function explorerUrl(chain: string, address: string) {
  const normalized = chain.trim().toLowerCase()
  if (normalized === "solana") {
    return `https://explorer.solana.com/address/${address}`
  }
  if (normalized === "base") return `https://basescan.org/address/${address}`
  if (normalized === "arbitrum") return `https://arbiscan.io/address/${address}`
  if (normalized === "optimism") return `https://optimistic.etherscan.io/address/${address}`
  if (normalized === "polygon") return `https://polygonscan.com/address/${address}`
  if (normalized === "bnb" || normalized === "bsc") {
    return `https://bscscan.com/address/${address}`
  }
  return `https://etherscan.io/address/${address}`
}

function addressKey(chain: string, analysisId: string, address: string) {
  const comparable = /^(ethereum|base|arbitrum|optimism|polygon|bnb|bsc)$/i.test(
    chain
  )
    ? address.toLowerCase()
    : address
  return `${analysisId}:${chain.toLowerCase()}:${comparable}`
}

export function reviewerEvidence(
  candidate: Candidate,
  enrichment: Enrichment | undefined
) {
  const raw = rawObject(enrichment?.rawData)
  return {
    txCount: candidate.txCount,
    walletAgeDays: candidate.walletAgeDays,
    fundingSource: candidate.fundingSource,
    firstFundingAt: nullableString(raw.firstFundingAt),
    firstFundingAmount: nullableNumber(raw.firstFundingAmount),
    historyTruncated: nullableBoolean(raw.historyTruncated),
    firstSeen: candidate.firstSeen?.toISOString() ?? null,
    lastSeen: candidate.lastSeen?.toISOString() ?? null,
    totalVolume: candidate.totalVolume,
    nativeBalance: candidate.nativeBalance,
    tokenCount: candidate.tokenCount,
    contractsCount: candidate.contractsCount,
    campaignActionsCount: candidate.campaignActionsCount,
    uniqueCounterparties: candidate.uniqueCounterparties,
    lastActiveDaysAgo: candidate.lastActiveDaysAgo,
    isContract: candidate.isContract,
    accountType: nullableString(raw.accountType),
    ownerProgram: nullableString(raw.ownerProgram),
    provider: enrichment?.provider ?? candidate.enrichmentProvider,
  }
}

export function buildBlindReviewerRow(
  candidate: Candidate,
  enrichment?: Enrichment
): BlindReviewerRow {
  return {
    labeling_schema_version: REAL_WORLD_LABELING_SCHEMA_VERSION,
    cohort: "representative",
    scenario_id: opaqueId("sc", candidate.analysisId),
    split_group_id: opaqueId("sg", candidate.projectId),
    case_id: opaqueId("rw", `${candidate.analysisId}:${candidate.id}`),
    chain: candidate.chain,
    wallet_address: candidate.walletAddress,
    campaign_type: candidate.campaignType,
    explorer_url: explorerUrl(candidate.chain, candidate.walletAddress),
    review_evidence_json: JSON.stringify(reviewerEvidence(candidate, enrichment)),
    ground_truth_label: "",
    expected_decision: "",
    acceptable_decisions: "",
    malicious_risk_expectation: "",
    reviewer: "",
    reviewed_at: "",
    review_confidence: "",
    rationale: "",
    tags: "",
  }
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

export function reviewerRowsToCsv(rows: BlindReviewerRow[]) {
  return [
    REVIEWER_EXPORT_HEADERS.map(csvCell).join(","),
    ...rows.map((row) =>
      REVIEWER_EXPORT_HEADERS.map((header) => csvCell(row[header])).join(",")
    ),
  ].join("\n")
}

export async function buildRepresentativeReviewerQueue(perProject = 20) {
  const candidateLimit = 20000
  const rawCandidates = await db.walletAnalysis.findMany({
    where: {
      teamReviews: { none: {} },
      analysis: { status: "completed" },
    },
    select: {
      id: true,
      analysisId: true,
      walletAddress: true,
      chain: true,
      fundingSource: true,
      txCount: true,
      walletAgeDays: true,
      totalVolume: true,
      contractsCount: true,
      campaignActionsCount: true,
      firstSeen: true,
      lastSeen: true,
      nativeBalance: true,
      tokenCount: true,
      uniqueCounterparties: true,
      lastActiveDaysAgo: true,
      isContract: true,
      enrichmentProvider: true,
      createdAt: true,
      analysis: {
        select: {
          projectId: true,
          project: {
            select: {
              campaignType: true,
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: candidateLimit,
  })

  if (rawCandidates.length >= candidateLimit) {
    throw new Error(
      `Candidate limit ${candidateLimit} reached; refusing a potentially incomplete reviewer export.`
    )
  }

  const candidates: Candidate[] = rawCandidates.map((candidate) => ({
    ...candidate,
    projectId: candidate.analysis.projectId,
    campaignType: candidate.analysis.project.campaignType,
    walletId: candidate.id,
    engineStatus: "hidden",
  }))

  const representative = selectRepresentativeCandidates(candidates, perProject)
  const analysisIds = Array.from(
    new Set(representative.map((candidate) => candidate.analysisId))
  )
  const enrichments = analysisIds.length
    ? await db.walletEnrichment.findMany({
        where: {
          analysisId: { in: analysisIds },
          enrichmentStatus: "completed",
        },
        select: {
          analysisId: true,
          walletAddress: true,
          chain: true,
          provider: true,
          rawData: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }],
      })
    : []

  const enrichmentByWallet = new Map<string, Enrichment>()
  enrichments.forEach((enrichment) => {
    const key = addressKey(
      enrichment.chain,
      enrichment.analysisId,
      enrichment.walletAddress
    )
    if (!enrichmentByWallet.has(key)) {
      enrichmentByWallet.set(key, enrichment)
    }
  })

  const rows = representative
    .map((candidate) =>
      buildBlindReviewerRow(
        candidate,
        enrichmentByWallet.get(
          addressKey(candidate.chain, candidate.analysisId, candidate.walletAddress)
        )
      )
    )
    .sort((left, right) =>
      `${left.scenario_id}:${left.case_id}`.localeCompare(
        `${right.scenario_id}:${right.case_id}`
      )
    )

  const byChain = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.chain] = (counts[row.chain] ?? 0) + 1
    return counts
  }, {})

  return {
    rows,
    summary: {
      schemaVersion: REAL_WORLD_LABELING_SCHEMA_VERSION,
      candidatePool: candidates.length,
      uniqueRepresentativeCases: rows.length,
      projects: new Set(representative.map((candidate) => candidate.projectId)).size,
      perProject,
      byChain,
    },
  }
}
