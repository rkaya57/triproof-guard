import { createHash } from "node:crypto"
import { gzipSync } from "node:zlib"

import { db } from "@/lib/db/prisma"
import {
  REAL_WORLD_LABELING_SCHEMA_VERSION,
  deterministicRealWorldSplit,
  opaqueId,
  selectRepresentativeCandidates,
  type LabelingCandidateBase,
} from "@/lib/benchmark/labeling-queue"
import {
  buildBlindReviewerRow,
  reviewerRowsToCsv,
} from "@/lib/benchmark/reviewer-export"

const AUDIT_HEADERS = [
  "labeling_schema_version",
  "selected_cohort",
  "claim_eligible",
  "scenario_id",
  "split_group_id",
  "case_id",
  "analysis_id",
  "project_id",
  "source_ref",
  "campaign_type",
  "analysis_mode",
  "chain",
  "wallet_address",
  "input_json",
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
] as const

type Candidate = LabelingCandidateBase & {
  id: string
  entityLabel: string | null
  entityType: string
  riskScore: number
  riskLevel: string
  status: string
  recommendedAction: string
  statusExplanation: string | null
  fundingSource: string | null
  txCount: number | null
  walletAgeDays: number | null
  totalVolume: number | null
  contractsCount: number | null
  campaignActionsCount: number | null
  clusterId: string | null
  graphComponentId: string | null
  graphRiskScore: number | null
  reasons: unknown
  firstSeen: Date | null
  lastSeen: Date | null
  nativeBalance: number | null
  tokenCount: number | null
  uniqueCounterparties: number | null
  lastActiveDaysAgo: number | null
  isContract: boolean | null
  enrichmentProvider: string | null
  campaignType: string
  analysisMode: string
}

type Enrichment = {
  analysisId: string
  walletAddress: string
  chain: string
  provider: string
  rawData: unknown
  createdAt: Date
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function csv(headers: readonly string[], rows: Array<Record<string, unknown>>) {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n")
}

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

function nullableStringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null
}

function policyAction(value: unknown) {
  return value === "approve" || value === "manual_review" || value === "reject"
    ? value
    : null
}

function addressKey(chain: string, analysisId: string, address: string) {
  const comparable = /^(ethereum|base|arbitrum|optimism|polygon|bnb|bsc)$/i.test(
    chain
  )
    ? address.toLowerCase()
    : address
  return `${analysisId}:${chain.toLowerCase()}:${comparable}`
}

function caseId(candidate: Pick<Candidate, "analysisId" | "id">) {
  return opaqueId("rw", `${candidate.analysisId}:${candidate.id}`)
}

function engineInput(candidate: Candidate, enrichment: Enrichment | undefined) {
  const raw = rawObject(enrichment?.rawData)
  return {
    walletAddress: candidate.walletAddress,
    chain: candidate.chain,
    txCount: candidate.txCount,
    walletAgeDays: candidate.walletAgeDays,
    fundingSource: candidate.fundingSource,
    firstFundingAt: nullableString(raw.firstFundingAt),
    firstFundingAmount: nullableNumber(raw.firstFundingAmount),
    historyTruncated: nullableBoolean(raw.historyTruncated),
    firstSeen: candidate.firstSeen?.toISOString() ?? null,
    lastSeen: candidate.lastSeen?.toISOString() ?? null,
    totalVolume: candidate.totalVolume,
    contractsCount: candidate.contractsCount,
    campaignActionsCount: candidate.campaignActionsCount,
    nativeBalance: candidate.nativeBalance,
    tokenCount: candidate.tokenCount,
    uniqueCounterparties: candidate.uniqueCounterparties,
    lastActiveDaysAgo: candidate.lastActiveDaysAgo,
    isContract: candidate.isContract,
    knownEntityLabel: candidate.entityLabel,
    knownEntityType: candidate.entityType,
    accountType: nullableString(raw.accountType),
    ownerProgram: nullableString(raw.ownerProgram),
    behaviorFingerprint: nullableStringArray(raw.behaviorFingerprint),
    campaignQualityScore: nullableNumber(raw.campaignQualityScore),
    campaignOnlyRatio: nullableNumber(raw.campaignOnlyRatio),
    behaviorDiversityScore: nullableNumber(raw.behaviorDiversityScore),
    botScriptScore: nullableNumber(raw.botScriptScore),
    policyAction: policyAction(raw.policyAction),
    reputationLabel: nullableString(raw.reputationLabel),
    policyReason: nullableString(raw.policyReason),
    customerLabel: nullableString(raw.customerLabel),
    referrerAddress: nullableString(raw.referrerAddress),
    referralCode: nullableString(raw.referralCode),
    referralTimestamp: nullableString(raw.referralTimestamp),
    campaignEventAt: nullableString(raw.campaignEventAt),
    campaignEventType: nullableString(raw.campaignEventType),
    campaignPoints: nullableNumber(raw.campaignPoints),
    participantFingerprint: nullableString(raw.participantFingerprint),
    enrichmentProvider: enrichment?.provider ?? candidate.enrichmentProvider,
    enrichmentStatus:
      enrichment?.provider || candidate.enrichmentProvider ? "completed" : null,
  }
}

export type PrivateReviewSeal = {
  sealSchemaVersion: "tri-proof-review-seal-v1"
  batchId: string
  generatedAt: string
  labelingSchemaVersion: string
  representativeSha256: string
  auditSha256: string
  representativeCases: number
  contextRows: number
  projects: number
  byChain: Record<string, number>
  plannedSplits: Record<string, number>
  auditCsv: string
  instructions: string[]
}

export async function buildFrozenReviewBundle(perProject = 20) {
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
      entityLabel: true,
      entityType: true,
      riskScore: true,
      riskLevel: true,
      status: true,
      recommendedAction: true,
      statusExplanation: true,
      fundingSource: true,
      txCount: true,
      walletAgeDays: true,
      totalVolume: true,
      contractsCount: true,
      campaignActionsCount: true,
      clusterId: true,
      graphComponentId: true,
      graphRiskScore: true,
      reasons: true,
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
          analysisMode: true,
          project: { select: { campaignType: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: candidateLimit,
  })

  if (rawCandidates.length >= candidateLimit) {
    throw new Error(
      `Candidate limit ${candidateLimit} reached; refusing a potentially incomplete frozen review bundle.`
    )
  }

  const candidates: Candidate[] = rawCandidates.map((candidate) => ({
    ...candidate,
    entityType: String(candidate.entityType),
    riskLevel: String(candidate.riskLevel),
    status: String(candidate.status),
    recommendedAction: String(candidate.recommendedAction),
    projectId: candidate.analysis.projectId,
    campaignType: candidate.analysis.project.campaignType,
    analysisMode: String(candidate.analysis.analysisMode),
    walletId: candidate.id,
    engineStatus: String(candidate.status),
  }))

  const representative = selectRepresentativeCandidates(candidates, perProject)
  const selectedKeys = new Set(
    representative.map((candidate) => `${candidate.analysisId}:${candidate.id}`)
  )
  const selectedAnalysisIds = new Set(
    representative.map((candidate) => candidate.analysisId)
  )
  const contextCandidates = candidates.filter((candidate) =>
    selectedAnalysisIds.has(candidate.analysisId)
  )

  const enrichments = selectedAnalysisIds.size
    ? await db.walletEnrichment.findMany({
        where: {
          analysisId: { in: Array.from(selectedAnalysisIds) },
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
    if (!enrichmentByWallet.has(key)) enrichmentByWallet.set(key, enrichment)
  })
  const enrichmentFor = (candidate: Candidate) =>
    enrichmentByWallet.get(
      addressKey(candidate.chain, candidate.analysisId, candidate.walletAddress)
    )

  const reviewerRows = representative
    .map((candidate) => buildBlindReviewerRow(candidate, enrichmentFor(candidate)))
    .sort((left, right) =>
      `${left.scenario_id}:${left.case_id}`.localeCompare(
        `${right.scenario_id}:${right.case_id}`
      )
    )
  const reviewerCsv = `${reviewerRowsToCsv(reviewerRows)}\n`

  const auditRows = contextCandidates
    .map((candidate) => {
      const selected = selectedKeys.has(`${candidate.analysisId}:${candidate.id}`)
      return {
        labeling_schema_version: REAL_WORLD_LABELING_SCHEMA_VERSION,
        selected_cohort: selected ? "representative" : "context",
        claim_eligible: selected ? "true" : "false",
        scenario_id: opaqueId("sc", candidate.analysisId),
        split_group_id: opaqueId("sg", candidate.projectId),
        case_id: caseId(candidate),
        analysis_id: candidate.analysisId,
        project_id: candidate.projectId,
        source_ref: `analysis:${candidate.analysisId}/wallet:${candidate.id}`,
        campaign_type: candidate.campaignType,
        analysis_mode: candidate.analysisMode,
        chain: candidate.chain,
        wallet_address: candidate.walletAddress,
        input_json: JSON.stringify(engineInput(candidate, enrichmentFor(candidate))),
        engine_status: candidate.status,
        recommended_action: candidate.recommendedAction,
        risk_score: candidate.riskScore,
        risk_level: candidate.riskLevel,
        cluster_id: candidate.clusterId,
        graph_component_id: candidate.graphComponentId,
        graph_risk_score: candidate.graphRiskScore,
        entity_type: candidate.entityType,
        entity_label: candidate.entityLabel,
        status_explanation: candidate.statusExplanation,
        reasons_json: JSON.stringify(candidate.reasons),
      }
    })
    .sort((left, right) =>
      `${left.scenario_id}:${left.case_id}`.localeCompare(
        `${right.scenario_id}:${right.case_id}`
      )
    )
  const auditCsv = `${csv(AUDIT_HEADERS, auditRows)}\n`

  const byChain = reviewerRows.reduce<Record<string, number>>((counts, row) => {
    counts[row.chain] = (counts[row.chain] ?? 0) + 1
    return counts
  }, {})
  const plannedSplits = reviewerRows.reduce<Record<string, number>>(
    (counts, row) => {
      const split = deterministicRealWorldSplit(row.split_group_id)
      counts[split] = (counts[split] ?? 0) + 1
      return counts
    },
    {}
  )

  const representativeSha256 = sha256(reviewerCsv)
  const auditSha256 = sha256(auditCsv)
  const batchId = sha256(
    `${REAL_WORLD_LABELING_SCHEMA_VERSION}:${perProject}:${representativeSha256}:${auditSha256}`
  ).slice(0, 20)
  const generatedAt = new Date().toISOString()

  const seal: PrivateReviewSeal = {
    sealSchemaVersion: "tri-proof-review-seal-v1",
    batchId,
    generatedAt,
    labelingSchemaVersion: REAL_WORLD_LABELING_SCHEMA_VERSION,
    representativeSha256,
    auditSha256,
    representativeCases: reviewerRows.length,
    contextRows: auditRows.length,
    projects: new Set(representative.map((candidate) => candidate.projectId)).size,
    byChain,
    plannedSplits,
    auditCsv,
    instructions: [
      "PRIVATE: do not send this seal to reviewers before labels are frozen.",
      "Keep this file unchanged until the completed reviewer CSV is returned.",
      "The audit CSV contains original Tri-Proof engine inputs and outputs for exact post-label replay.",
    ],
  }

  const sealJson = `${JSON.stringify(seal)}\n`
  const sealGzipBase64 = gzipSync(sealJson, { level: 9 }).toString("base64")

  return {
    batchId,
    generatedAt,
    reviewerCsv,
    reviewerSha256: representativeSha256,
    reviewerFileName: `tri-proof-reviewer-${batchId}.csv`,
    privateSealFileName: `tri-proof-private-seal-${batchId}.json.gz`,
    privateSealGzipBase64: sealGzipBase64,
    summary: {
      representativeCases: reviewerRows.length,
      contextRows: auditRows.length,
      projects: seal.projects,
      byChain,
      plannedSplits,
      reviewerSha256: representativeSha256,
      auditSha256,
    },
  }
}
