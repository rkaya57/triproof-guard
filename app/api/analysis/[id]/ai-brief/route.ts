import { NextResponse } from "next/server"

import {
  analysisBriefInputHash,
  buildAnalysisBriefEvidence,
  buildDeterministicAnalysisBrief,
  generateAnalysisBrief,
  type AnalysisBriefInput,
} from "@/lib/ai/analysis-brief"
import { aiBriefRateLimit } from "@/lib/ai/brief-rate-limit"
import { getCurrentUser } from "@/lib/auth/session"
import { db } from "@/lib/db/prisma"
import type { AiAnalysisBrief, EnrichmentMeta, WalletGraphFinding } from "@/types"

export const runtime = "nodejs"

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function riskPolicyFromNotes(notes: string | null) {
  const match = notes?.match(/^TRIPROOF_RISK_POLICY=(conservative|balanced|strict)$/m)
  return match?.[1] ?? "balanced"
}

function toStoredBrief(brief: {
  provider: string
  model: string | null
  executiveSummary: string
  decisionRationale: string
  riskDrivers: unknown
  recommendedActions: unknown
  limitations: unknown
  updatedAt: Date
}): AiAnalysisBrief {
  const riskDrivers = Array.isArray(brief.riskDrivers)
    ? brief.riskDrivers
        .filter((driver): driver is { title: string; explanation: string; severity: "info" | "caution" | "high" } => {
          if (!driver || typeof driver !== "object") return false
          const value = driver as Record<string, unknown>
          return (
            typeof value.title === "string" &&
            typeof value.explanation === "string" &&
            (value.severity === "info" || value.severity === "caution" || value.severity === "high")
          )
        })
        .slice(0, 5)
    : []

  return {
    source: brief.provider === "gemini" ? "gemini" : "fallback",
    model: brief.model,
    generatedAt: brief.updatedAt.toISOString(),
    executiveSummary: brief.executiveSummary,
    decisionRationale: brief.decisionRationale,
    riskDrivers,
    recommendedActions: strings(brief.recommendedActions).slice(0, 5),
    limitations: strings(brief.limitations).slice(0, 4),
  }
}

async function getAnalysisInput(id: string, userId: string) {
  const analysis = await db.analysis.findFirst({
    where: { id, project: { userId } },
    include: {
      project: { select: { notes: true } },
      wallets: { select: { riskLevel: true, reasons: true } },
      clusters: {
        orderBy: [{ averageRiskScore: "desc" }, { clusterLabel: "asc" }],
        take: 5,
        select: {
          clusterLabel: true,
          walletCount: true,
          averageRiskScore: true,
          behaviorSimilarityScore: true,
          reasons: true,
        },
      },
      graphSummary: true,
      aiBrief: true,
    },
  })
  if (!analysis) return null

  const enrichment: EnrichmentMeta | null = analysis.enrichmentStatus
    ? {
        mode: analysis.analysisMode,
        provider: analysis.enrichmentProvider ?? "unknown",
        enrichedCount: analysis.enrichedWalletCount,
        failedCount: analysis.failedEnrichmentCount,
        skippedCount: 0,
        cacheHits: analysis.cacheHitCount,
        usedMockFallback: analysis.usedMockFallback,
        warnings: strings(analysis.enrichmentWarnings),
      }
    : null
  const input: AnalysisBriefInput = {
    totalWallets: analysis.totalWallets,
    approvedCount: analysis.approvedCount,
    manualReviewCount: analysis.manualReviewCount,
    rejectedCount: analysis.rejectedCount,
    averageRiskScore: analysis.averageRiskScore,
    riskPolicy: riskPolicyFromNotes(analysis.project.notes),
    enrichment,
    wallets: analysis.wallets.map((wallet) => ({
      riskLevel: wallet.riskLevel,
      reasons: strings(wallet.reasons),
    })),
    clusters: analysis.clusters.map((cluster) => ({
      ...cluster,
      reasons: strings(cluster.reasons),
    })),
    graph: analysis.graphSummary
      ? {
          connectedWallets: analysis.graphSummary.connectedWallets,
          referralLinks: analysis.graphSummary.referralLinks,
          highRiskComponents: analysis.graphSummary.highRiskComponents,
          neutralServiceFunders: analysis.graphSummary.neutralServiceFunders,
          maxComponentRisk: analysis.graphSummary.maxComponentRisk,
          findings: Array.isArray(analysis.graphSummary.findings)
            ? (analysis.graphSummary.findings as WalletGraphFinding[])
            : [],
        }
      : null,
  }

  return { analysis, input }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const result = await getAnalysisInput(id, user.id)
  if (!result) return NextResponse.json({ error: "Analysis not found" }, { status: 404 })

  const evidence = buildAnalysisBriefEvidence(result.input)
  const inputHash = analysisBriefInputHash(evidence)
  const storedBrief = result.analysis.aiBrief
  if (storedBrief && storedBrief.inputHash === inputHash) {
    return NextResponse.json({ brief: toStoredBrief(storedBrief), cached: true })
  }

  return NextResponse.json({
    brief: buildDeterministicAnalysisBrief(evidence),
    cached: false,
    message: "Generate a Gemini brief to save an AI-assisted explanation for this report.",
  })
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const limit = aiBriefRateLimit(user.id)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "AI brief rate limit reached. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    )
  }

  const { id } = await context.params
  const result = await getAnalysisInput(id, user.id)
  if (!result) return NextResponse.json({ error: "Analysis not found" }, { status: 404 })
  if (result.analysis.status !== "completed") {
    return NextResponse.json({ error: "AI briefs are available after the analysis completes." }, { status: 409 })
  }

  const evidence = buildAnalysisBriefEvidence(result.input)
  const inputHash = analysisBriefInputHash(evidence)
  const brief = await generateAnalysisBrief(result.input)
  const saved = await db.analysisAiBrief.upsert({
    where: { analysisId: id },
    create: {
      analysisId: id,
      inputHash,
      provider: brief.source,
      model: brief.model,
      executiveSummary: brief.executiveSummary,
      decisionRationale: brief.decisionRationale,
      riskDrivers: brief.riskDrivers,
      recommendedActions: brief.recommendedActions,
      limitations: brief.limitations,
    },
    update: {
      inputHash,
      provider: brief.source,
      model: brief.model,
      executiveSummary: brief.executiveSummary,
      decisionRationale: brief.decisionRationale,
      riskDrivers: brief.riskDrivers,
      recommendedActions: brief.recommendedActions,
      limitations: brief.limitations,
    },
  })

  return NextResponse.json(
    { brief: toStoredBrief(saved), cached: false },
    { headers: { "X-RateLimit-Remaining": String(limit.remaining) } }
  )
}
