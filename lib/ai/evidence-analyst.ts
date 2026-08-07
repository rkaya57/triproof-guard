import { createHash } from "node:crypto"

import { z } from "zod"

import type {
  ClusterResult,
  DecisionEvidenceItem,
  WalletGraphSummary,
  WalletRiskResult,
} from "@/types"

export const AI_EVIDENCE_SCHEMA_VERSION = "tri-proof-ai-evidence-v1" as const
export const AI_EVIDENCE_ASSESSMENT_SCHEMA_VERSION =
  "tri-proof-ai-evidence-assessment-v1" as const
export const AI_EVIDENCE_PROMPT_VERSION = "2026-08-07.1" as const

const DEFAULT_MODEL = "gemini-3.6-flash"
const FALLBACK_MODEL = "gemini-3.5-flash"
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"
const MAX_DECISION_EVIDENCE = 14
const MAX_GRAPH_FINDINGS = 6
const MAX_REASON_COUNT = 10
const MAX_CLUSTER_REASONS = 6

export type AiEvidenceRecommendation =
  | "no_change"
  | "manual_review"
  | "collect_more_evidence"

export type AiEvidenceFallbackReason =
  | "disabled"
  | "not_configured"
  | "provider_unavailable"
  | "invalid_response"

export type AiEvidencePacket = {
  schemaVersion: typeof AI_EVIDENCE_SCHEMA_VERSION
  subjectRef: string
  chain: string
  deterministicDecision: {
    status: WalletRiskResult["status"]
    recommendedAction: WalletRiskResult["recommendedAction"]
    riskScore: number
    riskLevel: WalletRiskResult["riskLevel"]
    statusExplanation: string
  }
  entity: {
    type: WalletRiskResult["entityType"]
    label: string | null
    riskReason: string | null
    isContract: boolean | null
    accountType: string | null
    ownerProgram: string | null
    evmContractKind: string | null
  }
  activity: {
    txCount: number | null
    walletAgeDays: number | null
    historyTruncated: boolean | null
    firstSeen: string | null
    lastSeen: string | null
    totalVolume: number | null
    nativeBalance: number | null
    tokenCount: number | null
    contractsCount: number | null
    uniqueCounterparties: number | null
    lastActiveDaysAgo: number | null
    campaignActionsCount: number | null
  }
  funding: {
    hasFundingSource: boolean
    firstFundingAt: string | null
    firstFundingAmount: number | null
  }
  behavior: {
    campaignQualityScore: number | null
    campaignOnlyRatio: number | null
    behaviorDiversityScore: number | null
    botScriptScore: number | null
    behaviorFingerprint: string[]
    reputationLabel: string | null
    policyAction: WalletRiskResult["policyAction"] | null
    policyReason: string | null
    customerLabel: string | null
  }
  coverage: {
    provider: string | null
    status: WalletRiskResult["enrichmentStatus"] | null
  }
  engineReasons: string[]
  decisionEvidence: Array<{
    code: string
    family: DecisionEvidenceItem["family"]
    effect: DecisionEvidenceItem["effect"]
    source: DecisionEvidenceItem["source"]
    title: string
    description: string
  }>
  cluster: {
    walletCount: number
    averageRiskScore: number
    behaviorSimilarityScore: number
    hasSharedFundingSource: boolean
    suggestedAction: ClusterResult["suggestedAction"]
    reasons: string[]
  } | null
  graph: {
    connectedWallets: number
    externalFunders: number
    referralLinks: number
    highRiskComponents: number
    neutralServiceFunders: number
    largestComponent: number
    maxComponentRisk: number
    subjectComponentRisk: number | null
    findings: Array<{
      code: string
      title: string
      description: string
      severity: string
      evidenceCount: number
    }>
  } | null
}

export type AiEvidenceAssessment = {
  schemaVersion: typeof AI_EVIDENCE_ASSESSMENT_SCHEMA_VERSION
  evidenceSchemaVersion: typeof AI_EVIDENCE_SCHEMA_VERSION
  promptVersion: typeof AI_EVIDENCE_PROMPT_VERSION
  subjectRef: string
  source: "gemini" | "fallback"
  model: string | null
  generatedAt: string
  inputHash: string
  resultHash: string
  latencyMs: number | null
  evidenceSufficiency: number | null
  organicEvidenceStrength: number | null
  coordinationEvidenceStrength: number | null
  automationEvidenceStrength: number | null
  entityEvidenceStrength: number | null
  contradictions: string[]
  missingEvidence: string[]
  clusterInterpretation: string
  recommendation: AiEvidenceRecommendation
  confidence: number | null
  reasonCodes: string[]
  summary: string
  limitations: string[]
  fallbackReason?: AiEvidenceFallbackReason
}

export type AiEvidenceAnalystInput = {
  wallet: WalletRiskResult
  cluster?: ClusterResult | null
  graph?: WalletGraphSummary | null
}

const modelResponseSchema = z
  .object({
    evidenceSufficiency: z.number().min(0).max(1),
    organicEvidenceStrength: z.number().min(0).max(1),
    coordinationEvidenceStrength: z.number().min(0).max(1),
    automationEvidenceStrength: z.number().min(0).max(1),
    entityEvidenceStrength: z.number().min(0).max(1),
    contradictions: z.array(z.string().min(1).max(320)).max(8),
    missingEvidence: z.array(z.string().min(1).max(320)).max(8),
    clusterInterpretation: z.string().max(700),
    recommendation: z.enum([
      "no_change",
      "manual_review",
      "collect_more_evidence",
    ]),
    confidence: z.number().min(0).max(1),
    reasonCodes: z.array(z.string().regex(/^[A-Z0-9_]{2,64}$/)).max(10),
    summary: z.string().min(1).max(900),
    limitations: z.array(z.string().min(1).max(320)).max(6),
  })
  .strict()

const responseJsonSchema = {
  type: "object",
  properties: {
    evidenceSufficiency: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "How complete the supplied evidence is for evaluating this wallet, from 0 to 1.",
    },
    organicEvidenceStrength: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Strength of evidence consistent with independent organic user activity. This is not an identity claim.",
    },
    coordinationEvidenceStrength: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Strength of supplied evidence for coordinated multi-wallet behavior. Do not equate coordination with malicious intent.",
    },
    automationEvidenceStrength: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Strength of supplied evidence consistent with scripted or automated behavior.",
    },
    entityEvidenceStrength: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Strength of evidence that the subject is a known non-user entity such as a service, exchange, protocol, bridge, or contract.",
    },
    contradictions: {
      type: "array",
      maxItems: 8,
      items: { type: "string" },
      description: "Material contradictions between the deterministic decision and the supplied evidence, or between evidence families.",
    },
    missingEvidence: {
      type: "array",
      maxItems: 8,
      items: { type: "string" },
      description: "Missing evidence that materially limits a reliable assessment.",
    },
    clusterInterpretation: {
      type: "string",
      description: "Conservative interpretation of cluster context including possible neutral explanations. Never assert common ownership without evidence.",
    },
    recommendation: {
      type: "string",
      enum: ["no_change", "manual_review", "collect_more_evidence"],
      description: "Decision-support recommendation only. The AI is not allowed to approve or reject a wallet.",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Confidence in this evidence assessment, not confidence that the wallet is malicious.",
    },
    reasonCodes: {
      type: "array",
      maxItems: 10,
      items: {
        type: "string",
        pattern: "^[A-Z0-9_]{2,64}$",
      },
    },
    summary: {
      type: "string",
      description: "Concise evidence-grounded assessment. Do not state that a person controls a wallet and do not claim malicious intent without independently verified evidence.",
    },
    limitations: {
      type: "array",
      maxItems: 6,
      items: { type: "string" },
    },
  },
  required: [
    "evidenceSufficiency",
    "organicEvidenceStrength",
    "coordinationEvidenceStrength",
    "automationEvidenceStrength",
    "entityEvidenceStrength",
    "contradictions",
    "missingEvidence",
    "clusterInterpretation",
    "recommendation",
    "confidence",
    "reasonCodes",
    "summary",
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

function cleanString(value: string | null | undefined, limit = 260) {
  const normalized = typeof value === "string" ? sanitizeText(value, limit) : ""
  return normalized || null
}

function cleanList(value: string[] | null | undefined, limit: number, itemLimit = 260) {
  return (value ?? [])
    .map((item) => sanitizeText(item, itemLimit))
    .filter(Boolean)
    .slice(0, limit)
}

function comparableAddress(chain: string, address: string) {
  return /^(ethereum|base|arbitrum|optimism|polygon|bnb|bsc)$/i.test(chain)
    ? address.toLowerCase()
    : address
}

function subjectRef(wallet: Pick<WalletRiskResult, "walletAddress" | "chain">) {
  return `ae-${sha256(`${wallet.chain.toLowerCase()}:${comparableAddress(wallet.chain, wallet.walletAddress)}`).slice(0, 16)}`
}

function matchingCluster(wallet: WalletRiskResult, cluster?: ClusterResult | null) {
  if (!cluster) return null
  if (!cluster.walletAddresses.some((address) => comparableAddress(wallet.chain, address) === comparableAddress(wallet.chain, wallet.walletAddress))) {
    return null
  }
  return {
    walletCount: cluster.walletCount,
    averageRiskScore: cluster.averageRiskScore,
    behaviorSimilarityScore: cluster.behaviorSimilarityScore,
    hasSharedFundingSource: Boolean(cluster.sharedFundingSource),
    suggestedAction: cluster.suggestedAction,
    reasons: cleanList(cluster.reasons, MAX_CLUSTER_REASONS),
  }
}

function matchingGraph(wallet: WalletRiskResult, graph?: WalletGraphSummary | null) {
  if (!graph) return null
  const comparable = comparableAddress(wallet.chain, wallet.walletAddress)
  const component = graph.components.find((item) =>
    item.walletAddresses.some(
      (address) => comparableAddress(wallet.chain, address) === comparable
    )
  )
  const findings = graph.findings
    .filter(
      (finding) =>
        finding.walletAddresses.length === 0 ||
        finding.walletAddresses.some(
          (address) => comparableAddress(wallet.chain, address) === comparable
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
    connectedWallets: graph.connectedWallets,
    externalFunders: graph.externalFunders,
    referralLinks: graph.referralLinks,
    highRiskComponents: graph.highRiskComponents,
    neutralServiceFunders: graph.neutralServiceFunders,
    largestComponent: graph.largestComponent,
    maxComponentRisk: graph.maxComponentRisk,
    subjectComponentRisk: component?.riskScore ?? null,
    findings,
  }
}

export function buildAiEvidencePacket({
  wallet,
  cluster,
  graph,
}: AiEvidenceAnalystInput): AiEvidencePacket {
  const decisionEvidence = (wallet.decisionEvidence?.evidence ?? [])
    .slice(0, MAX_DECISION_EVIDENCE)
    .map((item) => ({
      code: item.code,
      family: item.family,
      effect: item.effect,
      source: item.source,
      title: sanitizeText(item.title, 120),
      description: sanitizeText(item.description, 360),
    }))

  return {
    schemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
    subjectRef: subjectRef(wallet),
    chain: wallet.chain,
    deterministicDecision: {
      status: wallet.status,
      recommendedAction: wallet.recommendedAction,
      riskScore: wallet.riskScore,
      riskLevel: wallet.riskLevel,
      statusExplanation: sanitizeText(wallet.statusExplanation, 500),
    },
    entity: {
      type: wallet.entityType,
      label: cleanString(wallet.entityLabel, 180),
      riskReason: cleanString(wallet.entityRiskReason, 300),
      isContract: wallet.isContract ?? null,
      accountType: cleanString(wallet.accountType, 120),
      ownerProgram: cleanString(wallet.ownerProgram, 160),
      evmContractKind: cleanString(wallet.evmContractKind, 120),
    },
    activity: {
      txCount: wallet.txCount,
      walletAgeDays: wallet.walletAgeDays,
      historyTruncated: wallet.historyTruncated ?? null,
      firstSeen: cleanString(wallet.firstSeen, 64),
      lastSeen: cleanString(wallet.lastSeen, 64),
      totalVolume: wallet.totalVolume,
      nativeBalance: wallet.nativeBalance ?? null,
      tokenCount: wallet.tokenCount ?? null,
      contractsCount: wallet.contractsCount,
      uniqueCounterparties: wallet.uniqueCounterparties ?? null,
      lastActiveDaysAgo: wallet.lastActiveDaysAgo ?? null,
      campaignActionsCount: wallet.campaignActionsCount,
    },
    funding: {
      hasFundingSource: Boolean(wallet.fundingSource),
      firstFundingAt: cleanString(wallet.firstFundingAt, 64),
      firstFundingAmount: wallet.firstFundingAmount ?? null,
    },
    behavior: {
      campaignQualityScore: wallet.campaignQualityScore ?? null,
      campaignOnlyRatio: wallet.campaignOnlyRatio ?? null,
      behaviorDiversityScore: wallet.behaviorDiversityScore ?? null,
      botScriptScore: wallet.botScriptScore ?? null,
      behaviorFingerprint: cleanList(wallet.behaviorFingerprint, 12, 120),
      reputationLabel: cleanString(wallet.reputationLabel, 160),
      policyAction: wallet.policyAction ?? null,
      policyReason: cleanString(wallet.policyReason, 260),
      customerLabel: cleanString(wallet.customerLabel, 160),
    },
    coverage: {
      provider: cleanString(wallet.enrichmentProvider, 100),
      status: wallet.enrichmentStatus ?? null,
    },
    engineReasons: cleanList(wallet.reasons, MAX_REASON_COUNT, 360),
    decisionEvidence,
    cluster: matchingCluster(wallet, cluster),
    graph: matchingGraph(wallet, graph),
  }
}

export function aiEvidenceInputHash(packet: AiEvidencePacket) {
  return sha256(JSON.stringify(packet))
}

export function parseAiEvidenceModelResponse(value: string) {
  const normalized = value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
  const json = normalized.match(/\{[\s\S]*\}/)?.[0] ?? normalized
  return modelResponseSchema.safeParse(JSON.parse(json))
}

function resultHash(result: z.infer<typeof modelResponseSchema>) {
  return sha256(JSON.stringify(result))
}

function fallbackAssessment(
  packet: AiEvidencePacket,
  reason: AiEvidenceFallbackReason
): AiEvidenceAssessment {
  return {
    schemaVersion: AI_EVIDENCE_ASSESSMENT_SCHEMA_VERSION,
    evidenceSchemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
    promptVersion: AI_EVIDENCE_PROMPT_VERSION,
    subjectRef: packet.subjectRef,
    source: "fallback",
    model: null,
    generatedAt: new Date().toISOString(),
    inputHash: aiEvidenceInputHash(packet),
    resultHash: sha256(`fallback:${reason}:${aiEvidenceInputHash(packet)}`),
    latencyMs: null,
    evidenceSufficiency: null,
    organicEvidenceStrength: null,
    coordinationEvidenceStrength: null,
    automationEvidenceStrength: null,
    entityEvidenceStrength: null,
    contradictions: [],
    missingEvidence: [],
    clusterInterpretation: "",
    recommendation: "no_change",
    confidence: null,
    reasonCodes: [],
    summary: "AI evidence assessment unavailable; deterministic Tri-Proof decision remains authoritative.",
    limitations: ["No AI-derived evidence assessment was applied to this result."],
    fallbackReason: reason,
  }
}

function configuredModel() {
  const requested =
    process.env.GEMINI_EVIDENCE_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    DEFAULT_MODEL
  return /^[a-zA-Z0-9._-]{1,80}$/.test(requested) ? requested : DEFAULT_MODEL
}

function candidateModels() {
  return [...new Set([configuredModel(), DEFAULT_MODEL, FALLBACK_MODEL])].slice(0, 2)
}

function analystEnabled() {
  return /^(1|true|yes)$/i.test(process.env.AI_EVIDENCE_ANALYST_ENABLED?.trim() ?? "")
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

function promptFor(packet: AiEvidencePacket) {
  return [
    "You are Tri-Proof's conservative AI Evidence Analyst.",
    "Analyze only the supplied evidence packet. Never invent wallet history, ownership, identities, relationships, sources, or malicious intent.",
    "The deterministic engine remains authoritative. You are not allowed to approve or reject a wallet.",
    "Use recommendation=no_change when the deterministic decision is adequately supported.",
    "Use recommendation=manual_review only when supplied evidence materially conflicts with an automatic decision or reveals unresolved coordination/automation/entity ambiguity.",
    "Use recommendation=collect_more_evidence when missing or truncated evidence prevents a reliable assessment.",
    "Shared funding, similar timing, cluster membership, and automation-like behavior are risk indicators, not proof that one person controls multiple wallets.",
    "Known service/exchange/protocol context can be neutralizing evidence. Missing provider data is uncertainty, not malicious evidence.",
    "Scores describe evidence strength only; they are not Tri-Proof risk scores and must not be presented as ground truth.",
    "Return only the structured response required by the JSON schema.",
    `Prompt version: ${AI_EVIDENCE_PROMPT_VERSION}`,
    `Evidence packet:\n${JSON.stringify(packet)}`,
  ].join("\n\n")
}

export async function generateAiEvidenceAssessment(
  input: AiEvidenceAnalystInput
): Promise<AiEvidenceAssessment> {
  const packet = buildAiEvidencePacket(input)
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
                  text: "You are an evidence analyst, not a wallet ownership oracle and not a final decision-maker. Stay conservative, evidence-bound, and schema-compliant.",
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

      let parsed: ReturnType<typeof parseAiEvidenceModelResponse>
      try {
        parsed = parseAiEvidenceModelResponse(text)
      } catch {
        continue
      }
      if (!parsed.success) continue

      const output = parsed.data
      return {
        schemaVersion: AI_EVIDENCE_ASSESSMENT_SCHEMA_VERSION,
        evidenceSchemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
        promptVersion: AI_EVIDENCE_PROMPT_VERSION,
        subjectRef: packet.subjectRef,
        source: "gemini",
        model,
        generatedAt: new Date().toISOString(),
        inputHash: aiEvidenceInputHash(packet),
        resultHash: resultHash(output),
        latencyMs: Date.now() - startedAt,
        ...output,
        contradictions: cleanList(output.contradictions, 8, 320),
        missingEvidence: cleanList(output.missingEvidence, 8, 320),
        clusterInterpretation: sanitizeText(output.clusterInterpretation, 700),
        reasonCodes: output.reasonCodes.slice(0, 10),
        summary: sanitizeText(output.summary, 900),
        limitations: cleanList(output.limitations, 6, 320),
      }
    } catch {
      // Deterministic engine output remains authoritative on any AI failure.
    }
  }

  return fallbackAssessment(
    packet,
    receivedResponse ? "invalid_response" : "provider_unavailable"
  )
}
