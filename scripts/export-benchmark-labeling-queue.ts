import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import { db } from "@/lib/db/prisma"
import {
  REAL_WORLD_LABELING_SCHEMA_VERSION,
  deterministicRealWorldSplit,
  opaqueId,
  selectChallengeCandidates,
  selectRepresentativeCandidates,
  type LabelingCandidateBase,
  type RealWorldLabelingCohort,
} from "@/lib/benchmark/labeling-queue"

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function csv(headers: string[], rows: Array<Record<string, unknown>>) {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n")
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function caseId(analysisId: string, walletId: string) {
  return opaqueId("rw", `${analysisId}:${walletId}`)
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

type Candidate = LabelingCandidateBase & {
  id: string
  analysisId: string
  projectId: string
  walletAddress: string
  chain: string
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
  createdAt: Date
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

/**
 * Reviewer evidence deliberately excludes engine decisions, risk scores,
 * clusters, reason codes, Tri-Proof entity labels, policy outputs, bot scores,
 * behavior scores, and reputation labels. The reviewer sees observable account
 * facts and can independently inspect the public chain explorer.
 */
function reviewerEvidence(candidate: Candidate, enrichment: Enrichment | undefined) {
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

function blindRow(
  candidate: Candidate,
  enrichment: Enrichment | undefined,
  cohort: RealWorldLabelingCohort
) {
  return {
    labeling_schema_version: REAL_WORLD_LABELING_SCHEMA_VERSION,
    cohort,
    scenario_id: opaqueId("sc", candidate.analysisId),
    split_group_id: opaqueId("sg", candidate.projectId),
    case_id: caseId(candidate.analysisId, candidate.id),
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

async function main() {
  const perProject = positiveInteger(
    process.env.BENCHMARK_REPRESENTATIVE_PER_PROJECT,
    6
  )
  const challengeLimit = positiveInteger(
    process.env.BENCHMARK_CHALLENGE_QUEUE_SIZE,
    120
  )
  const candidateLimit = positiveInteger(
    process.env.BENCHMARK_LABEL_CANDIDATE_LIMIT,
    20000
  )
  const outputDirectory = resolve(
    process.env.BENCHMARK_LABEL_QUEUE_OUTPUT ??
      "artifacts/benchmark-labeling"
  )

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
      `Candidate limit ${candidateLimit} reached. Increase BENCHMARK_LABEL_CANDIDATE_LIMIT so representative sampling cannot silently omit campaigns.`
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
  const challenge = selectChallengeCandidates(
    candidates,
    representative,
    challengeLimit
  )
  const selectedCohortByKey = new Map<string, RealWorldLabelingCohort>()
  representative.forEach((candidate) => {
    selectedCohortByKey.set(`${candidate.analysisId}:${candidate.id}`, "representative")
  })
  challenge.forEach((candidate) => {
    selectedCohortByKey.set(`${candidate.analysisId}:${candidate.id}`, "challenge")
  })

  const analysisIds = Array.from(new Set(candidates.map((candidate) => candidate.analysisId)))
  const enrichments = await db.walletEnrichment.findMany({
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

  const enrichmentFor = (candidate: Candidate) =>
    enrichmentByWallet.get(
      addressKey(candidate.chain, candidate.analysisId, candidate.walletAddress)
    )

  const blindHeaders = [
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
  ]
  const auditHeaders = [
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
  ]

  const representativeRows = representative
    .map((candidate) => blindRow(candidate, enrichmentFor(candidate), "representative"))
    .sort((left, right) =>
      `${left.scenario_id}:${left.case_id}`.localeCompare(
        `${right.scenario_id}:${right.case_id}`
      )
    )
  const challengeRows = challenge
    .map((candidate) => blindRow(candidate, enrichmentFor(candidate), "challenge"))
    .sort((left, right) =>
      `${left.scenario_id}:${left.case_id}`.localeCompare(
        `${right.scenario_id}:${right.case_id}`
      )
    )

  const auditRows = candidates.map((candidate) => {
    const selectedCohort =
      selectedCohortByKey.get(`${candidate.analysisId}:${candidate.id}`) ?? "context"
    return {
      labeling_schema_version: REAL_WORLD_LABELING_SCHEMA_VERSION,
      selected_cohort: selectedCohort,
      claim_eligible: selectedCohort === "representative" ? "true" : "false",
      scenario_id: opaqueId("sc", candidate.analysisId),
      split_group_id: opaqueId("sg", candidate.projectId),
      case_id: caseId(candidate.analysisId, candidate.id),
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

  const representativeCsv = `${csv(blindHeaders, representativeRows)}\n`
  const challengeCsv = `${csv(blindHeaders, challengeRows)}\n`
  const auditCsv = `${csv(auditHeaders, auditRows)}\n`

  const splitCounts = representativeRows.reduce<Record<string, number>>(
    (counts, row) => {
      const split = deterministicRealWorldSplit(row.split_group_id)
      counts[split] = (counts[split] ?? 0) + 1
      return counts
    },
    {}
  )
  const chainCounts = representativeRows.reduce<Record<string, number>>(
    (counts, row) => {
      counts[row.chain] = (counts[row.chain] ?? 0) + 1
      return counts
    },
    {}
  )

  const manifest = {
    schemaVersion: REAL_WORLD_LABELING_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    candidatePool: candidates.length,
    projects: new Set(candidates.map((candidate) => candidate.projectId)).size,
    analyses: new Set(candidates.map((candidate) => candidate.analysisId)).size,
    representative: {
      claimEligible: true,
      sampling:
        "Engine-blind deterministic fixed-per-project sample. Engine status, risk score, clusters, and reasons are not used for selection.",
      perProject,
      cases: representativeRows.length,
      byChain: chainCounts,
      plannedSplits: splitCounts,
      sha256: sha256(representativeCsv),
    },
    challenge: {
      claimEligible: false,
      sampling:
        "Hidden engine-status balanced sample for error discovery only. Never use this cohort for external accuracy-readiness counts.",
      cases: challengeRows.length,
      sha256: sha256(challengeCsv),
    },
    sealedAuditMap: {
      rows: auditRows.length,
      includesUnlabeledCampaignContext: true,
      sha256: sha256(auditCsv),
    },
    reviewerLeakageControls: [
      "No engine status",
      "No risk score or risk level",
      "No cluster or graph score",
      "No engine reason codes",
      "No Tri-Proof entity classification",
      "No bot/behavior/reputation/policy scores",
      "Opaque internal scenario and split-group ids",
    ],
  }

  await mkdir(outputDirectory, { recursive: true })
  await Promise.all([
    writeFile(
      resolve(outputDirectory, "labeling-queue-representative-blind.csv"),
      representativeCsv,
      "utf8"
    ),
    writeFile(
      resolve(outputDirectory, "labeling-queue-challenge-blind.csv"),
      challengeCsv,
      "utf8"
    ),
    writeFile(
      resolve(outputDirectory, "labeling-audit-map.csv"),
      auditCsv,
      "utf8"
    ),
    writeFile(
      resolve(outputDirectory, "labeling-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    ),
  ])

  console.log(JSON.stringify({ outputDirectory, ...manifest }))
}

main()
  .catch((error) => {
    console.error("Failed to export benchmark labeling queue", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
