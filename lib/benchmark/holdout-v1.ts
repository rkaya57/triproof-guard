import { createHash } from "node:crypto"

import {
  AI_EVIDENCE_ASSESSMENT_SCHEMA_VERSION,
  AI_EVIDENCE_PROMPT_VERSION,
  AI_EVIDENCE_SCHEMA_VERSION,
} from "@/lib/ai/evidence-analyst"
import {
  AI_CLUSTER_ASSESSMENT_SCHEMA_VERSION,
  AI_CLUSTER_EVIDENCE_SCHEMA_VERSION,
  AI_CLUSTER_PROMPT_VERSION,
} from "@/lib/ai/cluster-analyst"
import {
  ENTITY_REGISTRY_DATASET_VERSION,
  ENTITY_REGISTRY_SCHEMA_VERSION,
} from "@/lib/entity-registry"
import type { WalletStatus } from "@/types"
import type {
  BenchmarkLabel,
  BenchmarkMaliciousExpectation,
} from "./schema"
import {
  DEFAULT_BENCHMARK_THRESHOLDS,
  type BenchmarkMetricsReport,
} from "./metrics"

export const HOLDOUT_PROTOCOL_VERSION =
  "tri-proof-independent-holdout-v1" as const
export const HOLDOUT_REVIEW_SCHEMA_VERSION =
  "tri-proof-independent-holdout-review-v1" as const
export const HOLDOUT_GROUND_TRUTH_SCHEMA_VERSION =
  "tri-proof-independent-holdout-ground-truth-v1" as const
export const HOLDOUT_DEFAULT_MODEL = "gemini-3.6-flash" as const

export type HoldoutReviewConfidence = "high" | "medium" | "low"

export type HoldoutStackFingerprint = {
  protocolVersion: typeof HOLDOUT_PROTOCOL_VERSION
  commitSha: string
  riskPolicy: "balanced"
  entityRegistry: {
    schemaVersion: typeof ENTITY_REGISTRY_SCHEMA_VERSION
    datasetVersion: typeof ENTITY_REGISTRY_DATASET_VERSION
  }
  ai: {
    model: string
    evidenceSchemaVersion: typeof AI_EVIDENCE_SCHEMA_VERSION
    evidenceAssessmentSchemaVersion: typeof AI_EVIDENCE_ASSESSMENT_SCHEMA_VERSION
    evidencePromptVersion: typeof AI_EVIDENCE_PROMPT_VERSION
    clusterEvidenceSchemaVersion: typeof AI_CLUSTER_EVIDENCE_SCHEMA_VERSION
    clusterAssessmentSchemaVersion: typeof AI_CLUSTER_ASSESSMENT_SCHEMA_VERSION
    clusterPromptVersion: typeof AI_CLUSTER_PROMPT_VERSION
  }
}

export type HoldoutStackFreeze = {
  protocolVersion: typeof HOLDOUT_PROTOCOL_VERSION
  frozenAt: string
  candidateNotBefore: string
  stack: HoldoutStackFingerprint
  stackHash: string
  freezeHash: string
  minimums: {
    cases: number
    malicious: number
    organic: number
    chains: number
  }
  instructions: string[]
}

export type HoldoutReview = {
  schemaVersion: typeof HOLDOUT_REVIEW_SCHEMA_VERSION
  caseId: string
  chain: string
  reviewer: string
  reviewedAt: string
  label: BenchmarkLabel
  expectedDecision: WalletStatus
  acceptableDecisions: WalletStatus[]
  maliciousRiskExpectation: BenchmarkMaliciousExpectation
  confidence: HoldoutReviewConfidence
  rationale: string
}

export type HoldoutGroundTruthCase = {
  schemaVersion: typeof HOLDOUT_GROUND_TRUTH_SCHEMA_VERSION
  caseId: string
  chain: string
  createdAt: string
  label: BenchmarkLabel
  expectedDecision: WalletStatus
  acceptableDecisions: WalletStatus[]
  maliciousRiskExpectation: BenchmarkMaliciousExpectation
  confidence: Exclude<HoldoutReviewConfidence, "low">
  rationale: string
  reviewers: string[]
  supportingLabelReviewers: string[]
  adjudicated: boolean
}

export type HoldoutAdjudicationResult =
  | {
      status: "resolved"
      groundTruth: Omit<HoldoutGroundTruthCase, "createdAt">
    }
  | {
      status: "conflict"
      reason: string
      caseId: string
    }

export type HoldoutDesignReadiness = {
  ready: boolean
  reasons: string[]
  totalCases: number
  maliciousCases: number
  organicCases: number
  representedChains: number
  preFreezeCases: number
  lowConfidenceCases: number
  maliciousCasesWithoutTwoSupportingReviewers: number
}

export type HoldoutFinalClaimGate = {
  ready: boolean
  reasons: string[]
  stackMatchesFreeze: boolean
  designReady: boolean
  operationalGatePassed: boolean
  metricClaimReadinessPassed: boolean
  criticalFalseApprovals: number
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function canonicalStringArray(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort()
}

function canonicalDecisions(values: WalletStatus[]) {
  return Array.from(new Set(values)).sort()
}

function reviewerKey(value: string) {
  return value.trim().toLocaleLowerCase("en-US")
}

function assertCommitSha(commitSha: string) {
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) {
    throw new Error("Independent holdout freeze requires a full 40-character Git commit SHA.")
  }
}

function isMaliciousLabel(label: BenchmarkLabel) {
  return label === "sybil" || label === "bot"
}

export function hashHoldoutStackFingerprint(stack: HoldoutStackFingerprint) {
  return sha256(JSON.stringify(stack))
}

export function buildHoldoutStackFingerprint(input: {
  commitSha: string
  model?: string
}): HoldoutStackFingerprint {
  assertCommitSha(input.commitSha)
  return {
    protocolVersion: HOLDOUT_PROTOCOL_VERSION,
    commitSha: input.commitSha.toLowerCase(),
    riskPolicy: "balanced",
    entityRegistry: {
      schemaVersion: ENTITY_REGISTRY_SCHEMA_VERSION,
      datasetVersion: ENTITY_REGISTRY_DATASET_VERSION,
    },
    ai: {
      model: input.model?.trim() || HOLDOUT_DEFAULT_MODEL,
      evidenceSchemaVersion: AI_EVIDENCE_SCHEMA_VERSION,
      evidenceAssessmentSchemaVersion: AI_EVIDENCE_ASSESSMENT_SCHEMA_VERSION,
      evidencePromptVersion: AI_EVIDENCE_PROMPT_VERSION,
      clusterEvidenceSchemaVersion: AI_CLUSTER_EVIDENCE_SCHEMA_VERSION,
      clusterAssessmentSchemaVersion: AI_CLUSTER_ASSESSMENT_SCHEMA_VERSION,
      clusterPromptVersion: AI_CLUSTER_PROMPT_VERSION,
    },
  }
}

export function resolveProductionCommitSha(env: NodeJS.ProcessEnv = process.env) {
  const commitSha = env.VERCEL_GIT_COMMIT_SHA ?? env.GITHUB_SHA
  if (!commitSha) {
    throw new Error("Cannot freeze Independent Holdout Validation v1 without a deployment commit SHA.")
  }
  assertCommitSha(commitSha)
  return commitSha.toLowerCase()
}

export function buildHoldoutStackFreeze(input: {
  commitSha: string
  frozenAt?: string
  model?: string
}): HoldoutStackFreeze {
  const frozenAt = input.frozenAt ?? new Date().toISOString()
  const parsed = new Date(frozenAt)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Holdout freeze timestamp must be a valid ISO timestamp.")
  }
  const normalizedFrozenAt = parsed.toISOString()
  const stack = buildHoldoutStackFingerprint({
    commitSha: input.commitSha,
    model: input.model,
  })
  const stackHash = hashHoldoutStackFingerprint(stack)
  const base = {
    protocolVersion: HOLDOUT_PROTOCOL_VERSION,
    frozenAt: normalizedFrozenAt,
    candidateNotBefore: normalizedFrozenAt,
    stack,
    stackHash,
    minimums: {
      cases: DEFAULT_BENCHMARK_THRESHOLDS.minimumRealWorldHoldoutCasesForClaim,
      malicious:
        DEFAULT_BENCHMARK_THRESHOLDS.minimumRealWorldMaliciousCasesForClaim,
      organic: DEFAULT_BENCHMARK_THRESHOLDS.minimumRealWorldOrganicCasesForClaim,
      chains: DEFAULT_BENCHMARK_THRESHOLDS.minimumChainsForClaim,
    },
    instructions: [
      "Only cases created at or after candidateNotBefore may enter this holdout run.",
      "Reviewer A and Reviewer B must work independently and must never see Tri-Proof engine or AI outputs.",
      "Conflicting reviews require a third independent adjudicator; conflicts are never auto-resolved.",
      "Sybil or bot ground truth requires at least two independent reviewers supporting that malicious label.",
      "After freeze, any engine, policy, prompt, model, entity-registry, or evaluation-code change invalidates this run and requires a new holdout version.",
      "Holdout results must be reported as observed; threshold tuning against this frozen run is prohibited.",
    ],
  }
  return {
    ...base,
    freezeHash: sha256(JSON.stringify(base)),
  }
}

export function verifyHoldoutFreezeIntegrity(freeze: HoldoutStackFreeze) {
  const { freezeHash, ...base } = freeze
  return (
    hashHoldoutStackFingerprint(freeze.stack) === freeze.stackHash &&
    sha256(JSON.stringify(base)) === freezeHash
  )
}

function assertSameCase(reviews: HoldoutReview[]) {
  const first = reviews[0]
  if (!first) throw new Error("At least one holdout review is required.")
  for (const review of reviews.slice(1)) {
    if (review.caseId !== first.caseId || review.chain !== first.chain) {
      throw new Error("Independent holdout reviews must refer to the same case and chain.")
    }
  }
}

function assertIndependentReviewers(reviews: HoldoutReview[]) {
  const identities = reviews.map((review) => reviewerKey(review.reviewer))
  if (identities.some((identity) => !identity)) {
    throw new Error("Independent holdout reviews require named reviewers.")
  }
  if (new Set(identities).size !== identities.length) {
    throw new Error("Independent holdout reviews must use distinct reviewer identities.")
  }
}

function reviewSemanticsEqual(left: HoldoutReview, right: HoldoutReview) {
  return (
    left.label === right.label &&
    left.expectedDecision === right.expectedDecision &&
    left.maliciousRiskExpectation === right.maliciousRiskExpectation &&
    JSON.stringify(canonicalDecisions(left.acceptableDecisions)) ===
      JSON.stringify(canonicalDecisions(right.acceptableDecisions))
  )
}

function resolvedGroundTruth(
  finalReview: HoldoutReview,
  allReviews: HoldoutReview[],
  adjudicated: boolean
): HoldoutAdjudicationResult {
  if (finalReview.confidence === "low") {
    return {
      status: "conflict",
      reason: "claim_eligible_ground_truth_cannot_use_low_confidence",
      caseId: finalReview.caseId,
    }
  }
  const supportingLabelReviewers = canonicalStringArray(
    allReviews
      .filter((review) => review.label === finalReview.label)
      .map((review) => review.reviewer)
  )
  if (isMaliciousLabel(finalReview.label) && supportingLabelReviewers.length < 2) {
    return {
      status: "conflict",
      reason: "malicious_label_requires_two_supporting_independent_reviewers",
      caseId: finalReview.caseId,
    }
  }

  return {
    status: "resolved",
    groundTruth: {
      schemaVersion: HOLDOUT_GROUND_TRUTH_SCHEMA_VERSION,
      caseId: finalReview.caseId,
      chain: finalReview.chain,
      label: finalReview.label,
      expectedDecision: finalReview.expectedDecision,
      acceptableDecisions: canonicalDecisions(finalReview.acceptableDecisions),
      maliciousRiskExpectation: finalReview.maliciousRiskExpectation,
      confidence: finalReview.confidence,
      rationale: finalReview.rationale,
      reviewers: canonicalStringArray(allReviews.map((review) => review.reviewer)),
      supportingLabelReviewers,
      adjudicated,
    },
  }
}

export function adjudicateIndependentHoldoutReviews(
  reviewerA: HoldoutReview,
  reviewerB: HoldoutReview,
  adjudicator?: HoldoutReview
): HoldoutAdjudicationResult {
  const initial = [reviewerA, reviewerB]
  assertSameCase(initial)
  assertIndependentReviewers(initial)

  if (reviewSemanticsEqual(reviewerA, reviewerB)) {
    return resolvedGroundTruth(reviewerA, initial, false)
  }

  if (!adjudicator) {
    return {
      status: "conflict",
      reason: "independent_reviews_disagree_and_require_adjudication",
      caseId: reviewerA.caseId,
    }
  }

  const allReviews = [reviewerA, reviewerB, adjudicator]
  assertSameCase(allReviews)
  assertIndependentReviewers(allReviews)
  return resolvedGroundTruth(adjudicator, allReviews, true)
}

export function buildHoldoutDesignReadiness(input: {
  freeze: HoldoutStackFreeze
  cases: HoldoutGroundTruthCase[]
}): HoldoutDesignReadiness {
  const reasons: string[] = []
  if (!verifyHoldoutFreezeIntegrity(input.freeze)) {
    reasons.push("Holdout freeze hash or stack hash does not verify.")
  }

  const cutoff = new Date(input.freeze.candidateNotBefore).getTime()
  const preFreezeCases = input.cases.filter(
    (item) => new Date(item.createdAt).getTime() < cutoff
  ).length
  const lowConfidenceCases = input.cases.filter(
    (item) => item.confidence === ("low" as HoldoutReviewConfidence)
  ).length
  const maliciousCases = input.cases.filter((item) => isMaliciousLabel(item.label))
  const organicCases = input.cases.filter((item) => item.label === "organic_user")
  const representedChains = new Set(input.cases.map((item) => item.chain)).size
  const maliciousCasesWithoutTwoSupportingReviewers = maliciousCases.filter(
    (item) => item.supportingLabelReviewers.length < 2
  ).length

  if (preFreezeCases > 0) {
    reasons.push(`${preFreezeCases} cases pre-date the frozen holdout cutoff.`)
  }
  if (lowConfidenceCases > 0) {
    reasons.push(`${lowConfidenceCases} cases use low-confidence ground truth.`)
  }
  if (input.cases.length < input.freeze.minimums.cases) {
    reasons.push(
      `Need at least ${input.freeze.minimums.cases} independent holdout cases; found ${input.cases.length}.`
    )
  }
  if (maliciousCases.length < input.freeze.minimums.malicious) {
    reasons.push(
      `Need at least ${input.freeze.minimums.malicious} independently supported malicious cases; found ${maliciousCases.length}.`
    )
  }
  if (organicCases.length < input.freeze.minimums.organic) {
    reasons.push(
      `Need at least ${input.freeze.minimums.organic} organic-user cases; found ${organicCases.length}.`
    )
  }
  if (representedChains < input.freeze.minimums.chains) {
    reasons.push(
      `Need at least ${input.freeze.minimums.chains} represented chains; found ${representedChains}.`
    )
  }
  if (maliciousCasesWithoutTwoSupportingReviewers > 0) {
    reasons.push(
      `${maliciousCasesWithoutTwoSupportingReviewers} malicious cases lack two independent reviewers supporting the malicious label.`
    )
  }
  if (input.cases.some((item) => new Set(item.reviewers.map(reviewerKey)).size < 2)) {
    reasons.push("Every holdout case must include at least two independent reviewer identities.")
  }

  return {
    ready: reasons.length === 0,
    reasons,
    totalCases: input.cases.length,
    maliciousCases: maliciousCases.length,
    organicCases: organicCases.length,
    representedChains,
    preFreezeCases,
    lowConfidenceCases,
    maliciousCasesWithoutTwoSupportingReviewers,
  }
}

export function buildHoldoutFinalClaimGate(input: {
  freeze: HoldoutStackFreeze
  currentStack: HoldoutStackFingerprint
  design: HoldoutDesignReadiness
  metrics: BenchmarkMetricsReport
}): HoldoutFinalClaimGate {
  const reasons: string[] = []
  const stackMatchesFreeze =
    hashHoldoutStackFingerprint(input.currentStack) === input.freeze.stackHash

  if (!verifyHoldoutFreezeIntegrity(input.freeze)) {
    reasons.push("Frozen holdout manifest failed integrity verification.")
  }
  if (!stackMatchesFreeze) {
    reasons.push(
      "Current engine/AI stack differs from the frozen holdout stack. Start a new holdout version instead of reusing these labels."
    )
  }
  if (!input.design.ready) {
    reasons.push(...input.design.reasons)
  }
  if (!input.metrics.operationalGate.passed) {
    reasons.push("Observed holdout performance did not pass the frozen operational quality gate.")
  }
  if (!input.metrics.claimReadiness.ready) {
    reasons.push(...input.metrics.claimReadiness.reasons)
  }
  if (input.metrics.criticalFalseApprovals !== 0) {
    reasons.push(
      `Critical false approvals must be zero; observed ${input.metrics.criticalFalseApprovals}.`
    )
  }

  return {
    ready: reasons.length === 0,
    reasons: canonicalStringArray(reasons),
    stackMatchesFreeze,
    designReady: input.design.ready,
    operationalGatePassed: input.metrics.operationalGate.passed,
    metricClaimReadinessPassed: input.metrics.claimReadiness.ready,
    criticalFalseApprovals: input.metrics.criticalFalseApprovals,
  }
}
