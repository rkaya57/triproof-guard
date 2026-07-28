import { createHash } from "node:crypto"

import type {
  AiAnalysisBrief,
  AiBriefDriver,
  ClusterResult,
  EnrichmentMeta,
  WalletGraphSummary,
  WalletRiskResult,
} from "@/types"

const defaultModel = "gemini-3.5-flash"
const geminiEndpoint = "https://generativelanguage.googleapis.com/v1beta/models"
const maxReasonCount = 8
const maxGraphFindings = 5

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
  if (evidence.graph?.highRiskComponents) {
    actions.push("Review the connected funding and referral components before approving linked wallets.")
  }
  if ((evidence.enrichment?.warnings ?? 0) > 0) {
    actions.push("Recheck wallets with incomplete provider coverage before making a final exclusion decision.")
  }
  return actions.slice(0, 4)
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
  const drivers = evidence.topReasons.slice(0, 4).map((item) => ({
    title: reasonTitle(item.reason),
    explanation: `${item.count} wallet${item.count === 1 ? "" : "s"} carried this evidence: ${item.reason}`,
    severity: classifyDriver(item.reason),
  }))

  return {
    source: "fallback",
    model: null,
    generatedAt: new Date().toISOString(),
    executiveSummary: `${decision.approved} of ${evidence.totalWallets} wallets are approved, ${decision.review} require review, and ${decision.rejected} are not eligible under the ${evidence.riskPolicy} policy.${graphSummary}`,
    decisionRationale: `The report combines wallet activity, campaign behavior, entity context, and corroborated funding or referral evidence. The average risk score is ${evidence.averageRiskScore}/100; final reward decisions remain with the project team.`,
    riskDrivers: drivers.length
      ? drivers
      : [{ title: "No dominant risk pattern", explanation: "No repeated risk reason was recorded in this analysis.", severity: "info" }],
    recommendedActions: fallbackActions(evidence),
    limitations: [
      "This brief is decision support, not proof of wallet ownership or malicious intent.",
      "Missing provider data or incomplete campaign context can reduce confidence.",
    ],
  }
}

function configuredGeminiModel() {
  const model = process.env.GEMINI_MODEL?.trim() || defaultModel
  return /^[a-zA-Z0-9._-]{1,80}$/.test(model) ? model : defaultModel
}

function extractText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null
  const candidates = (payload as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates)) return null
  const parts = (candidates[0] as { content?: { parts?: Array<{ text?: unknown }> } } | undefined)
    ?.content?.parts
  if (!Array.isArray(parts)) return null
  const text = parts.map((part) => (typeof part.text === "string" ? part.text : "")).join("\n").trim()
  return text || null
}

function parseGeminiBrief(value: string): Omit<AiAnalysisBrief, "source" | "model" | "generatedAt"> | null {
  const normalized = value.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "")
  try {
    const parsed = JSON.parse(normalized) as Record<string, unknown>
    const executiveSummary = typeof parsed.executiveSummary === "string" ? sanitizeText(parsed.executiveSummary).slice(0, 900) : ""
    const decisionRationale = typeof parsed.decisionRationale === "string" ? sanitizeText(parsed.decisionRationale).slice(0, 900) : ""
    const riskDrivers = Array.isArray(parsed.riskDrivers)
      ? parsed.riskDrivers
          .map((driver): AiBriefDriver | null => {
            if (!driver || typeof driver !== "object") return null
            const record = driver as Record<string, unknown>
            const title = typeof record.title === "string" ? sanitizeText(record.title).slice(0, 120) : ""
            const explanation = typeof record.explanation === "string" ? sanitizeText(record.explanation).slice(0, 420) : ""
            const severity = record.severity === "high" || record.severity === "caution" ? record.severity : "info"
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
      limitations: normalizeList(parsed.limitations, 4),
    }
  } catch {
    return null
  }
}

export async function generateAnalysisBrief(input: AnalysisBriefInput): Promise<AiAnalysisBrief> {
  const evidence = buildAnalysisBriefEvidence(input)
  const fallback = buildDeterministicAnalysisBrief(evidence)
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return fallback

  const model = configuredGeminiModel()
  const prompt = [
    "Create a concise Web3 campaign risk decision brief from the supplied evidence JSON.",
    "Use only the evidence supplied. Do not invent sources, wallet facts, identities, or risk findings.",
    "Do not change the stated decision counts, do not promise safety, and do not state that a person controls a wallet.",
    "Return JSON only with executiveSummary, decisionRationale, riskDrivers, recommendedActions, limitations.",
    "riskDrivers must contain title, explanation, and severity (info, caution, or high).",
    "Keep the tone clear, professional, and operational. Avoid markdown.",
    `Evidence JSON:\n${JSON.stringify(evidence)}`,
  ].join("\n\n")

  try {
    const response = await fetch(`${geminiEndpoint}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 900,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return fallback

    const parsed = parseGeminiBrief(extractText(await response.json()) ?? "")
    if (!parsed) return fallback

    return { ...parsed, source: "gemini", model, generatedAt: new Date().toISOString() }
  } catch {
    return fallback
  }
}
