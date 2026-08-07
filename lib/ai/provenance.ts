import { createHash, randomUUID } from "node:crypto"

import { Prisma } from "@prisma/client"

import type { AiClusterAssessment } from "@/lib/ai/cluster-analyst"
import {
  AI_DISAGREEMENT_GATE_SCHEMA_VERSION,
  type AiDisagreementGateResult,
} from "@/lib/ai/disagreement-gate"
import type { AiEvidenceAssessment } from "@/lib/ai/evidence-analyst"
import { db } from "@/lib/db/prisma"

export const AI_AUDIT_SCHEMA_VERSION = "tri-proof-ai-audit-v1" as const
export const AI_GATE_AUDIT_PROMPT_VERSION = "deterministic-gate-v1" as const

export type AiAuditContext =
  | "production_analysis"
  | "internal_benchmark"
  | "holdout_validation"

export type AiAuditSubjectKind = "wallet" | "cluster" | "system"
export type AiAuditStage =
  | "wallet_evidence"
  | "cluster_evidence"
  | "disagreement_gate"
  | "benchmark"
export type AiAuditSource = "gemini" | "fallback" | "deterministic"
export type AiAuditRecommendation =
  | "no_change"
  | "manual_review"
  | "collect_more_evidence"
  | "not_applicable"

export type AiAuditEventInput = {
  analysisId?: string | null
  context: AiAuditContext
  subjectKind: AiAuditSubjectKind
  subjectRef: string
  stage: AiAuditStage
  provider: string
  model?: string | null
  source: AiAuditSource
  promptVersion: string
  evidenceSchemaVersion: string
  assessmentSchemaVersion: string
  inputHash: string
  resultHash: string
  latencyMs?: number | null
  recommendation: AiAuditRecommendation
  confidence?: number | null
  payload: unknown
}

export type AiAuditEvent = AiAuditEventInput & {
  auditSchemaVersion: typeof AI_AUDIT_SCHEMA_VERSION
  eventHash: string
}

const HASH_PATTERN = /^[a-f0-9]{64}$/i
const SUBJECT_REF_PATTERN = /^[a-z]{2,12}-[a-f0-9]{12,64}$/i
const EVM_ADDRESS_PATTERN = /0x[a-fA-F0-9]{40}/
const SOLANA_ADDRESS_PATTERN = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)])
    )
  }
  return value
}

export function stableAuditJson(value: unknown) {
  return JSON.stringify(stableValue(value))
}

function nonEmpty(value: string, name: string, max = 160) {
  const normalized = value.trim()
  if (!normalized || normalized.length > max) {
    throw new Error(`${name} must be between 1 and ${max} characters.`)
  }
  return normalized
}

function validHash(value: string, name: string) {
  const normalized = value.trim().toLowerCase()
  if (!HASH_PATTERN.test(normalized)) {
    throw new Error(`${name} must be a SHA-256 hex digest.`)
  }
  return normalized
}

function privacySafePayload(payload: unknown) {
  const serialized = stableAuditJson(payload)
  if (EVM_ADDRESS_PATTERN.test(serialized) || SOLANA_ADDRESS_PATTERN.test(serialized)) {
    throw new Error(
      "AI audit payload contains a raw blockchain address; store only privacy-reduced evidence and opaque subject references."
    )
  }
  return serialized
}

export function buildAiAuditEvent(input: AiAuditEventInput): AiAuditEvent {
  const subjectRef = nonEmpty(input.subjectRef, "subjectRef", 96)
  if (!SUBJECT_REF_PATTERN.test(subjectRef)) {
    throw new Error("subjectRef must be an opaque Tri-Proof AI reference.")
  }

  const payloadJson = privacySafePayload(input.payload)
  const normalized = {
    auditSchemaVersion: AI_AUDIT_SCHEMA_VERSION,
    analysisId: input.analysisId?.trim() || null,
    context: input.context,
    subjectKind: input.subjectKind,
    subjectRef,
    stage: input.stage,
    provider: nonEmpty(input.provider, "provider", 80),
    model: input.model?.trim() || null,
    source: input.source,
    promptVersion: nonEmpty(input.promptVersion, "promptVersion", 120),
    evidenceSchemaVersion: nonEmpty(
      input.evidenceSchemaVersion,
      "evidenceSchemaVersion",
      120
    ),
    assessmentSchemaVersion: nonEmpty(
      input.assessmentSchemaVersion,
      "assessmentSchemaVersion",
      120
    ),
    inputHash: validHash(input.inputHash, "inputHash"),
    resultHash: validHash(input.resultHash, "resultHash"),
    latencyMs:
      typeof input.latencyMs === "number" &&
      Number.isFinite(input.latencyMs) &&
      input.latencyMs >= 0
        ? Math.round(input.latencyMs)
        : null,
    recommendation: input.recommendation,
    confidence:
      typeof input.confidence === "number" &&
      Number.isFinite(input.confidence) &&
      input.confidence >= 0 &&
      input.confidence <= 1
        ? input.confidence
        : null,
    payload: JSON.parse(payloadJson) as unknown,
  }
  const eventHash = sha256(stableAuditJson(normalized))

  return { ...normalized, eventHash }
}

export async function recordAiAuditEvent(input: AiAuditEventInput) {
  const event = buildAiAuditEvent(input)
  const payloadJson = stableAuditJson(event.payload)
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO "AiEvidenceAudit" (
      "id", "analysisId", "eventHash", "context", "subjectKind", "subjectRef",
      "stage", "provider", "model", "source", "promptVersion",
      "evidenceSchemaVersion", "assessmentSchemaVersion", "inputHash", "resultHash",
      "latencyMs", "recommendation", "confidence", "payload", "createdAt"
    ) VALUES (
      ${randomUUID()}, ${event.analysisId ?? null}, ${event.eventHash}, ${event.context},
      ${event.subjectKind}, ${event.subjectRef}, ${event.stage}, ${event.provider},
      ${event.model ?? null}, ${event.source}, ${event.promptVersion},
      ${event.evidenceSchemaVersion}, ${event.assessmentSchemaVersion}, ${event.inputHash},
      ${event.resultHash}, ${event.latencyMs ?? null}, ${event.recommendation},
      ${event.confidence ?? null}, ${payloadJson}::jsonb, NOW()
    )
    ON CONFLICT ("eventHash") DO NOTHING
    RETURNING "id"
  `)

  return {
    eventHash: event.eventHash,
    inserted: rows.length === 1,
    id: rows[0]?.id ?? null,
  }
}

function providerFor(source: "gemini" | "fallback") {
  return source === "gemini" ? "gemini" : "triproof_fallback"
}

export function walletAssessmentAuditInput(
  assessment: AiEvidenceAssessment,
  options: { analysisId?: string | null; context: AiAuditContext }
): AiAuditEventInput {
  return {
    analysisId: options.analysisId ?? null,
    context: options.context,
    subjectKind: "wallet",
    subjectRef: assessment.subjectRef,
    stage: "wallet_evidence",
    provider: providerFor(assessment.source),
    model: assessment.model,
    source: assessment.source,
    promptVersion: assessment.promptVersion,
    evidenceSchemaVersion: assessment.evidenceSchemaVersion,
    assessmentSchemaVersion: assessment.schemaVersion,
    inputHash: assessment.inputHash,
    resultHash: assessment.resultHash,
    latencyMs: assessment.latencyMs,
    recommendation: assessment.recommendation,
    confidence: assessment.confidence,
    payload: assessment,
  }
}

export function clusterAssessmentAuditInput(
  assessment: AiClusterAssessment,
  options: { analysisId?: string | null; context: AiAuditContext }
): AiAuditEventInput {
  return {
    analysisId: options.analysisId ?? null,
    context: options.context,
    subjectKind: "cluster",
    subjectRef: assessment.clusterRef,
    stage: "cluster_evidence",
    provider: providerFor(assessment.source),
    model: assessment.model,
    source: assessment.source,
    promptVersion: assessment.promptVersion,
    evidenceSchemaVersion: assessment.evidenceSchemaVersion,
    assessmentSchemaVersion: assessment.schemaVersion,
    inputHash: assessment.inputHash,
    resultHash: assessment.resultHash,
    latencyMs: assessment.latencyMs,
    recommendation: assessment.recommendation,
    confidence: assessment.confidence,
    payload: assessment,
  }
}

function privacyReducedGatePayload(result: AiDisagreementGateResult) {
  return {
    gateSchemaVersion: result.schemaVersion,
    applied: result.applied,
    trigger: result.trigger,
    reasonCode: result.reasonCode,
    assessmentSubjectRef: result.assessmentSubjectRef,
    originalStatus: result.originalStatus,
    finalStatus: result.finalStatus,
    originalRecommendedAction: result.originalRecommendedAction,
    finalRecommendedAction: result.finalRecommendedAction,
    originalRiskScore: result.originalRiskScore,
    finalRiskScore: result.finalRiskScore,
    originalRiskLevel: result.originalRiskLevel,
    finalRiskLevel: result.finalRiskLevel,
    riskScoreUnchanged: result.riskScoreUnchanged,
  }
}

export function disagreementGateAuditInput(
  result: AiDisagreementGateResult,
  assessment: AiEvidenceAssessment,
  options: { analysisId?: string | null; context: AiAuditContext }
): AiAuditEventInput {
  if (result.assessmentSubjectRef !== assessment.subjectRef) {
    throw new Error("Gate result and AI assessment subject references do not match.")
  }
  const payload = privacyReducedGatePayload(result)
  const inputHash = sha256(
    stableAuditJson({
      assessmentResultHash: assessment.resultHash,
      subjectRef: assessment.subjectRef,
      originalStatus: result.originalStatus,
      originalRecommendedAction: result.originalRecommendedAction,
      originalRiskScore: result.originalRiskScore,
      originalRiskLevel: result.originalRiskLevel,
    })
  )
  const resultHash = sha256(stableAuditJson(payload))

  return {
    analysisId: options.analysisId ?? null,
    context: options.context,
    subjectKind: "wallet",
    subjectRef: assessment.subjectRef,
    stage: "disagreement_gate",
    provider: "triproof",
    model: assessment.model,
    source: "deterministic",
    promptVersion: AI_GATE_AUDIT_PROMPT_VERSION,
    evidenceSchemaVersion: assessment.evidenceSchemaVersion,
    assessmentSchemaVersion: AI_DISAGREEMENT_GATE_SCHEMA_VERSION,
    inputHash,
    resultHash,
    latencyMs: 0,
    recommendation: result.applied ? "manual_review" : "no_change",
    confidence: assessment.confidence,
    payload,
  }
}
