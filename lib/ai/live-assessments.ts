import { createHash } from "node:crypto"

import type {
  AiClusterAssessment,
  AiClusterAnalystInput,
} from "@/lib/ai/cluster-analyst"
import {
  AI_CLUSTER_ASSESSMENT_SCHEMA_VERSION,
  AI_CLUSTER_EVIDENCE_SCHEMA_VERSION,
  AI_CLUSTER_PROMPT_VERSION,
  aiClusterInputHash,
  buildAiClusterEvidencePacket,
  parseAiClusterModelResponse,
} from "@/lib/ai/cluster-analyst"
import type {
  AiEvidenceAnalystInput,
  AiEvidenceAssessment,
} from "@/lib/ai/evidence-analyst"
import {
  AI_EVIDENCE_ASSESSMENT_SCHEMA_VERSION,
  AI_EVIDENCE_PROMPT_VERSION,
  AI_EVIDENCE_SCHEMA_VERSION,
  aiEvidenceInputHash,
  buildAiEvidencePacket,
  parseAiEvidenceModelResponse,
} from "@/lib/ai/evidence-analyst"
import {
  configuredClusterFallbackModel,
  configuredClusterModel,
  configuredEvidenceFallbackModel,
  configuredEvidenceModel,
  requestGeminiStructuredWithFallback,
} from "@/lib/ai/gemini-structured-runtime"

const walletResponseJsonSchema = {
  type: "object",
  properties: {
    evidenceSufficiency: { type: "number", minimum: 0, maximum: 1 },
    organicEvidenceStrength: { type: "number", minimum: 0, maximum: 1 },
    coordinationEvidenceStrength: { type: "number", minimum: 0, maximum: 1 },
    automationEvidenceStrength: { type: "number", minimum: 0, maximum: 1 },
    entityEvidenceStrength: { type: "number", minimum: 0, maximum: 1 },
    contradictions: { type: "array", maxItems: 8, items: { type: "string" } },
    missingEvidence: { type: "array", maxItems: 8, items: { type: "string" } },
    clusterInterpretation: { type: "string" },
    recommendation: {
      type: "string",
      enum: ["no_change", "manual_review", "collect_more_evidence"],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reasonCodes: { type: "array", maxItems: 10, items: { type: "string" } },
    summary: { type: "string" },
    limitations: { type: "array", maxItems: 6, items: { type: "string" } },
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

const clusterResponseJsonSchema = {
  type: "object",
  properties: {
    evidenceSufficiency: { type: "number", minimum: 0, maximum: 1 },
    coordinationEvidenceStrength: { type: "number", minimum: 0, maximum: 1 },
    automationEvidenceStrength: { type: "number", minimum: 0, maximum: 1 },
    neutralExplanationStrength: { type: "number", minimum: 0, maximum: 1 },
    heterogeneityEvidenceStrength: { type: "number", minimum: 0, maximum: 1 },
    counterEvidence: { type: "array", maxItems: 8, items: { type: "string" } },
    unresolvedQuestions: { type: "array", maxItems: 8, items: { type: "string" } },
    interpretation: { type: "string" },
    recommendation: {
      type: "string",
      enum: ["no_change", "manual_review", "collect_more_evidence"],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reasonCodes: { type: "array", maxItems: 10, items: { type: "string" } },
    limitations: { type: "array", maxItems: 6, items: { type: "string" } },
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

function clean(value: string, limit: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, limit)
}

function cleanList(values: string[], limit: number, itemLimit = 320) {
  return values.map((value) => clean(value, itemLimit)).filter(Boolean).slice(0, limit)
}

function walletPrompt(packet: ReturnType<typeof buildAiEvidencePacket>) {
  return [
    "You are Tri-Proof's conservative AI Evidence Analyst in the production decision-support path.",
    "Analyze only the supplied privacy-reduced evidence packet. Never invent wallet history, ownership, identities, relationships, sources, or malicious intent.",
    "The deterministic engine remains authoritative. You cannot approve or reject a wallet.",
    "Use no_change when the deterministic decision is adequately supported.",
    "Use manual_review only for a material evidence conflict or unresolved coordination, automation, or entity ambiguity.",
    "Use collect_more_evidence when missing or truncated evidence materially limits assessment.",
    "Shared funding, similar timing, cluster membership, graph proximity, and automation-like behavior are indicators, not proof of common control or malicious intent.",
    "Known service, exchange, protocol, bridge, or contract context may be neutral evidence. Missing provider data is uncertainty, not malicious evidence.",
    "Scores describe evidence strength only; they are not Tri-Proof risk scores or ground truth.",
    "Return only the JSON object required by the supplied schema.",
    `Prompt version: ${AI_EVIDENCE_PROMPT_VERSION}`,
    `Evidence packet:\n${JSON.stringify(packet)}`,
  ].join("\n\n")
}

function clusterPrompt(packet: ReturnType<typeof buildAiClusterEvidencePacket>) {
  return [
    "You are Tri-Proof's conservative AI Cluster Evidence Analyst in the production decision-support path.",
    "Analyze only the supplied aggregate and privacy-reduced cluster evidence. Never assert common ownership or confirmed Sybil identity from shared funding, timing, graph proximity, or behavior similarity alone.",
    "Actively consider neutral explanations, heterogeneous histories, service funding, shared infrastructure, onboarding patterns, mature wallets, and incomplete evidence.",
    "The deterministic cluster action remains authoritative. You cannot approve or reject a cluster.",
    "Use manual_review only for material unresolved coordination or automation conflict, collect_more_evidence when coverage is materially incomplete, otherwise no_change.",
    "Return only the JSON object required by the supplied schema.",
    `Prompt version: ${AI_CLUSTER_PROMPT_VERSION}`,
    `Cluster evidence packet:\n${JSON.stringify(packet)}`,
  ].join("\n\n")
}

function walletFallback(
  packet: ReturnType<typeof buildAiEvidencePacket>,
  reason: "not_configured" | "provider_unavailable" | "invalid_response"
): AiEvidenceAssessment {
  const inputHash = aiEvidenceInputHash(packet)
  return {
    schemaVersion: AI_EVIDENCE_ASSESSMENT_SCHEMA_VERSION,
    evidenceSchemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
    promptVersion: AI_EVIDENCE_PROMPT_VERSION,
    subjectRef: packet.subjectRef,
    source: "fallback",
    model: null,
    generatedAt: new Date().toISOString(),
    inputHash,
    resultHash: sha256(`production-fallback:${reason}:${inputHash}`),
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

function clusterFallback(
  packet: ReturnType<typeof buildAiClusterEvidencePacket>,
  reason: "not_configured" | "provider_unavailable" | "invalid_response" | "empty_cluster"
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
    resultHash: sha256(`production-cluster-fallback:${reason}:${inputHash}`),
    latencyMs: null,
    evidenceSufficiency: null,
    coordinationEvidenceStrength: null,
    automationEvidenceStrength: null,
    neutralExplanationStrength: null,
    heterogeneityEvidenceStrength: null,
    counterEvidence: [],
    unresolvedQuestions: [],
    interpretation: "AI cluster assessment unavailable; deterministic cluster action remains authoritative.",
    recommendation: "no_change",
    confidence: null,
    reasonCodes: [],
    limitations: ["No AI-derived cluster assessment was applied."],
    fallbackReason: reason,
  }
}

export async function generateLiveAiEvidenceAssessment(
  input: AiEvidenceAnalystInput
): Promise<AiEvidenceAssessment> {
  const packet = buildAiEvidencePacket(input)
  if (!process.env.GEMINI_API_KEY?.trim()) return walletFallback(packet, "not_configured")

  const response = await requestGeminiStructuredWithFallback({
    model: configuredEvidenceModel(),
    fallbackModel: configuredEvidenceFallbackModel(),
    prompt: walletPrompt(packet),
    schema: walletResponseJsonSchema,
    systemInstruction:
      "You are a conservative evidence analyst, not an ownership oracle and not a final decision-maker. Stay evidence-bound and schema-compliant.",
    maxOutputTokens: 2400,
    thinkingLevel: "medium",
    timeoutMs: 20_000,
  })
  if (!response.ok) return walletFallback(packet, "provider_unavailable")

  try {
    const parsed = parseAiEvidenceModelResponse(response.text)
    if (!parsed.success) return walletFallback(packet, "invalid_response")
    const output = parsed.data
    return {
      schemaVersion: AI_EVIDENCE_ASSESSMENT_SCHEMA_VERSION,
      evidenceSchemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
      promptVersion: AI_EVIDENCE_PROMPT_VERSION,
      subjectRef: packet.subjectRef,
      source: "gemini",
      model: response.model,
      generatedAt: new Date().toISOString(),
      inputHash: aiEvidenceInputHash(packet),
      resultHash: sha256(JSON.stringify(output)),
      latencyMs: response.latencyMs,
      ...output,
      contradictions: cleanList(output.contradictions, 8),
      missingEvidence: cleanList(output.missingEvidence, 8),
      clusterInterpretation: clean(output.clusterInterpretation, 700),
      reasonCodes: output.reasonCodes.slice(0, 10),
      summary: clean(output.summary, 900),
      limitations: cleanList(output.limitations, 6),
    }
  } catch {
    return walletFallback(packet, "invalid_response")
  }
}

export async function generateLiveAiClusterAssessment(
  input: AiClusterAnalystInput
): Promise<AiClusterAssessment> {
  const packet = buildAiClusterEvidencePacket(input)
  if (packet.members.representedWallets === 0) return clusterFallback(packet, "empty_cluster")
  if (!process.env.GEMINI_API_KEY?.trim()) return clusterFallback(packet, "not_configured")

  const response = await requestGeminiStructuredWithFallback({
    model: configuredClusterModel(),
    fallbackModel: configuredClusterFallbackModel(),
    prompt: clusterPrompt(packet),
    schema: clusterResponseJsonSchema,
    systemInstruction:
      "You are a conservative cluster evidence analyst, not a Sybil ownership oracle and not a final decision-maker. Stay evidence-bound and schema-compliant.",
    maxOutputTokens: 2400,
    thinkingLevel: "medium",
    timeoutMs: 20_000,
  })
  if (!response.ok) return clusterFallback(packet, "provider_unavailable")

  try {
    const parsed = parseAiClusterModelResponse(response.text)
    if (!parsed.success) return clusterFallback(packet, "invalid_response")
    const output = parsed.data
    return {
      schemaVersion: AI_CLUSTER_ASSESSMENT_SCHEMA_VERSION,
      evidenceSchemaVersion: AI_CLUSTER_EVIDENCE_SCHEMA_VERSION,
      promptVersion: AI_CLUSTER_PROMPT_VERSION,
      clusterRef: packet.clusterRef,
      source: "gemini",
      model: response.model,
      generatedAt: new Date().toISOString(),
      inputHash: aiClusterInputHash(packet),
      resultHash: sha256(JSON.stringify(output)),
      latencyMs: response.latencyMs,
      evidenceSufficiency: output.evidenceSufficiency,
      coordinationEvidenceStrength: output.coordinationEvidenceStrength,
      automationEvidenceStrength: output.automationEvidenceStrength,
      neutralExplanationStrength: output.neutralExplanationStrength,
      heterogeneityEvidenceStrength: output.heterogeneityEvidenceStrength,
      counterEvidence: cleanList(output.counterEvidence, 8),
      unresolvedQuestions: cleanList(output.unresolvedQuestions, 8),
      interpretation: clean(output.interpretation, 900),
      recommendation: output.recommendation,
      confidence: output.confidence,
      reasonCodes: output.reasonCodes.slice(0, 10),
      limitations: cleanList(output.limitations, 6),
    }
  } catch {
    return clusterFallback(packet, "invalid_response")
  }
}
