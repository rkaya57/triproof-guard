import { createHash } from "node:crypto"

import { z } from "zod"

import type {
  ClusterResult,
  EntityType,
  RiskLevel,
  WalletGraphSummary,
  WalletRiskResult,
  WalletStatus,
} from "@/types"

export const AI_CLUSTER_EVIDENCE_SCHEMA_VERSION =
  "tri-proof-ai-cluster-evidence-v1" as const
export const AI_CLUSTER_ASSESSMENT_SCHEMA_VERSION =
  "tri-proof-ai-cluster-assessment-v1" as const
export const AI_CLUSTER_PROMPT_VERSION = "2026-08-07.1" as const

const DEFAULT_MODEL = "gemini-3.6-flash"
const FALLBACK_MODEL = "gemini-3.5-flash"
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"
const MAX_CLUSTER_REASONS = 8
const MAX_GRAPH_FINDINGS = 8
const MAX_COUNTER_EVIDENCE = 8
const MAX_UNRESOLVED_QUESTIONS = 8

export type AiClusterRecommendation =
  | "no_change"
  | "manual_review"
  | "collect_more_evidence"

export type AiClusterFallbackReason =
  | "disabled"
  | "not_configured"
  | "provider_unavailable"
  | "invalid_response"
  | "empty_cluster"

export type AiClusterEvidencePacket = {
  schemaVersion: typeof AI_CLUSTER_EVIDENCE_SCHEMA_VERSION
  clusterRef: string
  chain: string
  deterministicCluster: {
    walletCount: number
    averageRiskScore: number
    behaviorSimilarityScore: number
    hasSharedFundingSource: boolean
    suggestedAction: ClusterResult["suggestedAction"]
    reasons: string[]
  }
  members: {
    representedWallets: number
    decisions: Record<WalletStatus, number>
    riskLevels: Record<RiskLevel, number>
    entityTypes: Record<EntityType, number>
    enrichmentCompleted: number
    enrichmentIncomplete: number
    historyTruncated: number
    activity: {
      txCountObserved: number
      txCountMin: number | null
      txCountMax: number | null
      walletAgeObserved: number
      walletAgeMinDays: number | null
      walletAgeMaxDays: number | null
      counterpartiesObserved: number
      counterpartiesMin: number | null
      counterpartiesMax: number | null
    }
  }
  graph: {
    relatedComponents: number
    maxRelatedComponentRisk: number | null
    highRiskRelatedComponents: number
    findings: Array<{
      code: string
      title: string
      description: string
      severity: string
      evidenceCount: number
    }>
  } | null
}

export type AiClusterAssessment = {
  schemaVersion: typeof AI_CLUSTER_ASSESSMENT_SCHEMA_VERSION
  evidenceSchemaVersion: typeof AI_CLUSTER_EVIDENCE_SCHEMA_VERSION
  promptVersion: typeof AI_CLUSTER_PROMPT_VERSION
  clusterRef: string
  source: "gemini" | "fallback"
  model: string | null
  generatedAt: string
  inputHash: string
  resultHash: string
  latencyMs: number | null
  evidenceSufficiency: number | null
  coordinationEvidenceStrength: number | null
  automationEvidenceStrength: number | null
  neutralExplanationStrength: number | null
  heterogeneityEvidenceStrength: number | null
  counterEvidence: string[]
  unresolvedQuestions: string[]
  interpretation: string
  recommendation: AiClusterRecommendation
  confidence: number | null
  reasonCodes: string[]
  limitations: string[]
  fallbackReason?: AiClusterFallbackReason
}

export type AiClusterAnalystInput = {
  cluster: ClusterResult
  wallets: WalletRiskResult[]
  graph?: WalletGraphSummary | null
}

const modelResponseSchema = z
  .object({
    evidenceSufficiency: z.number().min(0).max(1),
    coordinationEvidenceStrength: z.number().min(0).max(1),
    automationEvidenceStrength: z.number().min(0).max(1),
    neutralExplanationStrength: z.number().min(0).max(1),
    heterogeneityEvidenceStrength: z.number().min(0).max(1),
    counterEvidence: z.array(z.string().min(1).max(320)).max(MAX_COUNTER_EVIDENCE),
    unresolvedQuestions: z
      .array(z.string().min(1).max(320))
      .max(MAX_UNRESOLVED_QUESTIONS),
    interpretation: z.string().min(1).max(900),
    recommendation: z.enum([
      "no_change",
      "manual_review",
      "collect_more_evidence",
    ]),
    confidence: z.number().min(0).max(1),
    reasonCodes: z.array(z.string().min(2).max(64)).max(10),
    limitations: z.array(z.string().min(1).max(320)).max(6),
  })
  .strict()

const responseJsonSchema = {
  type: "object",
  properties: {
    evidenceSufficiency: { type: "number", minimum: 0, maximum: 1 },
    coordinationEvidenceStrength: { type: "number", minimum: 0, maximum: 1 },
    automationEvidenceStrength: { type: "number", minimum: 0, maximum: 1 },
    neutralExplanationStrength: { type: "number", minimum: 0, maximum: 1 },
    heterogeneityEvidenceStrength: { type: "number", minimum: 0, maximum: 1 },
    counterEvidence: {
      type: "array",
      maxItems: MAX_COUNTER_EVIDENCE,
      items: { type: "string" },
    },
    unresolvedQuestions: {
      type: "array",
      maxItems: MAX_UNRESOLVED_QUESTIONS,
      items: { type: "string" },
    },
    interpretation: { type: "string" },
    recommendation: {
      type: "string",
      enum: ["no_change", "manual_review", "collect_more_evidence"],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reasonCodes: {
      type: "array",
      maxItems: 10,
      items: { type: "string" },
    },
    limitations: {
      type: "array",
      maxItems: 6,
      items: { type: "string" },
    },
  },
  required: [
    "evidenceSufficiency",
    "coordinationEvidenceStrength",
    "automationEvidenceStrength",
    "neutralExplanationStrength",
    "heterogeneityEvidenceStrength",
    "counterEvidence",
    "unresolvedQuestions",
    "interpretation",
    "recommendation",
    "confidence",
    "reasonCodes",
    "limitations",
  ],
  additionalProperties: false,
} as const

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function sanitizeText(value: string, limit = 420) {
  return value
    .replace(/https?:\/\/[^\s]+/gi, "[url]")
    .replace(/0x[a-fA-F0-9]{16,}/g, "[address]")
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, "[address]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit)
}

function cleanList(values: string[], limit: number, itemLimit = 320) {
  return values
    .map((value) => sanitizeText(value, itemLimit))
    .filter(Boolean)
    .slice(0, limit)
}

function comparableAddress(chain: string, address: string) {
  return /^(ethereum|base|arbitrum|optimism|polygon|bnb|bsc)$/i.test(chain)
    ? address.toLowerCase()
    : address
}

function clusterMembers(cluster: ClusterResult, wallets: WalletRiskResult[]) {
  const members = new Set(
    cluster.walletAddresses.map((address) =>
      comparableAddress(wallets[0]?.chain ?? "", address)
    )
  )
  return wallets.filter((wallet) =>
    members.has(comparableAddress(wallet.chain, wallet.walletAddress))
  )
}

function numericRange(values: Array<number | null | undefined>) {
  const observed = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  )
  return {
    observed: observed.length,
    min: observed.length ? Math.min(...observed) : null,
    max: observed.length ? Math.max(...observed) : null,
  }
}

function emptyStatusCounts(): Record<WalletStatus, number> {
  return { approved: 0, manual_review: 0, rejected: 0 }
}

function emptyRiskCounts(): Record<RiskLevel, number> {
  return { low: 0, medium: 0, high: 0, critical: 0 }
}

function emptyEntityCounts(): Record<EntityType, number> {
  return {
    exchange: 0,
    service: 0,
    bridge: 0,
    contract: 0,
    protocol: 0,
    unknown: 0,
    user: 0,
  }
}

function clusterRef(cluster: ClusterResult, members: WalletRiskResult[]) {
  const memberKeys = members
    .map((wallet) => `${wallet.chain.toLowerCase()}:${comparableAddress(wallet.chain, wallet.walletAddress)}`)
    .sort()
  return `ac-${sha256(`${cluster.walletCount}:${memberKeys.join("|")}`).slice(0, 16)}`
}

function relatedGraph(
  members: WalletRiskResult[],
  graph?: WalletGraphSummary | null
): AiClusterEvidencePacket["graph"] {
  if (!graph || members.length === 0) return null

  const addresses = new Set(
    members.map((wallet) => comparableAddress(wallet.chain, wallet.walletAddress))
  )
  const chain = members[0]?.chain ?? ""
  const components = graph.components.filter((component) =>
    component.walletAddresses.some((address) =>
      addresses.has(comparableAddress(chain, address))
    )
  )
  const findings = graph.findings
    .filter((finding) =>
      finding.walletAddresses.some((address) =>
        addresses.has(comparableAddress(chain, address))
      )
    )
    .slice(0, MAX_GRAPH_FINDINGS)
    .map((finding) => ({
      code: finding.code,
      title: sanitizeText(finding.title, 120),
      description: sanitizeText(finding.description, 360),
      severity: finding.severity,
      evidenceCount: finding.evidenceCount,
    }))

  return {
    relatedComponents: components.length,
    maxRelatedComponentRisk: components.length
      ? Math.max(...components.map((component) => component.riskScore))
      : null,
    highRiskRelatedComponents: components.filter(
      (component) => component.severity === "high" || component.severity === "critical"
    ).length,
    findings,
  }
}

export function buildAiClusterEvidencePacket({
  cluster,
  wallets,
  graph,
}: AiClusterAnalystInput): AiClusterEvidencePacket {
  const members = clusterMembers(cluster, wallets)
  const decisions = emptyStatusCounts()
  const riskLevels = emptyRiskCounts()
  const entityTypes = emptyEntityCounts()
  let enrichmentCompleted = 0
  let enrichmentIncomplete = 0
  let historyTruncated = 0

  members.forEach((wallet) => {
    decisions[wallet.status] += 1
    riskLevels[wallet.riskLevel] += 1
    entityTypes[wallet.entityType] += 1
    if (wallet.enrichmentStatus === "completed") enrichmentCompleted += 1
    else enrichmentIncomplete += 1
    if (wallet.historyTruncated === true) historyTruncated += 1
  })

  const txCount = numericRange(members.map((wallet) => wallet.txCount))
  const walletAge = numericRange(members.map((wallet) => wallet.walletAgeDays))
  const counterparties = numericRange(
    members.map((wallet) => wallet.uniqueCounterparties)
  )

  return {
    schemaVersion: AI_CLUSTER_EVIDENCE_SCHEMA_VERSION,
    clusterRef: clusterRef(cluster, members),
    chain: members[0]?.chain ?? "unknown",
    deterministicCluster: {
      walletCount: cluster.walletCount,
      averageRiskScore: cluster.averageRiskScore,
      behaviorSimilarityScore: cluster.behaviorSimilarityScore,
      hasSharedFundingSource: Boolean(cluster.sharedFundingSource),
      suggestedAction: cluster.suggestedAction,
      reasons: cleanList(cluster.reasons, MAX_CLUSTER_REASONS),
    },
    members: {
      representedWallets: members.length,
      decisions,
      riskLevels,
      entityTypes,
      enrichmentCompleted,
      enrichmentIncomplete,
      historyTruncated,
      activity: {
        txCountObserved: txCount.observed,
        txCountMin: txCount.min,
        txCountMax: txCount.max,
        walletAgeObserved: walletAge.observed,
        walletAgeMinDays: walletAge.min,
        walletAgeMaxDays: walletAge.max,
        counterpartiesObserved: counterparties.observed,
        counterpartiesMin: counterparties.min,
        counterpartiesMax: counterparties.max,
      },
    },
    graph: relatedGraph(members, graph),
  }
}

export function aiClusterInputHash(packet: AiClusterEvidencePacket) {
  return sha256(JSON.stringify(packet))
}

export function parseAiClusterModelResponse(value: string) {
  const normalized = value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
  const json = normalized.match(/\{[\s\S]*\}/)?.[0] ?? normalized
  return modelResponseSchema.safeParse(JSON.parse(json))
}

function analystEnabled() {
  return /^(1|true|yes)$/i.test(
    process.env.AI_CLUSTER_ANALYST_ENABLED?.trim() ?? ""
  )
}

function configuredModel() {
  const requested =
    process.env.GEMINI_CLUSTER_MODEL?.trim() ||
    process.env.GEMINI_EVIDENCE_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    DEFAULT_MODEL
  return /^[a-zA-Z0-9._-]{1,80}$/.test(requested) ? requested : DEFAULT_MODEL
}

function candidateModels() {
  return [...new Set([configuredModel(), DEFAULT_MODEL, FALLBACK_MODEL])].slice(0, 2)
}

function fallbackAssessment(
  packet: AiClusterEvidencePacket,
  reason: AiClusterFallbackReason
): AiClusterAssessment {
  const inputHash = aiClusterInputHash(packet)
  return {
    schemaVersion: AI_CLUSTER_ASSESSMENT_SCHEMA_VERSION,
    evidenceSchemaVersion: AI_CLUSTER_EVIDENCE_SCHEMA_VERSION,
    promptVersion: AI_CLUSTER_PROMPT_VERSION,
    clusterRef: packet.clusterRef,
    source: "fallback",
    model: null,
    generatedAt: new Date().toISOString(),
    inputHash,
    resultHash: sha256(`fallback:${reason}:${inputHash}`),
    latencyMs: null,
    evidenceSufficiency: null,
    coordinationEvidenceStrength: null,
    automationEvidenceStrength: null,
    neutralExplanationStrength: null,
    heterogeneityEvidenceStrength: null,
    counterEvidence: [],
    unresolvedQuestions: [],
    interpretation: "AI cluster assessment unavailable; deterministic cluster analysis remains authoritative.",
    recommendation: "no_change",
    confidence: null,
    reasonCodes: [],
    limitations: ["No AI-derived cluster assessment was applied."],
    fallbackReason: reason,
  }
}

function extractResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null
  const candidates = (payload as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates)) return null
  const parts = (
    candidates[0] as
      | { content?: { parts?: Array<{ text?: unknown; thought?: unknown }> } }
      | undefined
  )?.content?.parts
  if (!Array.isArray(parts)) return null
  const text = parts
    .filter((part) => part.thought !== true)
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim()
  return text || null
}

function promptFor(packet: AiClusterEvidencePacket) {
  return [
    "You are Tri-Proof's conservative cluster evidence analyst.",
    "Analyze only the supplied aggregate cluster evidence. Never infer or assert that one person controls multiple wallets unless independently verified evidence explicitly proves it; this packet does not provide such proof.",
    "Shared funding, similar timing, graph proximity, behavior similarity, or campaign coordination are indicators, not proof of Sybil identity or malicious intent.",
    "Actively look for neutral explanations and heterogeneity: exchanges, service funders, shared infrastructure, onboarding patterns, mature wallet histories, mixed entity types, incomplete history, or diverse activity.",
    "The deterministic cluster action remains authoritative. You cannot approve or reject a cluster.",
    "Use recommendation=manual_review only for material unresolved coordination/automation conflict. Use collect_more_evidence when coverage is materially insufficient. Otherwise use no_change.",
    "Return only the structured JSON response required by the schema.",
    `Prompt version: ${AI_CLUSTER_PROMPT_VERSION}`,
    `Cluster evidence packet:\n${JSON.stringify(packet)}`,
  ].join("\n\n")
}

export async function generateAiClusterAssessment(
  input: AiClusterAnalystInput
): Promise<AiClusterAssessment> {
  const packet = buildAiClusterEvidencePacket(input)
  if (packet.members.representedWallets === 0) {
    return fallbackAssessment(packet, "empty_cluster")
  }
  if (!analystEnabled()) return fallbackAssessment(packet, "disabled")

  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return fallbackAssessment(packet, "not_configured")

  let receivedResponse = false
  for (const model of candidateModels()) {
    const startedAt = Date.now()
    try {
      const response = await fetch(
        `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: "You are a conservative evidence analyst, not a Sybil ownership oracle and not a final decision-maker. Stay evidence-bound and schema-compliant.",
                },
              ],
            },
            contents: [{ role: "user", parts: [{ text: promptFor(packet) }] }],
            generationConfig: {
              maxOutputTokens: 1800,
              thinkingConfig: { thinkingLevel: "medium" },
              responseFormat: {
                text: {
                  mimeType: "application/json",
                  schema: responseJsonSchema,
                },
              },
            },
          }),
          signal: AbortSignal.timeout(15_000),
        }
      )
      if (!response.ok) continue

      receivedResponse = true
      const text = extractResponseText(await response.json())
      if (!text) continue

      let parsed: ReturnType<typeof parseAiClusterModelResponse>
      try {
        parsed = parseAiClusterModelResponse(text)
      } catch {
        continue
      }
      if (!parsed.success) continue

      const output = parsed.data
      return {
        schemaVersion: AI_CLUSTER_ASSESSMENT_SCHEMA_VERSION,
        evidenceSchemaVersion: AI_CLUSTER_EVIDENCE_SCHEMA_VERSION,
        promptVersion: AI_CLUSTER_PROMPT_VERSION,
        clusterRef: packet.clusterRef,
        source: "gemini",
        model,
        generatedAt: new Date().toISOString(),
        inputHash: aiClusterInputHash(packet),
        resultHash: sha256(JSON.stringify(output)),
        latencyMs: Date.now() - startedAt,
        evidenceSufficiency: output.evidenceSufficiency,
        coordinationEvidenceStrength: output.coordinationEvidenceStrength,
        automationEvidenceStrength: output.automationEvidenceStrength,
        neutralExplanationStrength: output.neutralExplanationStrength,
        heterogeneityEvidenceStrength: output.heterogeneityEvidenceStrength,
        counterEvidence: cleanList(output.counterEvidence, MAX_COUNTER_EVIDENCE),
        unresolvedQuestions: cleanList(
          output.unresolvedQuestions,
          MAX_UNRESOLVED_QUESTIONS
        ),
        interpretation: sanitizeText(output.interpretation, 900),
        recommendation: output.recommendation,
        confidence: output.confidence,
        reasonCodes: output.reasonCodes
          .map((code) => code.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))
          .filter(Boolean)
          .slice(0, 10),
        limitations: cleanList(output.limitations, 6),
      }
    } catch {
      // Deterministic cluster analysis remains authoritative on any AI failure.
    }
  }

  return fallbackAssessment(
    packet,
    receivedResponse ? "invalid_response" : "provider_unavailable"
  )
}
