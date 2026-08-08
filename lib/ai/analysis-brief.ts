import { createHash } from "node:crypto"

import {
  configuredEvidenceFallbackModel,
  configuredEvidenceModel,
  requestGeminiStructuredWithFallback,
} from "@/lib/ai/gemini-structured-runtime"
import type { AiReportEvidenceMeta } from "@/lib/ai/report-types"
import type {
  AiAnalysisBrief,
  AiBriefDriver,
  ClusterResult,
  EnrichmentMeta,
  WalletGraphSummary,
  WalletRiskResult,
} from "@/types"

const maxReasonCount = 8
const maxGraphFindings = 5

export type AnalysisBriefWalletAiInsight = {
  source: "gemini" | "fallback"
  model: string | null
  recommendation: string
  confidence: number | null
  evidenceSufficiency: number | null
  organicEvidenceStrength: number | null
  coordinationEvidenceStrength: number | null
  automationEvidenceStrength: number | null
  entityEvidenceStrength: number | null
  contradictions: string[]
  missingEvidence: string[]
  reasonCodes: string[]
  summary: string
  limitations: string[]
}

export type AnalysisBriefClusterAiInsight = {
  source: "gemini" | "fallback"
  model: string | null
  recommendation: string
  confidence: number | null
  evidenceSufficiency: number | null
  coordinationEvidenceStrength: number | null
  automationEvidenceStrength: number | null
  neutralExplanationStrength: number | null
  heterogeneityEvidenceStrength: number | null
  counterEvidence: string[]
  unresolvedQuestions: string[]
  reasonCodes: string[]
  interpretation: string
  limitations: string[]
}

export type AnalysisBriefGateInsight = {
  applied: boolean
  trigger: string | null
  reasonCode: string | null
  originalStatus: string | null
  finalStatus: string | null
  riskScoreUnchanged: boolean
}

export type AnalysisBriefAiSidecarEvidence = {
  meta: AiReportEvidenceMeta
  walletInsights: AnalysisBriefWalletAiInsight[]
  clusterInsights: AnalysisBriefClusterAiInsight[]
  gateInsights: AnalysisBriefGateInsight[]
}

export type AnalysisBriefInput = {
  totalWallets: number
  approvedCount: number
  manualReviewCount: number
  rejectedCount: number
  averageRiskScore: number
  riskPolicy: string | null | undefined
  enrichment: EnrichmentMeta | null | undefined
  wallets: Pick<WalletRiskResult, "riskLevel" | "reasons">[]
  clusters: Pick<
    ClusterResult,
    "clusterLabel" | "walletCount" | "averageRiskScore" | "behaviorSimilarityScore" | "reasons"
  >[]
  graph:
    | Pick<
        WalletGraphSummary,
        | "connectedWallets"
        | "referralLinks"
        | "highRiskComponents"
        | "neutralServiceFunders"
        | "maxComponentRisk"
        | "findings"
      >
    | null
    | undefined
  aiSidecar?: AnalysisBriefAiSidecarEvidence | null
}

export type AnalysisBriefEvidence = {
  totalWallets: number
  decisions: { approved: number; review: number; rejected: number }
  averageRiskScore: number
  riskPolicy: string
  enrichment: {
    coverage: string
    provider: string
    warnings: number
  } | null
  topReasons: Array<{ reason: string; count: number }>
  riskLevels: Record<string, number>
  clusters: Array<{
    walletCount: number
    averageRiskScore: number
    behaviorSimilarityScore: number
    reasons: string[]
  }>
  graph: {
    connectedWallets: number
    referralLinks: number
    highRiskComponents: number
    neutralServiceFunders: number
    maxComponentRisk: number
    findings: Array<{ title: string; description: string; severity: string; evidenceCount: number }>
  } | null
  aiSidecar: AnalysisBriefAiSidecarEvidence | null
}

function sanitizeText(value: string) {
  return value
    .replace(/0x[a-fA-F0-9]{16,}/g, "[address]")
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, "[address]")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeList(value: unknown, limit: number, itemLimit = 360) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizeText(item).slice(0, itemLimit))
    .filter(Boolean)
    .slice(0, limit)
}

function normalizeNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null
  return Math.round(value * 100) / 100
}

function normalizeSidecar(
  value: AnalysisBriefAiSidecarEvidence | null | undefined
): AnalysisBriefAiSidecarEvidence | null {
  if (!value) return null
  return {
    meta: {
      ...value.meta,
      models: value.meta.models.map((model) => sanitizeText(model).slice(0, 80)).slice(0, 4),
      topReasonCodes: value.meta.topReasonCodes
        .map((item) => ({ code: sanitizeText(item.code).slice(0, 64), count: item.count }))
        .slice(0, 8),
      averageConfidence: normalizeNumber(value.meta.averageConfidence),
      averageEvidenceSufficiency: normalizeNumber(value.meta.averageEvidenceSufficiency),
    },
    walletInsights: value.walletInsights.slice(0, 12).map((item) => ({
      ...item,
      model: item.model ? sanitizeText(item.model).slice(0, 80) : null,
      recommendation: sanitizeText(item.recommendation).slice(0, 64),
      confidence: normalizeNumber(item.confidence),
      evidenceSufficiency: normalizeNumber(item.evidenceSufficiency),
      organicEvidenceStrength: normalizeNumber(item.organicEvidenceStrength),
      coordinationEvidenceStrength: normalizeNumber(item.coordinationEvidenceStrength),
      automationEvidenceStrength: normalizeNumber(item.automationEvidenceStrength),
      entityEvidenceStrength: normalizeNumber(item.entityEvidenceStrength),
      contradictions: normalizeList(item.contradictions, 6),
      missingEvidence: normalizeList(item.missingEvidence, 6),
      reasonCodes: normalizeList(item.reasonCodes, 8, 64),
      summary: sanitizeText(item.summary).slice(0, 900),
      limitations: normalizeList(item.limitations, 4),
    })),
    clusterInsights: value.clusterInsights.slice(0, 6).map((item) => ({
      ...item,
      model: item.model ? sanitizeText(item.model).slice(0, 80) : null,
      recommendation: sanitizeText(item.recommendation).slice(0, 64),
      confidence: normalizeNumber(item.confidence),
      evidenceSufficiency: normalizeNumber(item.evidenceSufficiency),
      coordinationEvidenceStrength: normalizeNumber(item.coordinationEvidenceStrength),
      automationEvidenceStrength: normalizeNumber(item.automationEvidenceStrength),
      neutralExplanationStrength: normalizeNumber(item.neutralExplanationStrength),
      heterogeneityEvidenceStrength: normalizeNumber(item.heterogeneityEvidenceStrength),
      counterEvidence: normalizeList(item.counterEvidence, 6),
      unresolvedQuestions: normalizeList(item.unresolvedQuestions, 6),
      reasonCodes: normalizeList(item.reasonCodes, 8, 64),
      interpretation: sanitizeText(item.interpretation).slice(0, 900),
      limitations: normalizeList(item.limitations, 4),
    })),
    gateInsights: value.gateInsights.slice(0, 12).map((item) => ({
      ...item,
      trigger: item.trigger ? sanitizeText(item.trigger).slice(0, 80) : null,
      reasonCode: item.reasonCode ? sanitizeText(item.reasonCode).slice(0, 80) : null,
      originalStatus: item.originalStatus ? sanitizeText(item.originalStatus).slice(0, 40) : null,
      finalStatus: item.finalStatus ? sanitizeText(item.finalStatus).slice(0, 40) : null,
    })),
  }
}

function reasonTitle(reason: string) {
  const firstSentence = sanitizeText(reason).split(/[.:]/)[0]?.trim() || "Risk evidence"
  return firstSentence.slice(0, 92)
}

function classifyDriver(reason: string): AiBriefDriver["severity"] {
  const value = reason.toLowerCase()
  if (/(critical|known bad|cycle|self.referral|coordinated)/.test(value)) return "high"
  if (/(cluster|funding|low activity|unverified|new wallet|campaign)/.test(value)) return "caution"
  return "info"
}

function fallbackActions(evidence: AnalysisBriefEvidence) {
  const actions = [
    "Export only the approved list after the project team confirms campaign eligibility.",
  ]
  if (evidence.decisions.review > 0) {
    actions.push("Resolve Gray Zone wallets with a reviewer before any reward distribution.")
  }
  if ((evidence.aiSidecar?.meta.gateEscalations ?? 0) > 0) {
    actions.push(
      `Prioritize the ${evidence.aiSidecar?.meta.gateEscalations} wallet(s) escalated by the one-way AI disagreement gate for human review.`
    )
  }
  const collectMore =
    evidence.aiSidecar?.walletInsights.filter(
      (item) => item.recommendation === "collect_more_evidence"
    ).length ?? 0
  if (collectMore > 0) {
    actions.push(
      `Collect additional provider or campaign evidence for ${collectMore} AI-reviewed wallet(s) before final eligibility decisions.`
    )
  }
  if (evidence.graph?.highRiskComponents) {
    actions.push("Review connected funding and referral components before approving linked wallets.")
  }
  if ((evidence.enrichment?.warnings ?? 0) > 0) {
    actions.push("Recheck wallets with incomplete provider coverage before making a final exclusion decision.")
  }
  return actions.slice(0, 5)
}

export function buildAnalysisBriefEvidence(input: AnalysisBriefInput): AnalysisBriefEvidence {
  const reasonCounts = new Map<string, number>()
  const riskLevels: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 }

  input.wallets.forEach((wallet) => {
    riskLevels[wallet.riskLevel] = (riskLevels[wallet.riskLevel] ?? 0) + 1
    wallet.reasons.forEach((reason) => {
      const normalized = sanitizeText(reason)
      if (!normalized) return
      reasonCounts.set(normalized, (reasonCounts.get(normalized) ?? 0) + 1)
    })
  })

  const enrichment = input.enrichment
    ? {
        coverage: `${input.enrichment.enrichedCount}/${input.totalWallets}`,
        provider: sanitizeText(input.enrichment.provider || "unknown"),
        warnings: input.enrichment.warnings.length,
      }
    : null

  return {
    totalWallets: input.totalWallets,
    decisions: {
      approved: input.approvedCount,
      review: input.manualReviewCount,
      rejected: input.rejectedCount,
    },
    averageRiskScore: Math.round(input.averageRiskScore * 10) / 10,
    riskPolicy: input.riskPolicy || "balanced",
    enrichment,
    topReasons: Array.from(reasonCounts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, maxReasonCount)
      .map(([reason, count]) => ({ reason, count })),
    riskLevels,
    clusters: input.clusters
      .slice(0, 5)
      .map((cluster) => ({
        walletCount: cluster.walletCount,
        averageRiskScore: cluster.averageRiskScore,
        behaviorSimilarityScore: cluster.behaviorSimilarityScore,
        reasons: normalizeList(cluster.reasons, 3),
      })),
    graph: input.graph
      ? {
          connectedWallets: input.graph.connectedWallets,
          referralLinks: input.graph.referralLinks,
          highRiskComponents: input.graph.highRiskComponents,
          neutralServiceFunders: input.graph.neutralServiceFunders,
          maxComponentRisk: input.graph.maxComponentRisk,
          findings: input.graph.findings.slice(0, maxGraphFindings).map((finding) => ({
            title: sanitizeText(finding.title),
            description: sanitizeText(finding.description),
            severity: finding.severity,
            evidenceCount: finding.evidenceCount,
          })),
        }
      : null,
    aiSidecar: normalizeSidecar(input.aiSidecar),
  }
}

export function analysisBriefInputHash(evidence: AnalysisBriefEvidence) {
  return createHash("sha256").update(JSON.stringify(evidence)).digest("hex")
}

export function buildDeterministicAnalysisBrief(
  evidence: AnalysisBriefEvidence
): AiAnalysisBrief {
  const decision = evidence.decisions
  const graphSummary = evidence.graph?.highRiskComponents
    ? ` Graph evidence identified ${evidence.graph.highRiskComponents} high-risk connected component${evidence.graph.highRiskComponents === 1 ? "" : "s"}.`
    : ""
  const aiSummary = evidence.aiSidecar
    ? ` The production AI sidecar reviewed ${evidence.aiSidecar.meta.walletAssessments} wallet candidate(s): ${evidence.aiSidecar.meta.walletGeminiResponses} Gemini response(s), ${evidence.aiSidecar.meta.walletFallbacks} fallback(s), and ${evidence.aiSidecar.meta.gateEscalations} one-way review escalation(s).`
    : ""
  const drivers = evidence.topReasons.slice(0, 3).map((item) => ({
    title: reasonTitle(item.reason),
    explanation: `${item.count} wallet${item.count === 1 ? "" : "s"} carried this evidence: ${item.reason}`,
    severity: classifyDriver(item.reason),
  }))
  if (evidence.aiSidecar?.meta.topReasonCodes[0]) {
    const top = evidence.aiSidecar.meta.topReasonCodes[0]
    drivers.push({
      title: `AI evidence signal: ${top.code}`,
      explanation: `${top.count} audited AI assessment(s) carried this reason code. It is decision-support evidence, not ground truth or a malicious label.`,
      severity: "info",
    })
  }

  return {
    source: "fallback",
    model: null,
    generatedAt: new Date().toISOString(),
    executiveSummary: `${decision.approved} of ${evidence.totalWallets} wallets are approved, ${decision.review} require review, and ${decision.rejected} are not eligible under the ${evidence.riskPolicy} policy.${graphSummary}${aiSummary}`,
    decisionRationale: `The report combines deterministic wallet activity, campaign behavior, entity context, corroborated graph evidence, and—when available—audited AI Evidence Analyst assessments. The average deterministic risk score is ${evidence.averageRiskScore}/100; AI evidence cannot change the risk score and final reward decisions remain with the project team.`,
    riskDrivers: drivers.length
      ? drivers
      : [{
          title: "No dominant risk pattern",
          explanation: "No repeated risk reason was recorded in this analysis.",
          severity: "info",
        }],
    recommendedActions: fallbackActions(evidence),
    limitations: [
      "AI assessments are decision-support signals, not proof of wallet ownership, automation, Sybil behavior, or malicious intent.",
      "The AI sidecar reviews a bounded subset of materially ambiguous wallets rather than every wallet in the report.",
      "Missing provider data or incomplete campaign context can reduce confidence.",
    ],
  }
}

const responseJsonSchema = {
  type: "object",
  properties: {
    executiveSummary: { type: "string" },
    decisionRationale: { type: "string" },
    riskDrivers: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          explanation: { type: "string" },
          severity: { type: "string", enum: ["info", "caution", "high"] },
        },
        required: ["title", "explanation", "severity"],
        additionalProperties: false,
      },
    },
    recommendedActions: {
      type: "array",
      maxItems: 5,
      items: { type: "string" },
    },
    limitations: {
      type: "array",
      maxItems: 5,
      items: { type: "string" },
    },
  },
  required: [
    "executiveSummary",
    "decisionRationale",
    "riskDrivers",
    "recommendedActions",
    "limitations",
  ],
  additionalProperties: false,
} as const

function parseGeminiBrief(
  value: string
): Omit<AiAnalysisBrief, "source" | "model" | "generatedAt"> | null {
  const normalized = value.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "")
  try {
    const parsed = JSON.parse(normalized) as Record<string, unknown>
    const executiveSummary =
      typeof parsed.executiveSummary === "string"
        ? sanitizeText(parsed.executiveSummary).slice(0, 1000)
        : ""
    const decisionRationale =
      typeof parsed.decisionRationale === "string"
        ? sanitizeText(parsed.decisionRationale).slice(0, 1000)
        : ""
    const riskDrivers = Array.isArray(parsed.riskDrivers)
      ? parsed.riskDrivers
          .map((driver): AiBriefDriver | null => {
            if (!driver || typeof driver !== "object") return null
            const record = driver as Record<string, unknown>
            const title =
              typeof record.title === "string"
                ? sanitizeText(record.title).slice(0, 120)
                : ""
            const explanation =
              typeof record.explanation === "string"
                ? sanitizeText(record.explanation).slice(0, 460)
                : ""
            const severity =
              record.severity === "high" || record.severity === "caution"
                ? record.severity
                : "info"
            return title && explanation ? { title, explanation, severity } : null
          })
          .filter((driver): driver is AiBriefDriver => Boolean(driver))
          .slice(0, 5)
      : []

    if (!executiveSummary || !decisionRationale) return null
    return {
      executiveSummary,
      decisionRationale,
      riskDrivers,
      recommendedActions: normalizeList(parsed.recommendedActions, 5),
      limitations: normalizeList(parsed.limitations, 5),
    }
  } catch {
    return null
  }
}

export async function generateAnalysisBrief(input: AnalysisBriefInput): Promise<AiAnalysisBrief> {
  const evidence = buildAnalysisBriefEvidence(input)
  const fallback = buildDeterministicAnalysisBrief(evidence)

  const prompt = [
    "Create a concise Tri-Proof Web3 campaign decision report from the supplied evidence JSON.",
    "Use only the supplied evidence. Do not invent sources, wallet facts, identities, malicious labels, or ownership claims.",
    "The deterministic decision counts and deterministic risk score are authoritative. Never alter or reinterpret them as AI scores.",
    "The aiSidecar section, when present, contains privacy-reduced production AI Evidence Analyst audit records. Treat those records as decision support, not ground truth.",
    "A manual_review or collect_more_evidence AI recommendation is a review signal only; it does not prove Sybil behavior, automation, common ownership, or malicious intent.",
    "If aiSidecar is null, do not imply that the AI Evidence Analyst reviewed wallets for this analysis.",
    "Recommended actions must be operational and conservative: human review, additional evidence collection, or export of already-approved wallets after project confirmation.",
    "Return JSON only with executiveSummary, decisionRationale, riskDrivers, recommendedActions, limitations.",
    "Keep the tone clear, professional, concise, and suitable for a customer-facing security report. Avoid markdown.",
    `Evidence JSON:\n${JSON.stringify(evidence)}`,
  ].join("\n\n")

  const result = await requestGeminiStructuredWithFallback({
    prompt,
    schema: responseJsonSchema,
    systemInstruction:
      "You are the Tri-Proof AI report synthesizer. Preserve deterministic decisions, separate evidence from inference, and never present AI analysis as proof of malicious behavior.",
    model: configuredEvidenceModel(),
    fallbackModel: configuredEvidenceFallbackModel(),
    maxOutputTokens: 1800,
    thinkingLevel: "medium",
    timeoutMs: 20_000,
  })
  if (!result.ok) return fallback

  const parsed = parseGeminiBrief(result.text)
  if (!parsed) return fallback

  return {
    ...parsed,
    source: "gemini",
    model: result.model,
    generatedAt: new Date().toISOString(),
  }
}
