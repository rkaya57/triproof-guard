import { Prisma } from "@prisma/client"

import {
  analysisBriefInputHash,
  buildAnalysisBriefEvidence,
  buildDeterministicAnalysisBrief,
  generateAnalysisBrief,
  type AnalysisBriefAiSidecarEvidence,
  type AnalysisBriefInput,
} from "@/lib/ai/analysis-brief"
import { db } from "@/lib/db/prisma"
import type {
  AiAnalysisBrief,
  AiReportEvidenceMeta,
  EnrichmentMeta,
  WalletGraphFinding,
} from "@/types"

type AuditRow = {
  subjectKind: string
  subjectRef: string
  stage: string
  source: string
  model: string | null
  recommendation: string
  confidence: number | null
  payload: unknown
  createdAt: Date
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
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

function stringArray(value: unknown, limit = 8) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .map((item) => item.trim())
        .slice(0, limit)
    : []
}

function average(values: Array<number | null>) {
  const observed = values.filter((value): value is number => value !== null)
  if (!observed.length) return null
  return Math.round((observed.reduce((sum, value) => sum + value, 0) / observed.length) * 100) / 100
}

function latestRows(rows: AuditRow[]) {
  const latest = new Map<string, AuditRow>()
  rows.forEach((row) => {
    const key = `${row.stage}:${row.subjectRef}`
    const previous = latest.get(key)
    if (!previous || previous.createdAt <= row.createdAt) latest.set(key, row)
  })
  return Array.from(latest.values())
}

export function summarizeProductionAiAudit(rows: AuditRow[]): {
  meta: AiReportEvidenceMeta
  evidence: AnalysisBriefAiSidecarEvidence | null
} {
  const current = latestRows(rows)
  const walletRows = current.filter(
    (row) => row.subjectKind === "wallet" && row.stage === "wallet_evidence"
  )
  const clusterRows = current.filter(
    (row) => row.subjectKind === "cluster" && row.stage === "cluster_evidence"
  )
  const gateRows = current.filter(
    (row) => row.subjectKind === "wallet" && row.stage === "disagreement_gate"
  )

  const walletInsights = walletRows.map((row) => {
    const payload = asRecord(row.payload)
    return {
      source: row.source === "gemini" ? "gemini" : "fallback",
      model: row.model,
      recommendation: stringValue(payload.recommendation) ?? row.recommendation,
      confidence: numberValue(payload.confidence) ?? row.confidence,
      evidenceSufficiency: numberValue(payload.evidenceSufficiency),
      organicEvidenceStrength: numberValue(payload.organicEvidenceStrength),
      coordinationEvidenceStrength: numberValue(payload.coordinationEvidenceStrength),
      automationEvidenceStrength: numberValue(payload.automationEvidenceStrength),
      entityEvidenceStrength: numberValue(payload.entityEvidenceStrength),
      contradictions: stringArray(payload.contradictions),
      missingEvidence: stringArray(payload.missingEvidence),
      reasonCodes: stringArray(payload.reasonCodes, 10),
      summary: stringValue(payload.summary) ?? "",
      limitations: stringArray(payload.limitations, 6),
    }
  })

  const clusterInsights = clusterRows.map((row) => {
    const payload = asRecord(row.payload)
    return {
      source: row.source === "gemini" ? "gemini" : "fallback",
      model: row.model,
      recommendation: stringValue(payload.recommendation) ?? row.recommendation,
      confidence: numberValue(payload.confidence) ?? row.confidence,
      evidenceSufficiency: numberValue(payload.evidenceSufficiency),
      coordinationEvidenceStrength: numberValue(payload.coordinationEvidenceStrength),
      automationEvidenceStrength: numberValue(payload.automationEvidenceStrength),
      neutralExplanationStrength: numberValue(payload.neutralExplanationStrength),
      heterogeneityEvidenceStrength: numberValue(payload.heterogeneityEvidenceStrength),
      counterEvidence: stringArray(payload.counterEvidence),
      unresolvedQuestions: stringArray(payload.unresolvedQuestions),
      reasonCodes: stringArray(payload.reasonCodes, 10),
      interpretation: stringValue(payload.interpretation) ?? "",
      limitations: stringArray(payload.limitations, 6),
    }
  })

  const gateInsights = gateRows.map((row) => {
    const payload = asRecord(row.payload)
    return {
      applied: booleanValue(payload.applied) ?? false,
      trigger: stringValue(payload.trigger),
      reasonCode: stringValue(payload.reasonCode),
      originalStatus: stringValue(payload.originalStatus),
      finalStatus: stringValue(payload.finalStatus),
      riskScoreUnchanged: booleanValue(payload.riskScoreUnchanged) ?? true,
    }
  })

  const models = Array.from(
    new Set(
      [...walletRows, ...clusterRows]
        .filter((row) => row.source === "gemini" && row.model)
        .map((row) => row.model as string)
    )
  ).sort()
  const reasonCodeCounts = new Map<string, number>()
  ;[...walletInsights, ...clusterInsights].forEach((insight) => {
    insight.reasonCodes.forEach((code) => {
      reasonCodeCounts.set(code, (reasonCodeCounts.get(code) ?? 0) + 1)
    })
  })
  const topReasonCodes = Array.from(reasonCodeCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([code, count]) => ({ code, count }))

  const meta: AiReportEvidenceMeta = {
    walletAssessments: walletRows.length,
    walletGeminiResponses: walletRows.filter((row) => row.source === "gemini").length,
    walletFallbacks: walletRows.filter((row) => row.source !== "gemini").length,
    clusterAssessments: clusterRows.length,
    clusterGeminiResponses: clusterRows.filter((row) => row.source === "gemini").length,
    clusterFallbacks: clusterRows.filter((row) => row.source !== "gemini").length,
    gateEvents: gateRows.length,
    gateEscalations: gateInsights.filter((gate) => gate.applied).length,
    riskMutationViolations: gateInsights.filter((gate) => !gate.riskScoreUnchanged).length,
    averageConfidence: average(walletInsights.map((item) => item.confidence)),
    averageEvidenceSufficiency: average(
      walletInsights.map((item) => item.evidenceSufficiency)
    ),
    models,
    topReasonCodes,
  }

  if (!walletRows.length && !clusterRows.length && !gateRows.length) {
    return { meta, evidence: null }
  }

  return {
    meta,
    evidence: {
      meta,
      walletInsights: walletInsights.slice(0, 12),
      clusterInsights: clusterInsights.slice(0, 6),
      gateInsights: gateInsights.slice(0, 12),
    },
  }
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function riskPolicyFromNotes(notes: string | null) {
  const match = notes?.match(/^TRIPROOF_RISK_POLICY=(conservative|balanced|strict)$/m)
  return match?.[1] ?? "balanced"
}

export function toStoredAnalysisBrief(brief: {
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
        .filter(
          (
            driver
          ): driver is {
            title: string
            explanation: string
            severity: "info" | "caution" | "high"
          } => {
            if (!driver || typeof driver !== "object") return false
            const value = driver as Record<string, unknown>
            return (
              typeof value.title === "string" &&
              typeof value.explanation === "string" &&
              (value.severity === "info" ||
                value.severity === "caution" ||
                value.severity === "high")
            )
          }
        )
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
    limitations: strings(brief.limitations).slice(0, 5),
  }
}

export async function loadAnalysisReportContext(
  id: string,
  options: { userId?: string | null } = {}
) {
  const analysis = await db.analysis.findFirst({
    where: {
      id,
      ...(options.userId ? { project: { userId: options.userId } } : {}),
    },
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

  const auditRows = await db.$queryRaw<AuditRow[]>(Prisma.sql`
    SELECT
      "subjectKind", "subjectRef", "stage", "source", "model",
      "recommendation", "confidence", "payload", "createdAt"
    FROM "AiEvidenceAudit"
    WHERE "analysisId" = ${id}
      AND "context" = 'production_analysis'
    ORDER BY "createdAt" ASC
  `)
  const audit = summarizeProductionAiAudit(auditRows)

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
    aiSidecar: audit.evidence,
  }

  return { analysis, input, evidenceMeta: audit.meta }
}

export async function generateAndStoreAnalysisReportBrief(
  id: string,
  options: { userId?: string | null } = {}
) {
  const result = await loadAnalysisReportContext(id, options)
  if (!result) return null
  if (result.analysis.status !== "completed") {
    return {
      status: "not_ready" as const,
      brief: null,
      evidenceMeta: result.evidenceMeta,
    }
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

  return {
    status: "ready" as const,
    brief: { ...toStoredAnalysisBrief(saved), evidenceMeta: result.evidenceMeta },
    evidenceMeta: result.evidenceMeta,
    inputHash,
  }
}

export async function getAnalysisReportBrief(
  id: string,
  options: { userId?: string | null } = {}
) {
  const result = await loadAnalysisReportContext(id, options)
  if (!result) return null

  const evidence = buildAnalysisBriefEvidence(result.input)
  const inputHash = analysisBriefInputHash(evidence)
  const storedBrief = result.analysis.aiBrief
  if (storedBrief && storedBrief.inputHash === inputHash) {
    return {
      brief: { ...toStoredAnalysisBrief(storedBrief), evidenceMeta: result.evidenceMeta },
      cached: true,
      evidenceMeta: result.evidenceMeta,
    }
  }

  return {
    brief: {
      ...buildDeterministicAnalysisBrief(evidence),
      evidenceMeta: result.evidenceMeta,
    },
    cached: false,
    evidenceMeta: result.evidenceMeta,
  }
}
