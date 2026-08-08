import { serializeAnalysis } from "@/lib/analysis/serializers"
import { generateLiveAiClusterAssessment, generateLiveAiEvidenceAssessment } from "@/lib/ai/live-assessments"
import { applyAiEngineDisagreementGate } from "@/lib/ai/disagreement-gate"
import {
  clusterAssessmentAuditInput,
  disagreementGateAuditInput,
  recordAiAuditEvent,
  walletAssessmentAuditInput,
} from "@/lib/ai/provenance"
import { buildAiEvidencePacket } from "@/lib/ai/evidence-analyst"
import { db } from "@/lib/db/prisma"
import type { ClusterResult, WalletRiskResult } from "@/types"

export const PRODUCTION_AI_SIDECAR_VERSION = "tri-proof-production-ai-sidecar-v1" as const

const DEFAULT_WALLET_LIMIT = 8
const DEFAULT_CLUSTER_LIMIT = 4
const DEFAULT_CONCURRENCY = 2

type ProductionAiSidecarEnvironment = Partial<
  Record<
    | "GEMINI_API_KEY"
    | "AI_PRODUCTION_SIDECAR_ENABLED"
    | "AI_EVIDENCE_ANALYST_ENABLED",
    string | undefined
  >
>

function enabledValue(value: string | undefined) {
  return /^(1|true|yes|on)$/i.test(value?.trim() ?? "")
}

function disabledValue(value: string | undefined) {
  return /^(0|false|no|off)$/i.test(value?.trim() ?? "")
}

function boundedInteger(value: string | undefined, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(max, Math.max(1, parsed))
}

export function productionAiSidecarEnabled(
  env: ProductionAiSidecarEnvironment = process.env
) {
  if (!env.GEMINI_API_KEY?.trim()) return false
  const explicit = env.AI_PRODUCTION_SIDECAR_ENABLED
  if (disabledValue(explicit)) return false
  if (enabledValue(explicit)) return true

  const legacy = env.AI_EVIDENCE_ANALYST_ENABLED
  if (disabledValue(legacy)) return false
  if (enabledValue(legacy)) return true

  // Public-beta default: when Gemini is configured, the bounded fail-safe sidecar is on.
  // Operators can immediately disable it with AI_PRODUCTION_SIDECAR_ENABLED=false.
  return true
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 20)
    : []
}

function overlayEnrichmentRawData(
  wallet: WalletRiskResult,
  rawValue: unknown
): WalletRiskResult {
  const raw = asRecord(rawValue)
  return {
    ...wallet,
    accountType: stringValue(raw.accountType),
    ownerProgram: stringValue(raw.ownerProgram),
    behaviorFingerprint: stringArray(raw.behaviorFingerprint),
    campaignQualityScore: numberValue(raw.campaignQualityScore),
    campaignOnlyRatio: numberValue(raw.campaignOnlyRatio),
    behaviorDiversityScore: numberValue(raw.behaviorDiversityScore),
    botScriptScore: numberValue(raw.botScriptScore),
    policyAction: stringValue(raw.policyAction) as WalletRiskResult["policyAction"] | null,
    reputationLabel: stringValue(raw.reputationLabel),
    policyReason: stringValue(raw.policyReason),
    customerLabel: stringValue(raw.customerLabel),
    firstFundingAt: stringValue(raw.firstFundingAt),
    firstFundingAmount: numberValue(raw.firstFundingAmount),
    historyTruncated: booleanValue(raw.historyTruncated),
  }
}

export function productionAiReviewPriority(wallet: WalletRiskResult) {
  if (wallet.status !== "approved") return 0
  let score = 0

  if (wallet.enrichmentStatus && wallet.enrichmentStatus !== "completed") score += 5
  if (wallet.decisionEvidence?.requiresHumanReview) score += 5
  if (wallet.clusterId) score += 4
  if ((wallet.graphRiskScore ?? 0) >= 25) score += 4
  else if ((wallet.graphRiskScore ?? 0) > 0) score += 2
  if (wallet.historyTruncated) score += 4
  if (wallet.riskScore >= 20) score += 3
  else if (wallet.riskScore >= 12) score += 1
  if ((wallet.botScriptScore ?? 0) >= 0.5) score += 3
  if ((wallet.campaignOnlyRatio ?? 0) >= 0.7) score += 2
  if (
    wallet.behaviorDiversityScore !== null &&
    wallet.behaviorDiversityScore !== undefined &&
    wallet.behaviorDiversityScore <= 0.3 &&
    (wallet.txCount ?? 0) >= 5
  ) {
    score += 2
  }
  if (wallet.policyAction === "manual_review") score += 4

  return score
}

export function selectProductionAiWallets(wallets: WalletRiskResult[], limit = DEFAULT_WALLET_LIMIT) {
  return wallets
    .map((wallet) => ({ wallet, priority: productionAiReviewPriority(wallet) }))
    .filter((entry) => entry.priority >= 3)
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        right.wallet.riskScore - left.wallet.riskScore ||
        left.wallet.walletAddress.localeCompare(right.wallet.walletAddress)
    )
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.wallet)
}

export function selectProductionAiClusters(clusters: ClusterResult[], limit = DEFAULT_CLUSTER_LIMIT) {
  return clusters
    .filter(
      (cluster) =>
        cluster.walletCount >= 2 &&
        (Boolean(cluster.sharedFundingSource) ||
          cluster.behaviorSimilarityScore >= 0.7 ||
          cluster.suggestedAction !== "approve")
    )
    .sort(
      (left, right) =>
        right.averageRiskScore - left.averageRiskScore ||
        right.behaviorSimilarityScore - left.behaviorSimilarityScore
    )
    .slice(0, Math.max(0, limit))
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) {
  let cursor = 0
  async function run() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      await worker(items[index]!)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () => run())
  )
}

async function loadAnalysisForSidecar(analysisId: string) {
  const analysis = await db.analysis.findUnique({
    where: { id: analysisId },
    include: {
      project: true,
      wallets: { orderBy: [{ riskScore: "desc" }, { walletAddress: "asc" }] },
      clusters: { orderBy: [{ averageRiskScore: "desc" }, { clusterLabel: "asc" }] },
      enrichments: true,
      teamReviews: { include: { reviewer: { select: { name: true } } } },
      feedbackEvents: true,
      graphSummary: true,
      aiBrief: true,
    },
  })
  if (!analysis || analysis.status !== "completed") return null

  const detail = serializeAnalysis(analysis)
  const rawByWallet = new Map(
    analysis.enrichments.map((item) => [item.walletAddress, item.rawData] as const)
  )
  return {
    detail,
    wallets: detail.wallets.map((wallet) =>
      overlayEnrichmentRawData(wallet, rawByWallet.get(wallet.walletAddress))
    ),
  }
}

async function refreshAnalysisDecisionCounts(analysisId: string) {
  const [approvedCount, manualReviewCount, rejectedCount] = await Promise.all([
    db.walletAnalysis.count({ where: { analysisId, status: "approved" } }),
    db.walletAnalysis.count({ where: { analysisId, status: "manual_review" } }),
    db.walletAnalysis.count({ where: { analysisId, status: "rejected" } }),
  ])
  await db.analysis.update({
    where: { id: analysisId },
    data: { approvedCount, manualReviewCount, rejectedCount },
  })
  return { approvedCount, manualReviewCount, rejectedCount }
}

export type ProductionAiSidecarSummary = {
  version: typeof PRODUCTION_AI_SIDECAR_VERSION
  enabled: boolean
  walletCandidates: number
  walletGeminiResponses: number
  walletFallbacks: number
  escalationsApplied: number
  clusterCandidates: number
  clusterGeminiResponses: number
  clusterFallbacks: number
}

export async function runProductionAiSidecarForAnalysis(
  analysisId: string
): Promise<ProductionAiSidecarSummary> {
  const empty: ProductionAiSidecarSummary = {
    version: PRODUCTION_AI_SIDECAR_VERSION,
    enabled: false,
    walletCandidates: 0,
    walletGeminiResponses: 0,
    walletFallbacks: 0,
    escalationsApplied: 0,
    clusterCandidates: 0,
    clusterGeminiResponses: 0,
    clusterFallbacks: 0,
  }
  if (!productionAiSidecarEnabled()) return empty

  const loaded = await loadAnalysisForSidecar(analysisId)
  if (!loaded) return { ...empty, enabled: true }

  const walletLimit = boundedInteger(
    process.env.AI_PRODUCTION_WALLET_LIMIT,
    DEFAULT_WALLET_LIMIT,
    20
  )
  const clusterLimit = boundedInteger(
    process.env.AI_PRODUCTION_CLUSTER_LIMIT,
    DEFAULT_CLUSTER_LIMIT,
    10
  )
  const concurrency = boundedInteger(
    process.env.AI_PRODUCTION_CONCURRENCY,
    DEFAULT_CONCURRENCY,
    4
  )

  const walletCandidates = selectProductionAiWallets(loaded.wallets, walletLimit)
  const clusterCandidates = selectProductionAiClusters(loaded.detail.clusters, clusterLimit)
  const summary: ProductionAiSidecarSummary = {
    ...empty,
    enabled: true,
    walletCandidates: walletCandidates.length,
    clusterCandidates: clusterCandidates.length,
  }

  await mapWithConcurrency(walletCandidates, concurrency, async (wallet) => {
    try {
      const cluster = loaded.detail.clusters.find((item) =>
        item.walletAddresses.includes(wallet.walletAddress)
      )
      const assessment = await generateLiveAiEvidenceAssessment({
        wallet,
        cluster,
        graph: loaded.detail.graph,
      })
      if (assessment.source === "gemini") summary.walletGeminiResponses += 1
      else summary.walletFallbacks += 1

      const gate = applyAiEngineDisagreementGate(wallet, assessment)

      // Provenance must exist before an AI-derived escalation can change a persisted decision.
      await recordAiAuditEvent(
        walletAssessmentAuditInput(assessment, {
          analysisId,
          context: "production_analysis",
        })
      )
      await recordAiAuditEvent(
        disagreementGateAuditInput(gate, assessment, {
          analysisId,
          context: "production_analysis",
        })
      )

      if (!gate.applied) return
      if (!gate.riskScoreUnchanged || gate.finalStatus !== "manual_review") {
        throw new Error("Production AI gate violated the immutable-risk one-way escalation contract.")
      }

      const updated = await db.walletAnalysis.updateMany({
        where: {
          analysisId,
          walletAddress: wallet.walletAddress,
          status: "approved",
          riskScore: wallet.riskScore,
        },
        data: {
          status: gate.wallet.status,
          recommendedAction: gate.wallet.recommendedAction,
          statusExplanation: gate.wallet.statusExplanation,
        },
      })
      if (updated.count === 1) summary.escalationsApplied += 1
    } catch (error) {
      // Fail closed to the deterministic decision: an AI/audit/storage failure never mutates risk.
      console.error("Production AI wallet sidecar failed", {
        analysisId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  await mapWithConcurrency(clusterCandidates, concurrency, async (cluster) => {
    try {
      const assessment = await generateLiveAiClusterAssessment({
        cluster,
        wallets: loaded.wallets,
        graph: loaded.detail.graph,
      })
      if (assessment.source === "gemini") summary.clusterGeminiResponses += 1
      else summary.clusterFallbacks += 1
      await recordAiAuditEvent(
        clusterAssessmentAuditInput(assessment, {
          analysisId,
          context: "production_analysis",
        })
      )
    } catch (error) {
      console.error("Production AI cluster sidecar failed", {
        analysisId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  if (summary.escalationsApplied > 0) {
    await refreshAnalysisDecisionCounts(analysisId)
  }

  console.info("Production AI sidecar completed", {
    analysisId,
    version: summary.version,
    walletCandidates: summary.walletCandidates,
    walletGeminiResponses: summary.walletGeminiResponses,
    walletFallbacks: summary.walletFallbacks,
    escalationsApplied: summary.escalationsApplied,
    clusterCandidates: summary.clusterCandidates,
    clusterGeminiResponses: summary.clusterGeminiResponses,
    clusterFallbacks: summary.clusterFallbacks,
  })

  return summary
}
