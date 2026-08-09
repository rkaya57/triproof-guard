import { createHash } from "node:crypto"

import Papa from "papaparse"

import {
  REVIEWER_EXPORT_HEADERS,
  reviewerRowsToCsv,
  type BlindReviewerRow,
} from "@/lib/benchmark/reviewer-export"
import {
  getHoldoutArtifact,
  putImmutableHoldoutArtifact,
  type HoldoutArtifactKind,
} from "@/lib/benchmark/holdout-artifacts"
import type { PersistedHoldoutRun } from "@/lib/benchmark/holdout-store"
import { updateHoldoutRunStatus } from "@/lib/benchmark/holdout-store"
import type { HoldoutReviewBundlePayload } from "@/lib/benchmark/holdout-reviewer-bundle"
import {
  HOLDOUT_GROUND_TRUTH_SCHEMA_VERSION,
  HOLDOUT_REVIEW_SCHEMA_VERSION,
  adjudicateIndependentHoldoutReviews,
  type HoldoutGroundTruthCase,
  type HoldoutReview,
} from "@/lib/benchmark/holdout-v1"
import {
  benchmarkLabelSchema,
  benchmarkMaliciousExpectationSchema,
  walletStatusSchema,
} from "@/lib/benchmark/schema"

const HOLDOUT_REVIEW_ARTIFACT_SCHEMA_VERSION =
  "tri-proof-independent-holdout-review-artifact-v1" as const
const HOLDOUT_GROUND_TRUTH_SET_SCHEMA_VERSION =
  "tri-proof-independent-holdout-ground-truth-set-v1" as const

const REVIEW_FIELDS = new Set([
  "ground_truth_label",
  "expected_decision",
  "acceptable_decisions",
  "malicious_risk_expectation",
  "reviewer",
  "reviewed_at",
  "review_confidence",
  "rationale",
  "tags",
])

type CsvRow = Record<string, string | undefined>
type ReviewRole = "reviewer_a" | "reviewer_b" | "adjudicator"

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

export type HoldoutReviewArtifactPayload = {
  schemaVersion: typeof HOLDOUT_REVIEW_ARTIFACT_SCHEMA_VERSION
  runId: string
  batchId: string
  role: ReviewRole
  reviewer: string
  importedAt: string
  completedCsvSha256: string
  templateSha256: string
  reviews: HoldoutReview[]
}

export type HoldoutGroundTruthSetPayload = {
  schemaVersion: typeof HOLDOUT_GROUND_TRUTH_SET_SCHEMA_VERSION
  caseSchemaVersion: typeof HOLDOUT_GROUND_TRUTH_SCHEMA_VERSION
  runId: string
  batchId: string
  sealedAt: string
  reviewerAHash: string
  reviewerBHash: string
  adjudicatorHash: string | null
  groundTruthHash: string
  cases: HoldoutGroundTruthCase[]
}

export type HoldoutReviewState = {
  runId: string
  batchId: string
  status: PersistedHoldoutRun["status"]
  reviewerAImported: boolean
  reviewerBImported: boolean
  adjudicatorImported: boolean
  reviewerA: string | null
  reviewerB: string | null
  adjudicator: string | null
  totalCases: number
  resolvedCases: number
  conflictCases: string[]
  readyForGroundTruth: boolean
  groundTruthSealed: boolean
  groundTruthHash: string | null
  adjudicatorTemplateCsv: string | null
  adjudicatorFileName: string | null
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function parseCsv(text: string, name: string) {
  const parsed = Papa.parse<CsvRow>(text, { header: true, skipEmptyLines: true })
  if (parsed.errors.length) {
    throw new Error(
      `${name} CSV parse failed: ${parsed.errors
        .map((error) => `${error.row ?? "?"}:${error.message}`)
        .join("; ")}`
    )
  }
  const fields = parsed.meta.fields ?? []
  if (
    fields.length !== REVIEWER_EXPORT_HEADERS.length ||
    REVIEWER_EXPORT_HEADERS.some((header) => !fields.includes(header))
  ) {
    throw new Error(`${name} CSV headers must exactly match the frozen blind-review template.`)
  }
  return parsed.data
}

function required(row: CsvRow, key: string, rowNumber: number) {
  const value = row[key]?.trim()
  if (!value) throw new Error(`Row ${rowNumber}: ${key} is required`)
  return value
}

function canonicalReviewer(value: string) {
  return value.trim().toLocaleLowerCase("en-US")
}

function parseAcceptableDecisions(value: string, rowNumber: number) {
  const trimmed = value.trim()
  let raw: string[]
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
        throw new Error("not-string-array")
      }
      raw = parsed
    } catch {
      throw new Error(`Row ${rowNumber}: acceptable_decisions JSON is invalid`)
    }
  } else {
    raw = trimmed.split(/[|,;]/)
  }
  const decisions = Array.from(new Set(raw.map((item) => item.trim()).filter(Boolean)))
  if (!decisions.length) {
    throw new Error(`Row ${rowNumber}: acceptable_decisions is required`)
  }
  return decisions.map((decision) => {
    const parsed = walletStatusSchema.safeParse(decision)
    if (!parsed.success) {
      throw new Error(
        `Row ${rowNumber}: acceptable_decisions must use approved, manual_review, or rejected`
      )
    }
    return parsed.data
  })
}

function immutableValue(header: string, value: string | undefined) {
  return (value ?? "").trim()
}

function validateCompletedRows(input: {
  templateRows: CsvRow[]
  completedRows: CsvRow[]
  run: PersistedHoldoutRun
  bundle: HoldoutReviewBundlePayload
  role: ReviewRole
  requiredCaseIds?: Set<string>
}) {
  const templateByCase = new Map<string, CsvRow>()
  input.templateRows.forEach((row, index) => {
    const caseId = required(row, "case_id", index + 2)
    if (templateByCase.has(caseId)) throw new Error(`Frozen template has duplicate case_id ${caseId}`)
    templateByCase.set(caseId, row)
  })

  const requiredCaseIds = input.requiredCaseIds ?? new Set(templateByCase.keys())
  if (input.completedRows.length !== requiredCaseIds.size) {
    throw new Error(
      `${input.role} must contain exactly ${requiredCaseIds.size} required holdout cases; found ${input.completedRows.length}.`
    )
  }

  const seen = new Set<string>()
  const reviews: HoldoutReview[] = []
  const reviewerIdentities = new Set<string>()
  const earliestReviewTime = new Date(input.bundle.generatedAt).getTime()

  input.completedRows.forEach((row, index) => {
    const rowNumber = index + 2
    const caseId = required(row, "case_id", rowNumber)
    if (seen.has(caseId)) throw new Error(`Row ${rowNumber}: duplicate case_id`)
    seen.add(caseId)
    if (!requiredCaseIds.has(caseId)) {
      throw new Error(`Row ${rowNumber}: case_id ${caseId} is not required for ${input.role}`)
    }
    const template = templateByCase.get(caseId)
    if (!template) throw new Error(`Row ${rowNumber}: case_id is not in the frozen reviewer bundle`)

    REVIEWER_EXPORT_HEADERS.forEach((header) => {
      if (REVIEW_FIELDS.has(header)) return
      if (immutableValue(header, template[header]) !== immutableValue(header, row[header])) {
        throw new Error(`Row ${rowNumber}: immutable field ${header} differs from the frozen bundle`)
      }
    })

    const reviewer = required(row, "reviewer", rowNumber)
    reviewerIdentities.add(canonicalReviewer(reviewer))
    const reviewedAt = required(row, "reviewed_at", rowNumber)
    const reviewedAtMs = new Date(reviewedAt).getTime()
    if (!Number.isFinite(reviewedAtMs)) {
      throw new Error(`Row ${rowNumber}: reviewed_at must be a valid ISO timestamp`)
    }
    if (reviewedAtMs < earliestReviewTime) {
      throw new Error(`Row ${rowNumber}: reviewed_at predates the frozen reviewer bundle`)
    }

    const label = benchmarkLabelSchema.safeParse(required(row, "ground_truth_label", rowNumber))
    if (!label.success) {
      throw new Error(`Row ${rowNumber}: unsupported ground_truth_label`)
    }
    const expectedDecision = walletStatusSchema.safeParse(required(row, "expected_decision", rowNumber))
    if (!expectedDecision.success) {
      throw new Error(
        `Row ${rowNumber}: expected_decision must be approved, manual_review, or rejected`
      )
    }
    const acceptableDecisions = parseAcceptableDecisions(
      required(row, "acceptable_decisions", rowNumber),
      rowNumber
    )
    if (!acceptableDecisions.includes(expectedDecision.data)) {
      throw new Error(`Row ${rowNumber}: acceptable_decisions must include expected_decision`)
    }
    const maliciousRiskExpectation = benchmarkMaliciousExpectationSchema.safeParse(
      required(row, "malicious_risk_expectation", rowNumber)
    )
    if (!maliciousRiskExpectation.success) {
      throw new Error(
        `Row ${rowNumber}: malicious_risk_expectation must be present, absent, or unknown`
      )
    }
    if (
      (label.data === "sybil" || label.data === "bot") &&
      maliciousRiskExpectation.data !== "present"
    ) {
      throw new Error(`Row ${rowNumber}: sybil/bot labels require malicious risk expectation present`)
    }
    if (label.data === "non_user_entity" && maliciousRiskExpectation.data !== "absent") {
      throw new Error(`Row ${rowNumber}: non_user_entity requires malicious risk expectation absent`)
    }

    const confidence = required(row, "review_confidence", rowNumber)
    if (confidence !== "high" && confidence !== "medium" && confidence !== "low") {
      throw new Error(`Row ${rowNumber}: review_confidence must be high, medium, or low`)
    }
    const rationale = required(row, "rationale", rowNumber)
    if (rationale.length < 20) {
      throw new Error(`Row ${rowNumber}: rationale must contain at least 20 characters`)
    }

    reviews.push({
      schemaVersion: HOLDOUT_REVIEW_SCHEMA_VERSION,
      caseId,
      chain: required(row, "chain", rowNumber),
      reviewer,
      reviewedAt: new Date(reviewedAt).toISOString(),
      label: label.data,
      expectedDecision: expectedDecision.data,
      acceptableDecisions,
      maliciousRiskExpectation: maliciousRiskExpectation.data,
      confidence,
      rationale,
    })
  })

  if (reviewerIdentities.size !== 1) {
    throw new Error(`${input.role} CSV must contain exactly one reviewer identity across all rows.`)
  }
  if (Array.from(requiredCaseIds).some((caseId) => !seen.has(caseId))) {
    throw new Error(`${input.role} CSV is missing one or more required holdout cases.`)
  }

  return reviews.sort((left, right) => left.caseId.localeCompare(right.caseId))
}

function artifactKind(role: ReviewRole): HoldoutArtifactKind {
  return role
}

function artifactReviewer(payload: HoldoutReviewArtifactPayload | null) {
  return payload?.reviewer ?? null
}

async function loadReviewArtifacts(runId: string) {
  const [reviewerA, reviewerB, adjudicator, groundTruth] = await Promise.all([
    getHoldoutArtifact<HoldoutReviewArtifactPayload>(runId, "reviewer_a"),
    getHoldoutArtifact<HoldoutReviewArtifactPayload>(runId, "reviewer_b"),
    getHoldoutArtifact<HoldoutReviewArtifactPayload>(runId, "adjudicator"),
    getHoldoutArtifact<HoldoutGroundTruthSetPayload>(runId, "ground_truth"),
  ])
  return { reviewerA, reviewerB, adjudicator, groundTruth }
}

function reviewMap(payload: HoldoutReviewArtifactPayload | null) {
  return new Map((payload?.reviews ?? []).map((review) => [review.caseId, review]))
}

function conflictIds(
  reviewerA: HoldoutReviewArtifactPayload | null,
  reviewerB: HoldoutReviewArtifactPayload | null
) {
  if (!reviewerA || !reviewerB) return []
  const b = reviewMap(reviewerB)
  return reviewerA.reviews
    .filter((reviewA) => {
      const reviewB = b.get(reviewA.caseId)
      if (!reviewB) return true
      return adjudicateIndependentHoldoutReviews(reviewA, reviewB).status === "conflict"
    })
    .map((review) => review.caseId)
    .sort()
}

function blankConflictTemplate(bundleCsv: string, conflicts: Set<string>) {
  const rows = parseCsv(bundleCsv, "frozen reviewer template")
    .filter((row) => conflicts.has((row.case_id ?? "").trim()))
    .map((row) => {
      const result = {} as BlindReviewerRow
      REVIEWER_EXPORT_HEADERS.forEach((header) => {
        result[header] = REVIEW_FIELDS.has(header) ? "" : row[header] ?? ""
      })
      return result
    })
  return `${reviewerRowsToCsv(rows)}\n`
}

function parseAuditCreatedAt(privateSeal: PrivateSealPayload) {
  const rows = Papa.parse<CsvRow>(privateSeal.auditCsv, {
    header: true,
    skipEmptyLines: true,
  })
  if (rows.errors.length) throw new Error("Private holdout audit CSV failed integrity parsing")
  const result = new Map<string, string>()
  rows.data.forEach((row) => {
    if ((row.selected_cohort ?? "").trim() !== "representative") return
    const caseId = (row.case_id ?? "").trim()
    const createdAt = (row.wallet_created_at ?? row.analysis_created_at ?? "").trim()
    if (!caseId || !createdAt || !Number.isFinite(new Date(createdAt).getTime())) {
      throw new Error("Private holdout audit is missing selected case timestamps")
    }
    result.set(caseId, new Date(createdAt).toISOString())
  })
  return result
}

export async function importHoldoutReviewCsv(input: {
  run: PersistedHoldoutRun
  role: ReviewRole
  completedCsv: string
}) {
  if (!["reviewing", "adjudicating"].includes(input.run.status)) {
    throw new Error(`Holdout reviews cannot be imported from status ${input.run.status}.`)
  }
  const bundleArtifact = await getHoldoutArtifact<HoldoutReviewBundlePayload>(
    input.run.id,
    "review_bundle"
  )
  if (!bundleArtifact) throw new Error("Frozen holdout reviewer bundle is missing")
  const bundle = bundleArtifact.payload
  if (
    bundle.freezeHash !== input.run.freezeHash ||
    bundle.stackHash !== input.run.stackHash ||
    bundle.candidateNotBefore !== input.run.candidateNotBefore
  ) {
    throw new Error("Frozen holdout reviewer bundle does not match the active run")
  }

  const templateRows = parseCsv(bundle.reviewerCsv, "frozen reviewer template")
  const completedRows = parseCsv(input.completedCsv, input.role)
  const artifacts = await loadReviewArtifacts(input.run.id)
  const conflicts = new Set(conflictIds(artifacts.reviewerA?.payload ?? null, artifacts.reviewerB?.payload ?? null))

  if (input.role === "reviewer_b" && !artifacts.reviewerA) {
    throw new Error("Reviewer A must be imported before Reviewer B.")
  }
  if (input.role === "adjudicator") {
    if (!artifacts.reviewerA || !artifacts.reviewerB) {
      throw new Error("Reviewer A and Reviewer B must be imported before adjudication.")
    }
    if (!conflicts.size) throw new Error("No unresolved reviewer conflicts require adjudication.")
  }

  const reviews = validateCompletedRows({
    templateRows,
    completedRows,
    run: input.run,
    bundle,
    role: input.role,
    requiredCaseIds: input.role === "adjudicator" ? conflicts : undefined,
  })
  const reviewer = reviews[0]?.reviewer
  if (!reviewer) throw new Error(`${input.role} returned no completed reviews`)
  const reviewerKey = canonicalReviewer(reviewer)
  const existingReviewerKeys = [
    artifactReviewer(artifacts.reviewerA?.payload ?? null),
    artifactReviewer(artifacts.reviewerB?.payload ?? null),
  ]
    .filter((value): value is string => Boolean(value))
    .map(canonicalReviewer)
  if (existingReviewerKeys.includes(reviewerKey)) {
    throw new Error(`${input.role} must use a distinct reviewer identity.`)
  }

  const payload: HoldoutReviewArtifactPayload = {
    schemaVersion: HOLDOUT_REVIEW_ARTIFACT_SCHEMA_VERSION,
    runId: input.run.id,
    batchId: bundle.batchId,
    role: input.role,
    reviewer,
    importedAt: new Date().toISOString(),
    completedCsvSha256: sha256(input.completedCsv),
    templateSha256: bundle.reviewerSha256,
    reviews,
  }
  const stored = await putImmutableHoldoutArtifact({
    runId: input.run.id,
    kind: artifactKind(input.role),
    payload,
  })

  if (input.role === "reviewer_b" && input.run.status === "reviewing") {
    const remaining = conflictIds(
      artifacts.reviewerA?.payload ?? null,
      stored.artifact.payload
    )
    if (remaining.length) {
      await updateHoldoutRunStatus(input.run.id, "reviewing", "adjudicating")
    }
  }

  return {
    created: stored.created,
    artifactHash: stored.artifact.artifactHash,
    state: await getHoldoutReviewState(input.run),
  }
}

export async function sealHoldoutGroundTruth(run: PersistedHoldoutRun) {
  const existing = await getHoldoutArtifact<HoldoutGroundTruthSetPayload>(run.id, "ground_truth")
  if (existing) return { created: false, groundTruth: existing.payload }

  const bundleArtifact = await getHoldoutArtifact<HoldoutReviewBundlePayload>(run.id, "review_bundle")
  const privateSealArtifact = await getHoldoutArtifact<PrivateSealPayload>(run.id, "private_seal")
  const artifacts = await loadReviewArtifacts(run.id)
  if (!bundleArtifact || !privateSealArtifact || !artifacts.reviewerA || !artifacts.reviewerB) {
    throw new Error("Reviewer bundle, private seal, Reviewer A, and Reviewer B are required")
  }

  const reviewerA = artifacts.reviewerA.payload
  const reviewerB = artifacts.reviewerB.payload
  const adjudicator = artifacts.adjudicator?.payload ?? null
  const b = reviewMap(reviewerB)
  const c = reviewMap(adjudicator)
  const createdAtByCase = parseAuditCreatedAt(privateSealArtifact.payload)
  const cases: HoldoutGroundTruthCase[] = []
  const unresolved: string[] = []

  reviewerA.reviews.forEach((reviewA) => {
    const reviewB = b.get(reviewA.caseId)
    if (!reviewB) {
      unresolved.push(reviewA.caseId)
      return
    }
    const initial = adjudicateIndependentHoldoutReviews(reviewA, reviewB)
    const final =
      initial.status === "conflict"
        ? adjudicateIndependentHoldoutReviews(reviewA, reviewB, c.get(reviewA.caseId))
        : initial
    if (final.status === "conflict") {
      unresolved.push(reviewA.caseId)
      return
    }
    const createdAt = createdAtByCase.get(reviewA.caseId)
    if (!createdAt) throw new Error(`Private audit timestamp missing for ${reviewA.caseId}`)
    cases.push({ ...final.groundTruth, createdAt })
  })

  if (unresolved.length) {
    throw new Error(`Ground truth cannot be sealed; ${unresolved.length} reviewer conflicts remain unresolved.`)
  }
  if (cases.length !== bundleArtifact.payload.representativeCases) {
    throw new Error("Ground-truth case count differs from the frozen reviewer bundle")
  }

  const canonicalCases = [...cases].sort((left, right) => left.caseId.localeCompare(right.caseId))
  const groundTruthHash = sha256(JSON.stringify(canonicalCases))
  const payload: HoldoutGroundTruthSetPayload = {
    schemaVersion: HOLDOUT_GROUND_TRUTH_SET_SCHEMA_VERSION,
    caseSchemaVersion: HOLDOUT_GROUND_TRUTH_SCHEMA_VERSION,
    runId: run.id,
    batchId: bundleArtifact.payload.batchId,
    sealedAt: new Date().toISOString(),
    reviewerAHash: artifacts.reviewerA.artifactHash,
    reviewerBHash: artifacts.reviewerB.artifactHash,
    adjudicatorHash: artifacts.adjudicator?.artifactHash ?? null,
    groundTruthHash,
    cases: canonicalCases,
  }
  const stored = await putImmutableHoldoutArtifact({
    runId: run.id,
    kind: "ground_truth",
    payload,
  })

  if (run.status === "reviewing" || run.status === "adjudicating") {
    await updateHoldoutRunStatus(run.id, run.status, "ready_to_evaluate")
  }
  return { created: stored.created, groundTruth: stored.artifact.payload }
}

export async function getHoldoutReviewState(run: PersistedHoldoutRun): Promise<HoldoutReviewState> {
  const bundleArtifact = await getHoldoutArtifact<HoldoutReviewBundlePayload>(run.id, "review_bundle")
  if (!bundleArtifact) throw new Error("Frozen holdout reviewer bundle is missing")
  const artifacts = await loadReviewArtifacts(run.id)
  const reviewerA = artifacts.reviewerA?.payload ?? null
  const reviewerB = artifacts.reviewerB?.payload ?? null
  const adjudicator = artifacts.adjudicator?.payload ?? null
  const conflicts = conflictIds(reviewerA, reviewerB)
  const adjudicatorCases = new Set(adjudicator?.reviews.map((review) => review.caseId) ?? [])
  const unresolvedConflicts = conflicts.filter((caseId) => !adjudicatorCases.has(caseId))
  const totalCases = bundleArtifact.payload.representativeCases
  const resolvedCases = reviewerA && reviewerB ? totalCases - unresolvedConflicts.length : 0
  const conflictSet = new Set(conflicts)

  return {
    runId: run.id,
    batchId: bundleArtifact.payload.batchId,
    status: run.status,
    reviewerAImported: Boolean(reviewerA),
    reviewerBImported: Boolean(reviewerB),
    adjudicatorImported: Boolean(adjudicator),
    reviewerA: reviewerA?.reviewer ?? null,
    reviewerB: reviewerB?.reviewer ?? null,
    adjudicator: adjudicator?.reviewer ?? null,
    totalCases,
    resolvedCases,
    conflictCases: unresolvedConflicts,
    readyForGroundTruth: Boolean(reviewerA && reviewerB && unresolvedConflicts.length === 0),
    groundTruthSealed: Boolean(artifacts.groundTruth),
    groundTruthHash: artifacts.groundTruth?.payload.groundTruthHash ?? null,
    adjudicatorTemplateCsv:
      conflicts.length && !artifacts.adjudicator
        ? blankConflictTemplate(bundleArtifact.payload.reviewerCsv, conflictSet)
        : null,
    adjudicatorFileName:
      conflicts.length && !artifacts.adjudicator
        ? `tri-proof-holdout-v1-adjudicator-${bundleArtifact.payload.batchId}.csv`
        : null,
  }
}
