import { createHash } from "node:crypto"

import { db } from "@/lib/db/prisma"
import {
  opaqueId,
  selectRepresentativeCandidates,
  type LabelingCandidateBase,
} from "@/lib/benchmark/labeling-queue"
import {
  buildBlindReviewerRow,
  reviewerRowsToCsv,
} from "@/lib/benchmark/reviewer-export"
import {
  getHoldoutArtifact,
  putImmutableHoldoutArtifact,
} from "@/lib/benchmark/holdout-artifacts"
import {
  updateHoldoutRunStatus,
  type PersistedHoldoutRun,
} from "@/lib/benchmark/holdout-store"

const HOLDOUT_BUNDLE_SCHEMA_VERSION =
  "tri-proof-independent-holdout-review-bundle-v1" as const
const HOLDOUT_PRIVATE_SEAL_SCHEMA_VERSION =
  "tri-proof-independent-holdout-private-seal-v1" as const

const AUDIT_HEADERS = [
  "selected_cohort",
  "case_id",
  "scenario_id",
  "project_id",
  "analysis_id",
  "wallet_id",
  "chain",
  "wallet_address",
  "analysis_created_at",
  "wallet_created_at",
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
  analysisCreatedAt: Date
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

type HoldoutPrivateSeal = {
  schemaVersion: typeof HOLDOUT_PRIVATE_SEAL_SCHEMA_VERSION
  runId: string
  freezeHash: string
  stackHash: string
  candidateNotBefore: string
  batchId: string
  generatedAt: string
  reviewerSha256: string
  auditSha256: string
  representativeCases: number
  contextRows: number
  projects: number
  byChain: Record<string, number>
  auditCsv: string
}

export type HoldoutReviewBundlePayload = {
  schemaVersion: typeof HOLDOUT_BUNDLE_SCHEMA_VERSION
  runId: string
  freezeHash: string
  stackHash: string
  candidateNotBefore: string
  batchId: string
  generatedAt: string
  reviewerSha256: string
  reviewerCsv: string
  reviewerAFileName: string
  reviewerBFileName: string
  representativeCases: number
  projects: number
  byChain: Record<string, number>
}

export type HoldoutBundlePreview = {
  runId: string
  status: PersistedHoldoutRun["status"]
  candidateNotBefore: string
  candidateWallets: number
  selectedCases: number
  projects: number
  byChain: Record<string, number>
  minimums: PersistedHoldoutRun["freeze"]["minimums"]
  sealable: boolean
  reasons: string[]
  alreadySealed: boolean
  sealedBatchId: string | null
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function csv(headers: readonly string[], rows: Array<Record<string, unknown>>) {
  return `${[
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n")}\n`
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

function comparableAddress(chain: string, address: string) {
  return /^(ethereum|base|arbitrum|optimism|polygon|bnb|bsc)$/i.test(chain)
    ? address.toLowerCase()
    : address
}

function addressKey(chain: string, analysisId: string, address: string) {
  return `${analysisId}:${chain.toLowerCase()}:${comparableAddress(chain, address)}`
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

async function collectPostFreezeCandidates(run: PersistedHoldoutRun) {
  const cutoff = new Date(run.candidateNotBefore)
  const candidateLimit = 30000
  const rawCandidates = await db.walletAnalysis.findMany({
    where: {
      createdAt: { gte: cutoff },
      teamReviews: { none: {} },
      analysis: {
        status: "completed",
        createdAt: { gte: cutoff },
      },
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
          createdAt: true,
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
      `Post-freeze candidate limit ${candidateLimit} reached; refusing a potentially incomplete holdout bundle.`
    )
  }

  return rawCandidates.map((candidate): Candidate => ({
    ...candidate,
    analysisCreatedAt: candidate.analysis.createdAt,
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
}

function countByChain(candidates: Candidate[]) {
  return candidates.reduce<Record<string, number>>((counts, candidate) => {
    counts[candidate.chain] = (counts[candidate.chain] ?? 0) + 1
    return counts
  }, {})
}

function sealability(run: PersistedHoldoutRun, selected: Candidate[]) {
  const reasons: string[] = []
  const byChain = countByChain(selected)
  if (selected.length < run.freeze.minimums.cases) {
    reasons.push(
      `Need at least ${run.freeze.minimums.cases} post-freeze blind-review cases before sealing; found ${selected.length}.`
    )
  }
  if (Object.keys(byChain).length < run.freeze.minimums.chains) {
    reasons.push(
      `Need at least ${run.freeze.minimums.chains} represented chains before sealing; found ${Object.keys(byChain).length}.`
    )
  }
  return { sealable: reasons.length === 0, reasons, byChain }
}

export async function previewHoldoutReviewerBundle(
  run: PersistedHoldoutRun,
  perProject = 20
): Promise<HoldoutBundlePreview> {
  const existing = await getHoldoutArtifact<HoldoutReviewBundlePayload>(run.id, "review_bundle")
  if (existing) {
    return {
      runId: run.id,
      status: run.status,
      candidateNotBefore: run.candidateNotBefore,
      candidateWallets: existing.payload.representativeCases,
      selectedCases: existing.payload.representativeCases,
      projects: existing.payload.projects,
      byChain: existing.payload.byChain,
      minimums: run.freeze.minimums,
      sealable: true,
      reasons: [],
      alreadySealed: true,
      sealedBatchId: existing.payload.batchId,
    }
  }

  const candidates = await collectPostFreezeCandidates(run)
  const selected = selectRepresentativeCandidates(candidates, perProject)
  const readiness = sealability(run, selected)
  return {
    runId: run.id,
    status: run.status,
    candidateNotBefore: run.candidateNotBefore,
    candidateWallets: candidates.length,
    selectedCases: selected.length,
    projects: new Set(selected.map((candidate) => candidate.projectId)).size,
    byChain: readiness.byChain,
    minimums: run.freeze.minimums,
    sealable: readiness.sealable,
    reasons: readiness.reasons,
    alreadySealed: false,
    sealedBatchId: null,
  }
}

export async function sealHoldoutReviewerBundle(
  run: PersistedHoldoutRun,
  perProject = 20
) {
  if (!["frozen", "collecting", "reviewing"].includes(run.status)) {
    throw new Error(`Holdout run ${run.id} cannot seal a reviewer bundle from status ${run.status}.`)
  }

  const existing = await getHoldoutArtifact<HoldoutReviewBundlePayload>(run.id, "review_bundle")
  if (existing) {
    return { created: false, bundle: existing.payload }
  }

  const candidates = await collectPostFreezeCandidates(run)
  const selected = selectRepresentativeCandidates(candidates, perProject)
  const readiness = sealability(run, selected)
  if (!readiness.sealable) {
    throw new Error(readiness.reasons.join(" "))
  }

  const cutoff = new Date(run.candidateNotBefore).getTime()
  if (
    selected.some(
      (candidate) =>
        candidate.createdAt.getTime() < cutoff ||
        candidate.analysisCreatedAt.getTime() < cutoff
    )
  ) {
    throw new Error("Pre-freeze case detected while sealing the holdout reviewer bundle.")
  }

  const selectedKeys = new Set(selected.map((candidate) => `${candidate.analysisId}:${candidate.id}`))
  const selectedAnalysisIds = new Set(selected.map((candidate) => candidate.analysisId))
  const contextCandidates = candidates.filter((candidate) =>
    selectedAnalysisIds.has(candidate.analysisId)
  )

  const enrichments = await db.walletEnrichment.findMany({
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
  const enrichmentByWallet = new Map<string, Enrichment>()
  enrichments.forEach((enrichment) => {
    const key = addressKey(enrichment.chain, enrichment.analysisId, enrichment.walletAddress)
    if (!enrichmentByWallet.has(key)) enrichmentByWallet.set(key, enrichment)
  })
  const enrichmentFor = (candidate: Candidate) =>
    enrichmentByWallet.get(addressKey(candidate.chain, candidate.analysisId, candidate.walletAddress))

  const reviewerRows = selected
    .map((candidate) => buildBlindReviewerRow(candidate, enrichmentFor(candidate)))
    .sort((left, right) =>
      `${left.scenario_id}:${left.case_id}`.localeCompare(`${right.scenario_id}:${right.case_id}`)
    )
  const reviewerCsv = `${reviewerRowsToCsv(reviewerRows)}\n`
  const reviewerCaseIds = new Set(reviewerRows.map((row) => row.case_id))

  const auditRows = contextCandidates
    .map((candidate) => ({
      selected_cohort: selectedKeys.has(`${candidate.analysisId}:${candidate.id}`)
        ? "representative"
        : "context",
      case_id: caseId(candidate),
      scenario_id: opaqueId("sc", candidate.analysisId),
      project_id: candidate.projectId,
      analysis_id: candidate.analysisId,
      wallet_id: candidate.id,
      chain: candidate.chain,
      wallet_address: candidate.walletAddress,
      analysis_created_at: candidate.analysisCreatedAt.toISOString(),
      wallet_created_at: candidate.createdAt.toISOString(),
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
    }))
    .sort((left, right) =>
      `${left.scenario_id}:${left.case_id}`.localeCompare(`${right.scenario_id}:${right.case_id}`)
    )

  const auditRepresentativeIds = new Set(
    auditRows
      .filter((row) => row.selected_cohort === "representative")
      .map((row) => row.case_id)
  )
  if (
    reviewerCaseIds.size !== auditRepresentativeIds.size ||
    Array.from(reviewerCaseIds).some((id) => !auditRepresentativeIds.has(id))
  ) {
    throw new Error("Holdout reviewer/private-audit case identities do not match exactly.")
  }

  const auditCsv = csv(AUDIT_HEADERS, auditRows)
  const reviewerSha256 = sha256(reviewerCsv)
  const auditSha256 = sha256(auditCsv)
  const generatedAt = new Date().toISOString()
  const batchId = sha256(
    `${run.freezeHash}:${run.stackHash}:${run.candidateNotBefore}:${reviewerSha256}:${auditSha256}`
  ).slice(0, 20)
  const projects = new Set(selected.map((candidate) => candidate.projectId)).size

  const bundle: HoldoutReviewBundlePayload = {
    schemaVersion: HOLDOUT_BUNDLE_SCHEMA_VERSION,
    runId: run.id,
    freezeHash: run.freezeHash,
    stackHash: run.stackHash,
    candidateNotBefore: run.candidateNotBefore,
    batchId,
    generatedAt,
    reviewerSha256,
    reviewerCsv,
    reviewerAFileName: `tri-proof-holdout-v1-reviewer-a-${batchId}.csv`,
    reviewerBFileName: `tri-proof-holdout-v1-reviewer-b-${batchId}.csv`,
    representativeCases: reviewerRows.length,
    projects,
    byChain: readiness.byChain,
  }
  const privateSeal: HoldoutPrivateSeal = {
    schemaVersion: HOLDOUT_PRIVATE_SEAL_SCHEMA_VERSION,
    runId: run.id,
    freezeHash: run.freezeHash,
    stackHash: run.stackHash,
    candidateNotBefore: run.candidateNotBefore,
    batchId,
    generatedAt,
    reviewerSha256,
    auditSha256,
    representativeCases: reviewerRows.length,
    contextRows: auditRows.length,
    projects,
    byChain: readiness.byChain,
    auditCsv,
  }

  await putImmutableHoldoutArtifact({ runId: run.id, kind: "private_seal", payload: privateSeal })
  const stored = await putImmutableHoldoutArtifact({ runId: run.id, kind: "review_bundle", payload: bundle })

  if (run.status === "frozen" || run.status === "collecting") {
    await updateHoldoutRunStatus(run.id, run.status, "reviewing")
  }

  return { created: stored.created, bundle: stored.artifact.payload }
}
