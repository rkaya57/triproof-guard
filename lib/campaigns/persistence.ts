import { createHash } from "node:crypto"

import type { Prisma } from "@prisma/client"

import { db } from "@/lib/db/prisma"
import { normalizeCampaignNetworks } from "@/lib/campaigns/model"
import type { RiskPolicy } from "@/types"

export const CAMPAIGN_CORE_SCHEMA_VERSION = "tri-proof-campaign-core-v1" as const
export const RISK_ENGINE_VERSION = "1.8" as const
export const CAMPAIGN_MODEL_VERSION = `tri-proof-risk-engine-v${RISK_ENGINE_VERSION}` as const

const DECISION_WRITE_BATCH_SIZE = 500

const policyConfigSnapshots: Record<RiskPolicy, {
  approveMax: number
  manualMax: number
  rejectMin: number
  hardRejectMin: number
  noDataAction: "manual_review" | "reject"
  clusterRejectSize: number
  clusterReviewSize: number
  scoreMultiplier: number
  label: string
}> = {
  conservative: {
    approveMax: 35,
    manualMax: 74,
    rejectMin: 90,
    hardRejectMin: 85,
    noDataAction: "manual_review",
    clusterRejectSize: 14,
    clusterReviewSize: 5,
    scoreMultiplier: 0.9,
    label: "Conservative",
  },
  balanced: {
    approveMax: 35,
    manualMax: 59,
    rejectMin: 80,
    hardRejectMin: 70,
    noDataAction: "reject",
    clusterRejectSize: 10,
    clusterReviewSize: 4,
    scoreMultiplier: 1,
    label: "Balanced",
  },
  strict: {
    approveMax: 25,
    manualMax: 49,
    rejectMin: 70,
    hardRejectMin: 55,
    noDataAction: "reject",
    clusterRejectSize: 6,
    clusterReviewSize: 3,
    scoreMultiplier: 1.15,
    label: "Strict",
  },
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalizeJson(nested)])
    )
  }
  return value
}

function stableJson(value: unknown) {
  return JSON.stringify(canonicalizeJson(value))
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

export function buildCampaignInputHash(
  wallets: ReadonlyArray<{ walletAddress: string; chain: string }>,
) {
  const normalized = wallets
    .map((wallet) => `${wallet.chain.trim().toLowerCase()}:${wallet.walletAddress.trim()}`)
    .sort()
  return sha256(normalized.join("\n"))
}

export function buildPersistedCampaignPolicyDefinition(preset: RiskPolicy) {
  return {
    schemaVersion: "tri-proof-campaign-policy-persistence-v1",
    riskEngineVersion: RISK_ENGINE_VERSION,
    preset,
    engineConfig: policyConfigSnapshots[preset],
    decisionStates: ["allow", "review", "exclude", "insufficient_data"],
    safeguards: {
      humanDecisionPrecedence: true,
      infrastructureSuppressionRequired: true,
      insufficientDataDoesNotAutoAllow: true,
    },
  }
}

export function persistedPolicyHash(preset: RiskPolicy) {
  return sha256(stableJson(buildPersistedCampaignPolicyDefinition(preset)))
}

export function campaignDecisionState(status: string) {
  if (status === "approved") return "allow" as const
  if (status === "manual_review") return "review" as const
  if (status === "rejected") return "exclude" as const
  return "insufficient_data" as const
}

export function riskPolicyFromNotes(notes: string | null | undefined): RiskPolicy {
  const match = notes?.match(/TRIPROOF_RISK_POLICY=(conservative|balanced|strict)/i)
  const value = match?.[1]?.toLowerCase()
  if (value === "conservative" || value === "strict" || value === "balanced") return value
  return "balanced"
}

function decisionId(analysisId: string, chain: string, walletAddress: string) {
  const fingerprint = sha256(`${chain.toLowerCase()}:${walletAddress}`).slice(0, 20)
  return `${analysisId}:decision:${fingerprint}`
}

type CampaignProjectInput = {
  id: string
  userId: string
  name: string
  campaignType: string
  chain: string
  notes: string | null
  createdAt?: Date
  updatedAt?: Date
}

type CampaignAnalysisInput = {
  id: string
  status: unknown
  totalWallets: number
  approvedCount?: number
  manualReviewCount?: number
  rejectedCount?: number
  averageRiskScore?: number
  suspiciousClustersCount?: number
  createdAt?: Date
  completedAt?: Date | null
  inputHash?: string | null
}

function campaignSnapshot(project: CampaignProjectInput, networks: string[]) {
  return {
    schemaVersion: CAMPAIGN_CORE_SCHEMA_VERSION,
    campaignId: project.id,
    name: project.name,
    campaignType: project.campaignType,
    networks,
    legacyChain: project.chain,
  }
}

async function resolvePersistedCampaignPolicy(
  tx: Prisma.TransactionClient,
  campaignId: string,
  riskPolicy: RiskPolicy,
) {
  const definition = buildPersistedCampaignPolicyDefinition(riskPolicy)
  const policyHash = persistedPolicyHash(riskPolicy)
  const existing = await tx.campaignPolicy.findFirst({
    where: { campaignId, policyHash },
    orderBy: { version: "desc" },
  })

  if (existing) {
    await tx.campaignPolicy.updateMany({
      where: {
        campaignId,
        isActive: true,
        id: { not: existing.id },
      },
      data: { isActive: false },
    })

    if (existing.isActive) return existing

    return tx.campaignPolicy.update({
      where: { id: existing.id },
      data: { isActive: true },
    })
  }

  const latest = await tx.campaignPolicy.findFirst({
    where: { campaignId },
    orderBy: { version: "desc" },
    select: { version: true },
  })

  await tx.campaignPolicy.updateMany({
    where: { campaignId, isActive: true },
    data: { isActive: false },
  })

  const version = (latest?.version ?? 0) + 1
  return tx.campaignPolicy.create({
    data: {
      campaignId,
      name: `${riskPolicy[0].toUpperCase()}${riskPolicy.slice(1)} campaign policy`,
      version,
      preset: riskPolicy,
      policyHash,
      definition,
      isActive: true,
    },
  })
}

export async function persistNewCampaignAnalysis(
  tx: Prisma.TransactionClient,
  input: {
    project: CampaignProjectInput
    analysis: CampaignAnalysisInput
    riskPolicy: RiskPolicy
  }
) {
  const { project, analysis, riskPolicy } = input
  const networks = normalizeCampaignNetworks(project.chain)
  const now = new Date()

  const campaign = await tx.campaign.upsert({
    where: { legacyProjectId: project.id },
    create: {
      id: project.id,
      legacyProjectId: project.id,
      ownerUserId: project.userId,
      name: project.name,
      campaignType: project.campaignType,
      legacyChain: project.chain,
      networks,
      lifecycle: "active",
      notes: project.notes,
      metadata: {
        schemaVersion: CAMPAIGN_CORE_SCHEMA_VERSION,
        source: "legacy-project-bridge",
      },
      createdAt: project.createdAt ?? now,
      updatedAt: project.updatedAt ?? now,
    },
    update: {
      ownerUserId: project.userId,
      name: project.name,
      campaignType: project.campaignType,
      legacyChain: project.chain,
      networks,
      notes: project.notes,
    },
  })

  const policy = await resolvePersistedCampaignPolicy(tx, campaign.id, riskPolicy)

  const analysisRun = await tx.campaignAnalysisRun.upsert({
    where: { legacyAnalysisId: analysis.id },
    create: {
      id: analysis.id,
      campaignId: campaign.id,
      legacyAnalysisId: analysis.id,
      policyId: policy.id,
      status: String(analysis.status),
      modelVersion: CAMPAIGN_MODEL_VERSION,
      policyVersion: `v${policy.version}`,
      inputHash: analysis.inputHash ?? null,
      campaignSnapshot: campaignSnapshot(project, networks),
      totalWallets: analysis.totalWallets,
      approvedCount: analysis.approvedCount ?? 0,
      manualReviewCount: analysis.manualReviewCount ?? 0,
      rejectedCount: analysis.rejectedCount ?? 0,
      averageRiskScore: analysis.averageRiskScore ?? 0,
      suspiciousClustersCount: analysis.suspiciousClustersCount ?? 0,
      startedAt: analysis.createdAt ?? now,
      completedAt: analysis.completedAt ?? null,
      createdAt: analysis.createdAt ?? now,
      updatedAt: analysis.completedAt ?? analysis.createdAt ?? now,
    },
    update: {
      policyId: policy.id,
      status: String(analysis.status),
      modelVersion: CAMPAIGN_MODEL_VERSION,
      policyVersion: `v${policy.version}`,
      ...(analysis.inputHash !== undefined ? { inputHash: analysis.inputHash } : {}),
      campaignSnapshot: campaignSnapshot(project, networks),
      totalWallets: analysis.totalWallets,
      approvedCount: analysis.approvedCount ?? 0,
      manualReviewCount: analysis.manualReviewCount ?? 0,
      rejectedCount: analysis.rejectedCount ?? 0,
      averageRiskScore: analysis.averageRiskScore ?? 0,
      suspiciousClustersCount: analysis.suspiciousClustersCount ?? 0,
      completedAt: analysis.completedAt ?? null,
    },
  })

  return { campaign, policy, analysisRun }
}

export async function syncCompletedCampaignAnalysis(analysisId: string) {
  return db.$transaction(async (tx) => {
    const legacy = await tx.analysis.findUnique({
      where: { id: analysisId },
      include: {
        project: true,
        wallets: true,
      },
    })

    if (!legacy) return null

    const persisted = await persistNewCampaignAnalysis(tx, {
      project: legacy.project,
      analysis: legacy,
      riskPolicy: riskPolicyFromNotes(legacy.project.notes),
    })

    await tx.campaignDecision.deleteMany({
      where: { analysisRunId: persisted.analysisRun.id },
    })

    const decisions: Prisma.CampaignDecisionCreateManyInput[] = legacy.wallets.map((wallet) => ({
      id: decisionId(legacy.id, wallet.chain, wallet.walletAddress),
      campaignId: persisted.campaign.id,
      analysisRunId: persisted.analysisRun.id,
      policyId: persisted.policy.id,
      walletAddress: wallet.walletAddress,
      chain: wallet.chain,
      state: campaignDecisionState(String(wallet.status)),
      riskScore: wallet.riskScore,
      confidence: null,
      clusterId: wallet.clusterId,
      evidence: wallet.reasons as Prisma.InputJsonValue,
      matchedRules: [] as Prisma.InputJsonValue,
      explanation: wallet.statusExplanation,
      modelVersion: CAMPAIGN_MODEL_VERSION,
      policyVersion: `v${persisted.policy.version}`,
      createdAt: wallet.createdAt,
      updatedAt: legacy.completedAt ?? new Date(),
    }))

    for (let index = 0; index < decisions.length; index += DECISION_WRITE_BATCH_SIZE) {
      await tx.campaignDecision.createMany({
        data: decisions.slice(index, index + DECISION_WRITE_BATCH_SIZE),
      })
    }

    return {
      campaignId: persisted.campaign.id,
      analysisRunId: persisted.analysisRun.id,
      policyId: persisted.policy.id,
      policyVersion: persisted.policy.version,
      decisionsWritten: decisions.length,
    }
  })
}
