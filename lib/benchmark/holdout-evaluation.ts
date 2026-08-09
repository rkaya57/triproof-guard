import { createHash } from "node:crypto"

import Papa from "papaparse"

import { buildExplainableDecision } from "@/lib/campaign-security/decision-evidence"
import type {
  EntityType,
  RiskLevel,
  SuggestedAction,
  WalletRiskResult,
  WalletStatus,
} from "@/types"
import {
  getHoldoutArtifact,
  putImmutableHoldoutArtifact,
} from "@/lib/benchmark/holdout-artifacts"
import type { HoldoutGroundTruthSetPayload } from "@/lib/benchmark/holdout-review-import"
import type { PersistedHoldoutRun } from "@/lib/benchmark/holdout-store"
import { updateHoldoutRunStatus } from "@/lib/benchmark/holdout-store"
import {
  HOLDOUT_DEFAULT_MODEL,
  buildHoldoutDesignReadiness,
  buildHoldoutFinalClaimGate,
  buildHoldoutStackFingerprint,
  resolveProductionCommitSha,
  type HoldoutFinalClaimGate,
  type HoldoutStackFingerprint,
} from "@/lib/benchmark/holdout-v1"
import {
  calculateBenchmarkMetrics,
  DEFAULT_BENCHMARK_THRESHOLDS,
  type BenchmarkMetricsReport,
  type BenchmarkObservation,
} from "@/lib/benchmark/metrics"
import { benchmarkWalletInputSchema, walletStatusSchema } from "@/lib/benchmark/schema"

export const HOLDOUT_EVALUATION_SCHEMA_VERSION =
  "tri-proof-independent-holdout-evaluation-v1" as const

type AuditRow = Record<string, string | undefined>

type PrivateSealPayload = {
  schemaVersion: string
  runId: string
  freezeHash: string
  stackHash: string
  candidateNotBefore: string
  batchId: string
  generatedAt: string
  reviewerSha256: string
  auditSha256: string
  representativeCases: number
  contextRows: number
  projects: number
  byChain: Record<string, number>
  auditCsv: string
}

export type HoldoutEvaluationPayload = {
  schemaVersion: typeof HOLDOUT_EVALUATION_SCHEMA_VERSION
  runId: string
  batchId: string
  evaluatedAt: string
  freezeHash: string
  frozenStackHash: string
  currentStack: HoldoutStackFingerprint
  currentStackHash: string
  privateSealArtifactHash: string
  groundTruthArtifactHash: string
  observationsHash: string
  observations: BenchmarkObservation[]
  metrics: BenchmarkMetricsReport
  finalClaimGate: HoldoutFinalClaimGate
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function required(row: AuditRow, key: string, rowNumber: number) {
  const value = row[key]?.trim()
  if (!value) throw new Error(`Private audit row ${rowNumber}: ${key} is required`)
  return value
}

function optionalNumber(value: string | undefined) {
  const text = value?.trim()
  if (!text) return null
  const parsed = Number(text)
  if (!Number.isFinite(parsed)) throw new Error(`Invalid frozen numeric value: ${text}`)
  return parsed
}

function entityType(value: string | undefined): EntityType {
  const normalized = value?.trim()
  if (
    normalized === "exchange" ||
    normalized === "service" ||
    normalized === "bridge" ||
    normalized === "contract" ||
    normalized === "protocol" ||
    normalized === "unknown" ||
    normalized === "user"
  ) {
    return normalized
  }
  throw new Error(`Invalid frozen entity type: ${normalized || "empty"}`)
}

function riskLevel(value: string | undefined): RiskLevel {
  const normalized = value?.trim()
  if (
    normalized === "low" ||
    normalized === "medium" ||
    normalized === "high" ||
    normalized === "critical"
  ) {
    return normalized
  }
  throw new Error(`Invalid frozen risk level: ${normalized || "empty"}`)
}

function suggestedAction(value: string | undefined): SuggestedAction {
  const normalized = value?.trim()
  if (
    normalized === "approve" ||
    normalized === "manual_review" ||
    normalized === "reject"
  ) {
    return normalized
  }
  throw new Error(`Invalid frozen recommended action: ${normalized || "empty"}`)
}

function status(value: string | undefined): WalletStatus {
  const parsed = walletStatusSchema.safeParse(value?.trim())
  if (!parsed.success) {
    throw new Error(`Invalid frozen engine status: ${value?.trim() || "empty"}`)
  }
  return parsed.data
}

function parseReasons(value: string | undefined) {
  try {
    const parsed = JSON.parse(value?.trim() || "[]") as unknown
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      throw new Error("not-string-array")
    }
    return parsed
  } catch {
    throw new Error("Frozen reasons_json is not a string array")
  }
}

function frozenWalletResult(row: AuditRow, rowNumber: number): WalletRiskResult {
  const inputRaw = JSON.parse(required(row, "input_json", rowNumber)) as unknown
  const input = benchmarkWalletInputSchema.parse(inputRaw)
  const predictedStatus = status(row.engine_status)
  const reasons = parseReasons(row.reasons_json)

  return {
    walletAddress: input.walletAddress,
    chain: input.chain,
    entityLabel: row.entity_label?.trim() || input.knownEntityLabel || null,
    entityType: entityType(row.entity_type || input.knownEntityType || "unknown"),
    entityRiskReason: null,
    riskScore: optionalNumber(row.risk_score) ?? 0,
    riskLevel: riskLevel(row.risk_level),
    status: predictedStatus,
    recommendedAction: suggestedAction(row.recommended_action),
    statusExplanation: row.status_explanation?.trim() || "Frozen holdout engine decision.",
    fundingSource: input.fundingSource,
    firstFundingAt: input.firstFundingAt ?? null,
    firstFundingAmount: input.firstFundingAmount ?? null,
    historyTruncated: input.historyTruncated ?? null,
    txCount: input.txCount,
    walletAgeDays: input.walletAgeDays,
    totalVolume: input.totalVolume,
    contractsCount: input.contractsCount,
    campaignActionsCount: input.campaignActionsCount,
    clusterId: row.cluster_id?.trim() || null,
    graphComponentId: row.graph_component_id?.trim() || null,
    graphRiskScore: optionalNumber(row.graph_risk_score),
    reasons,
    firstSeen: input.firstSeen,
    lastSeen: input.lastSeen,
    nativeBalance: input.nativeBalance ?? null,
    tokenCount: input.tokenCount ?? null,
    uniqueCounterparties: input.uniqueCounterparties ?? null,
    lastActiveDaysAgo: input.lastActiveDaysAgo ?? null,
    isContract: input.isContract ?? null,
    accountType: input.accountType ?? null,
    ownerProgram: input.ownerProgram ?? null,
    behaviorFingerprint: input.behaviorFingerprint ?? null,
    campaignQualityScore: input.campaignQualityScore ?? null,
    campaignOnlyRatio: input.campaignOnlyRatio ?? null,
    behaviorDiversityScore: input.behaviorDiversityScore ?? null,
    botScriptScore: input.botScriptScore ?? null,
    policyAction: input.policyAction ?? null,
    reputationLabel: input.reputationLabel ?? null,
    policyReason: input.policyReason ?? null,
    customerLabel: input.customerLabel ?? null,
    enrichmentProvider: input.enrichmentProvider ?? null,
    enrichmentStatus: input.enrichmentStatus ?? null,
    teamReview: null,
  }
}

function maliciousSignalCount(
  decision: ReturnType<typeof buildExplainableDecision>
) {
  return decision.evidence.filter((item) => {
    if (item.code === "CORROBORATED_SYBIL") return true
    if (item.effect !== "risk_signal") return false
    if (item.code === "BOT_PATTERN") {
      return /bot-script probability:\s*(?:very high|high)\b/i.test(item.description)
    }
    return true
  }).length
}

function representativeAuditRows(privateSeal: PrivateSealPayload) {
  const parsed = Papa.parse<AuditRow>(privateSeal.auditCsv, {
    header: true,
    skipEmptyLines: true,
  })
  if (parsed.errors.length) {
    throw new Error("Frozen private audit CSV failed parsing")
  }
  return parsed.data.filter(
    (row) => (row.selected_cohort ?? "").trim() === "representative"
  )
}

function currentStack() {
  return buildHoldoutStackFingerprint({
    commitSha: resolveProductionCommitSha(),
    model: process.env.GEMINI_EVIDENCE_MODEL ?? HOLDOUT_DEFAULT_MODEL,
  })
}

export async function evaluateIndependentHoldoutOnce(run: PersistedHoldoutRun) {
  const existing = await getHoldoutArtifact<HoldoutEvaluationPayload>(run.id, "evaluation")
  if (existing) {
    return { created: false, evaluation: existing.payload }
  }
  if (run.status !== "ready_to_evaluate") {
    throw new Error(`Holdout run ${run.id} is not ready to evaluate; status is ${run.status}.`)
  }

  const [privateSealArtifact, groundTruthArtifact] = await Promise.all([
    getHoldoutArtifact<PrivateSealPayload>(run.id, "private_seal"),
    getHoldoutArtifact<HoldoutGroundTruthSetPayload>(run.id, "ground_truth"),
  ])
  if (!privateSealArtifact || !groundTruthArtifact) {
    throw new Error("Frozen private seal and sealed ground truth are required before evaluation.")
  }
  const privateSeal = privateSealArtifact.payload
  const groundTruth = groundTruthArtifact.payload
  if (
    privateSeal.runId !== run.id ||
    privateSeal.freezeHash !== run.freezeHash ||
    privateSeal.stackHash !== run.stackHash ||
    groundTruth.runId !== run.id ||
    groundTruth.batchId !== privateSeal.batchId
  ) {
    throw new Error("Holdout evaluation artifacts do not match the frozen run.")
  }

  const rows = representativeAuditRows(privateSeal)
  const rowByCase = new Map<string, AuditRow>()
  rows.forEach((row, index) => {
    const id = required(row, "case_id", index + 2)
    if (rowByCase.has(id)) throw new Error(`Duplicate representative private-audit case ${id}`)
    rowByCase.set(id, row)
  })
  const groundTruthByCase = new Map(
    groundTruth.cases.map((item) => [item.caseId, item])
  )
  if (
    rowByCase.size !== groundTruthByCase.size ||
    Array.from(rowByCase.keys()).some((id) => !groundTruthByCase.has(id))
  ) {
    throw new Error("Frozen engine-output case set differs from sealed ground truth.")
  }

  const observations: BenchmarkObservation[] = groundTruth.cases
    .map((truth) => {
      const row = rowByCase.get(truth.caseId)
      if (!row) throw new Error(`Frozen engine output missing for ${truth.caseId}`)
      const frozenResult = frozenWalletResult(row, 0)
      const decision = buildExplainableDecision(frozenResult)
      return {
        scenarioId: required(row, "scenario_id", 0),
        caseId: truth.caseId,
        chain: truth.chain,
        split: "holdout" as const,
        provenanceKind: "verified_human" as const,
        label: truth.label,
        expectedDecision: truth.expectedDecision,
        acceptableDecisions: truth.acceptableDecisions,
        maliciousRiskExpectation: truth.maliciousRiskExpectation,
        predictedDecision: frozenResult.status,
        riskScore: frozenResult.riskScore,
        evidenceConfidence: decision.evidenceConfidence,
        independentRiskFamilyCount: decision.independentRiskFamilyCount,
        maliciousSignalCount: maliciousSignalCount(decision),
        clusterLinked: Boolean(frozenResult.clusterId),
      }
    })
    .sort((left, right) => left.caseId.localeCompare(right.caseId))

  const metrics = calculateBenchmarkMetrics(
    observations,
    DEFAULT_BENCHMARK_THRESHOLDS
  )
  const design = buildHoldoutDesignReadiness({
    freeze: run.freeze,
    cases: groundTruth.cases,
  })
  const stack = currentStack()
  const finalClaimGate = buildHoldoutFinalClaimGate({
    freeze: run.freeze,
    currentStack: stack,
    design,
    metrics,
  })
  const observationsHash = sha256(JSON.stringify(observations))
  const payload: HoldoutEvaluationPayload = {
    schemaVersion: HOLDOUT_EVALUATION_SCHEMA_VERSION,
    runId: run.id,
    batchId: privateSeal.batchId,
    evaluatedAt: new Date().toISOString(),
    freezeHash: run.freezeHash,
    frozenStackHash: run.stackHash,
    currentStack: stack,
    currentStackHash: sha256(JSON.stringify(stack)),
    privateSealArtifactHash: privateSealArtifact.artifactHash,
    groundTruthArtifactHash: groundTruthArtifact.artifactHash,
    observationsHash,
    observations,
    metrics,
    finalClaimGate,
  }
  const stored = await putImmutableHoldoutArtifact({
    runId: run.id,
    kind: "evaluation",
    payload,
  })
  await updateHoldoutRunStatus(run.id, "ready_to_evaluate", "evaluated")
  return { created: stored.created, evaluation: stored.artifact.payload }
}
