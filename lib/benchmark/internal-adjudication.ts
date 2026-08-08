import { createHash } from "node:crypto"

import Papa from "papaparse"

import {
  runInternalCalibration,
  type InternalCalibrationMismatch,
} from "@/lib/benchmark/internal-calibration"
import {
  REVIEWER_EXPORT_HEADERS,
  reviewerRowsToCsv,
  type BlindReviewerRow,
} from "@/lib/benchmark/reviewer-export"

export const INTERNAL_ADJUDICATION_SCHEMA_VERSION =
  "tri-proof-internal-adjudication-v1" as const

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

const REQUIRED_SECOND_REVIEW_FIELDS = [
  "ground_truth_label",
  "expected_decision",
  "acceptable_decisions",
  "malicious_risk_expectation",
  "reviewer",
  "reviewed_at",
  "review_confidence",
  "rationale",
] as const

type CsvRow = Record<string, string | undefined>

type CalibrationSummary = {
  labelCounts: Record<string, number>
  secondReviewRequiredCases: number
  metrics: ReturnType<typeof runInternalCalibration>["report"]["metrics"]
  mismatches: InternalCalibrationMismatch[]
}

export type InternalAdjudicationChange = {
  caseId: string
  chain: string
  walletAddress: string
  firstLabel: string
  adjudicatedLabel: string
  firstExpectedDecision: string
  adjudicatedExpectedDecision: string
  firstReviewers: string[]
  secondReviewers: string[]
  independentReviewer: boolean
}

export type InternalAdjudicationResult = {
  schemaVersion: typeof INTERNAL_ADJUDICATION_SCHEMA_VERSION
  batchId: string
  claimEligible: false
  provenance: {
    firstReviewPreserved: true
    adjudicationLayerSha256: string
    secondReviewRows: number
    independentReviewerCases: number
    independenceSatisfied: boolean
    note: string
  }
  original: CalibrationSummary
  adjudicated: CalibrationSummary
  changes: InternalAdjudicationChange[]
  adjudicatedReviewerCsv: string
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
  return parsed.data
}

function required(row: CsvRow, key: string, rowNumber: number) {
  const value = row[key]?.trim()
  if (!value) throw new Error(`Row ${rowNumber}: ${key} is required`)
  return value
}

function reviewers(value: string | undefined) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(/[|;]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function normalizedReviewerKey(value: string) {
  return value.trim().toLowerCase()
}

function areIndependent(first: string[], second: string[]) {
  const firstKeys = new Set(first.map(normalizedReviewerKey))
  return second.length > 0 && second.every((name) => !firstKeys.has(normalizedReviewerKey(name)))
}

function summary(result: ReturnType<typeof runInternalCalibration>): CalibrationSummary {
  return {
    labelCounts: result.labelCounts,
    secondReviewRequiredCases: result.secondReviewRequiredCases,
    metrics: result.report.metrics,
    mismatches: result.mismatches,
  }
}

function comparableImmutableValue(header: string, value: string | undefined) {
  const trimmed = value?.trim() ?? ""
  if (header === "wallet_address") return trimmed.toLowerCase()
  return trimmed
}

export function runInternalAdjudication(
  reviewedCsv: string,
  privateSealBytes: Uint8Array,
  completedSecondReviewCsv: string
): InternalAdjudicationResult {
  const original = runInternalCalibration(reviewedCsv, privateSealBytes)
  const originalRows = parseCsv(original.normalizedReviewerCsv, "normalized first review")
  const secondRows = parseCsv(completedSecondReviewCsv, "completed second review")

  if (!secondRows.length) throw new Error("Completed second-review CSV is empty")

  const originalByCase = new Map<string, CsvRow>()
  originalRows.forEach((row, index) => {
    const caseId = required(row, "case_id", index + 2)
    if (originalByCase.has(caseId)) throw new Error(`First review has duplicate case_id ${caseId}`)
    originalByCase.set(caseId, row)
  })

  const secondByCase = new Map<string, CsvRow>()
  const changes: InternalAdjudicationChange[] = []

  secondRows.forEach((row, index) => {
    const rowNumber = index + 2
    const caseId = required(row, "case_id", rowNumber)
    if (secondByCase.has(caseId)) throw new Error(`Row ${rowNumber}: duplicate case_id`)

    const first = originalByCase.get(caseId)
    if (!first) throw new Error(`Row ${rowNumber}: case_id is not in the sealed first review`)
    const firstLabel = required(first, "ground_truth_label", rowNumber)
    if (firstLabel !== "sybil" && firstLabel !== "bot") {
      throw new Error(
        `Row ${rowNumber}: second-review case ${caseId} was not selected from the original malicious-label queue`
      )
    }

    REVIEWER_EXPORT_HEADERS.forEach((header) => {
      if (REVIEW_FIELDS.has(header)) return
      const firstValue = comparableImmutableValue(header, first[header])
      const secondValue = comparableImmutableValue(header, row[header])
      if (firstValue !== secondValue) {
        throw new Error(`Row ${rowNumber}: immutable field ${header} differs from the sealed first review`)
      }
    })

    REQUIRED_SECOND_REVIEW_FIELDS.forEach((field) => required(row, field, rowNumber))
    const secondReviewedAt = new Date(required(row, "reviewed_at", rowNumber))
    if (!Number.isFinite(secondReviewedAt.getTime())) {
      throw new Error(`Row ${rowNumber}: reviewed_at must be an ISO date`)
    }

    const firstReviewers = reviewers(first.reviewer)
    const secondReviewers = reviewers(row.reviewer)
    if (!secondReviewers.length) throw new Error(`Row ${rowNumber}: reviewer is required`)

    const independentReviewer = areIndependent(firstReviewers, secondReviewers)
    changes.push({
      caseId,
      chain: required(first, "chain", rowNumber),
      walletAddress: required(first, "wallet_address", rowNumber),
      firstLabel,
      adjudicatedLabel: required(row, "ground_truth_label", rowNumber),
      firstExpectedDecision: required(first, "expected_decision", rowNumber),
      adjudicatedExpectedDecision: required(row, "expected_decision", rowNumber),
      firstReviewers,
      secondReviewers,
      independentReviewer,
    })
    secondByCase.set(caseId, row)
  })

  const mergedRows = originalRows.map((first, index) => {
    const rowNumber = index + 2
    const caseId = required(first, "case_id", rowNumber)
    const second = secondByCase.get(caseId)
    const merged = {} as BlindReviewerRow

    REVIEWER_EXPORT_HEADERS.forEach((header) => {
      merged[header] = first[header] ?? ""
    })
    if (!second) return merged

    REVIEW_FIELDS.forEach((field) => {
      merged[field as keyof BlindReviewerRow] = second[field] ?? ""
    })

    const firstReviewers = reviewers(first.reviewer)
    const secondReviewers = reviewers(second.reviewer)
    merged.reviewer = Array.from(new Set([...firstReviewers, ...secondReviewers])).join("|")
    merged.rationale = `Adjudicated second review: ${second.rationale?.trim() ?? ""}`
    merged.tags = Array.from(
      new Set([
        ...(first.tags ?? "").split(/[|;]/).map((item) => item.trim()).filter(Boolean),
        ...(second.tags ?? "").split(/[|;]/).map((item) => item.trim()).filter(Boolean),
        "cohort:internal_adjudication",
        `first_review_label:${first.ground_truth_label ?? ""}`,
        `first_expected_decision:${first.expected_decision ?? ""}`,
      ])
    ).join("|")
    return merged
  })

  const adjudicatedReviewerCsv = `${reviewerRowsToCsv(mergedRows)}\n`
  const adjudicated = runInternalCalibration(adjudicatedReviewerCsv, privateSealBytes)
  const independentReviewerCases = changes.filter((change) => change.independentReviewer).length
  const independenceSatisfied = independentReviewerCases === changes.length

  return {
    schemaVersion: INTERNAL_ADJUDICATION_SCHEMA_VERSION,
    batchId: original.batchId,
    claimEligible: false,
    provenance: {
      firstReviewPreserved: true,
      adjudicationLayerSha256: sha256(completedSecondReviewCsv),
      secondReviewRows: changes.length,
      independentReviewerCases,
      independenceSatisfied,
      note: independenceSatisfied
        ? "Second-review reviewer names do not overlap the first-review names. This remains claim-ineligible internal adjudication until the independent holdout workflow is completed."
        : "Reviewer independence is not satisfied for every adjudicated case. Results are for internal error discovery only and cannot support an external accuracy claim.",
    },
    original: summary(original),
    adjudicated: summary(adjudicated),
    changes,
    adjudicatedReviewerCsv,
  }
}
