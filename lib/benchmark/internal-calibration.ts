import { createHash } from "node:crypto"
import { gunzipSync } from "node:zlib"

import Papa from "papaparse"

import {
  DEFAULT_BENCHMARK_THRESHOLDS,
  type BenchmarkMetricThresholds,
} from "@/lib/benchmark/metrics"
import {
  REVIEWER_EXPORT_HEADERS,
  reviewerRowsToCsv,
  type BlindReviewerRow,
} from "@/lib/benchmark/reviewer-export"
import { runLabeledBenchmark } from "@/lib/benchmark/runner"
import {
  BENCHMARK_DATASET_SCHEMA_VERSION,
  BENCHMARK_SCENARIO_SCHEMA_VERSION,
  parseLabeledBenchmarkDataset,
  type BenchmarkLabel,
  type BenchmarkMaliciousExpectation,
  type BenchmarkWalletInput,
} from "@/lib/benchmark/schema"
import type { WalletStatus } from "@/types"

import {
  REAL_WORLD_LABELING_SCHEMA_VERSION,
  deterministicRealWorldSplit,
} from "./labeling-queue"

export const INTERNAL_CALIBRATION_SCHEMA_VERSION =
  "tri-proof-internal-calibration-v1" as const

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

type PrivateReviewSeal = {
  sealSchemaVersion: string
  batchId: string
  generatedAt: string
  labelingSchemaVersion: string
  representativeSha256: string
  auditSha256: string
  representativeCases: number
  contextRows: number
  projects: number
  byChain: Record<string, number>
  plannedSplits: Record<string, number>
  auditCsv: string
}

export type InternalCalibrationMismatch = {
  caseId: string
  chain: string
  walletAddress: string
  label: BenchmarkLabel
  expectedDecision: WalletStatus
  predictedDecision: WalletStatus
  riskScore: number
  split: "development" | "validation" | "holdout"
  category:
    | "malicious_false_approval"
    | "organic_false_reject"
    | "organic_manual_review"
    | "other_decision_mismatch"
}

export type InternalCalibrationResult = {
  schemaVersion: typeof INTERNAL_CALIBRATION_SCHEMA_VERSION
  batchId: string
  claimEligible: false
  integrity: {
    reviewerSnapshotMatchesSeal: boolean
    auditMatchesSeal: boolean
    reviewerCases: number
    auditRows: number
  }
  normalization: {
    legacyExpectedDecisionRows: number
    legacyMaliciousExpectationRows: number
    numericConfidenceRows: number
    jsonListRows: number
  }
  labelCounts: Record<string, number>
  secondReviewRequiredCases: number
  report: ReturnType<typeof runLabeledBenchmark>
  mismatches: InternalCalibrationMismatch[]
  normalizedReviewerCsv: string
  secondReviewerCsv: string
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}

function required(row: CsvRow, key: string, rowNumber: number) {
  const value = row[key]?.trim()
  if (!value) throw new Error(`Row ${rowNumber}: ${key} is required`)
  return value
}

function parseCsv(text: string, name: string) {
  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
  })
  if (parsed.errors.length) {
    throw new Error(
      `${name} CSV parse failed: ${parsed.errors
        .map((error) => `${error.row ?? "?"}:${error.message}`)
        .join("; ")}`
    )
  }
  return parsed.data
}

function parseSeal(bytes: Uint8Array): PrivateReviewSeal {
  const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
  const text = isGzip
    ? gunzipSync(bytes).toString("utf8")
    : Buffer.from(bytes).toString("utf8")
  const value = JSON.parse(text) as Partial<PrivateReviewSeal>

  if (
    value.sealSchemaVersion !== "tri-proof-review-seal-v1" ||
    typeof value.batchId !== "string" ||
    typeof value.representativeSha256 !== "string" ||
    typeof value.auditSha256 !== "string" ||
    typeof value.auditCsv !== "string" ||
    typeof value.representativeCases !== "number" ||
    typeof value.contextRows !== "number"
  ) {
    throw new Error("Unsupported or malformed private review seal")
  }

  return value as PrivateReviewSeal
}

function comparableAddress(chain: string, address: string) {
  return /^(ethereum|base|arbitrum|optimism|polygon|bnb|bsc)$/i.test(chain)
    ? address.toLowerCase()
    : address
}

function parseFlexibleList(value: string | undefined) {
  const text = value?.trim() ?? ""
  if (!text) return []

  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      }
    } catch {
      // Fall through to delimited parsing for reviewer-edited CSVs.
    }
  }

  return text
    .split(/[|;]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeDecision(value: string, rowNumber: number): WalletStatus {
  const normalized = value.trim().toLowerCase()
  if (normalized === "approved" || normalized === "approve") return "approved"
  if (
    normalized === "manual_review" ||
    normalized === "review_required" ||
    normalized === "flag_for_review" ||
    normalized === "review"
  ) {
    return "manual_review"
  }
  if (normalized === "rejected" || normalized === "reject") return "rejected"
  throw new Error(`Row ${rowNumber}: unsupported decision value ${value}`)
}

function normalizeLabel(value: string, rowNumber: number): BenchmarkLabel {
  if (
    value === "organic_user" ||
    value === "sybil" ||
    value === "bot" ||
    value === "non_user_entity" ||
    value === "insufficient_data"
  ) {
    return value
  }
  throw new Error(`Row ${rowNumber}: unsupported ground_truth_label ${value}`)
}

function normalizeMaliciousExpectation(
  label: BenchmarkLabel,
  value: string
): BenchmarkMaliciousExpectation {
  const normalized = value.trim().toLowerCase()
  if (
    normalized === "present" ||
    normalized === "absent" ||
    normalized === "unknown"
  ) {
    return normalized
  }

  // Legacy reviewers used severity words here. The benchmark schema defines
  // this field semantically by label, so normalize without converting a
  // non-user entity into malicious risk.
  if (label === "sybil" || label === "bot") return "present"
  if (label === "organic_user" || label === "non_user_entity") return "absent"
  return "unknown"
}

function normalizeConfidence(value: string, rowNumber: number) {
  const normalized = value.trim().toLowerCase()
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized
  }

  const numeric = Number.parseFloat(normalized)
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    throw new Error(`Row ${rowNumber}: unsupported review_confidence ${value}`)
  }
  if (numeric >= 0.85) return "high" as const
  if (numeric >= 0.65) return "medium" as const
  return "low" as const
}

function reviewerNames(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[|;]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function validIso(value: string, rowNumber: number) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Row ${rowNumber}: reviewed_at must be an ISO date`)
  }
  return date.toISOString()
}

function blankedReviewerSnapshot(rows: CsvRow[]) {
  const canonicalRows = rows.map((row, index) => {
    const rowNumber = index + 2
    const canonical = {} as BlindReviewerRow
    REVIEWER_EXPORT_HEADERS.forEach((header) => {
      const value = REVIEW_FIELDS.has(header) ? "" : row[header]
      if (value === undefined) {
        throw new Error(`Row ${rowNumber}: missing reviewer column ${header}`)
      }
      canonical[header] = value
    })
    return canonical
  })
  return `${reviewerRowsToCsv(canonicalRows)}\n`
}

function privateAuditByCase(auditRows: CsvRow[]) {
  const map = new Map<string, CsvRow>()
  auditRows.forEach((row, index) => {
    const rowNumber = index + 2
    if (
      required(row, "labeling_schema_version", rowNumber) !==
      REAL_WORLD_LABELING_SCHEMA_VERSION
    ) {
      throw new Error(`Audit row ${rowNumber}: unsupported labeling schema`)
    }
    const caseId = required(row, "case_id", rowNumber)
    if (map.has(caseId)) throw new Error(`Audit row ${rowNumber}: duplicate case_id`)
    map.set(caseId, row)
  })
  return map
}

function buildSecondReviewerCsv(reviewedRows: CsvRow[]) {
  const selected = reviewedRows.filter((row) => {
    const label = row.ground_truth_label?.trim()
    return label === "sybil" || label === "bot"
  })

  const blinded = selected.map((row, index) => {
    const rowNumber = index + 2
    const result = {} as BlindReviewerRow
    REVIEWER_EXPORT_HEADERS.forEach((header) => {
      const value = REVIEW_FIELDS.has(header) ? "" : row[header]
      if (value === undefined) {
        throw new Error(`Second-review row ${rowNumber}: missing ${header}`)
      }
      result[header] = value
    })
    return result
  })

  return `${reviewerRowsToCsv(blinded)}\n`
}

function lockedCalibrationThresholds(): BenchmarkMetricThresholds {
  return {
    ...DEFAULT_BENCHMARK_THRESHOLDS,
    // Internal calibration is intentionally impossible to promote to an
    // external claim, even if its numeric composition happens to cross the
    // ordinary real-world thresholds.
    minimumRealWorldHoldoutCasesForClaim: Number.MAX_SAFE_INTEGER,
    minimumRealWorldMaliciousCasesForClaim: Number.MAX_SAFE_INTEGER,
    minimumRealWorldOrganicCasesForClaim: Number.MAX_SAFE_INTEGER,
    minimumChainsForClaim: Number.MAX_SAFE_INTEGER,
  }
}

export function runInternalCalibration(
  reviewedCsv: string,
  privateSealBytes: Uint8Array
): InternalCalibrationResult {
  const seal = parseSeal(privateSealBytes)
  const reviewedRows = parseCsv(reviewedCsv, "reviewer")
  const auditRows = parseCsv(seal.auditCsv, "sealed audit")

  if (seal.labelingSchemaVersion !== REAL_WORLD_LABELING_SCHEMA_VERSION) {
    throw new Error("Reviewer seal labeling schema does not match the current compiler")
  }
  if (reviewedRows.length !== seal.representativeCases) {
    throw new Error(
      `Reviewer case count differs from seal: ${reviewedRows.length} vs ${seal.representativeCases}`
    )
  }
  if (auditRows.length !== seal.contextRows) {
    throw new Error(
      `Audit row count differs from seal: ${auditRows.length} vs ${seal.contextRows}`
    )
  }

  const reviewerSnapshot = blankedReviewerSnapshot(reviewedRows)
  const reviewerSnapshotMatchesSeal =
    sha256(reviewerSnapshot) === seal.representativeSha256
  const auditMatchesSeal = sha256(seal.auditCsv) === seal.auditSha256
  if (!reviewerSnapshotMatchesSeal || !auditMatchesSeal) {
    throw new Error(
      "Seal integrity verification failed: reviewer snapshot or private audit was modified"
    )
  }

  const auditByCase = privateAuditByCase(auditRows)
  const expectedCaseIds = new Set(
    auditRows
      .filter((row) => row.selected_cohort?.trim() === "representative")
      .map((row, index) => required(row, "case_id", index + 2))
  )
  const reviewedCaseIds = new Set<string>()

  let legacyExpectedDecisionRows = 0
  let legacyMaliciousExpectationRows = 0
  let numericConfidenceRows = 0
  let jsonListRows = 0

  const normalized = reviewedRows.map((row, index) => {
    const rowNumber = index + 2
    if (required(row, "labeling_schema_version", rowNumber) !== seal.labelingSchemaVersion) {
      throw new Error(`Row ${rowNumber}: unsupported labeling schema`)
    }
    if (required(row, "cohort", rowNumber) !== "representative") {
      throw new Error(`Row ${rowNumber}: only the sealed representative cohort is supported`)
    }

    const caseId = required(row, "case_id", rowNumber)
    if (reviewedCaseIds.has(caseId)) throw new Error(`Row ${rowNumber}: duplicate case_id`)
    reviewedCaseIds.add(caseId)

    const audit = auditByCase.get(caseId)
    if (!audit || audit.selected_cohort?.trim() !== "representative") {
      throw new Error(`Row ${rowNumber}: case is not in the sealed representative cohort`)
    }

    const chain = required(row, "chain", rowNumber)
    const walletAddress = required(row, "wallet_address", rowNumber)
    if (chain !== required(audit, "chain", rowNumber)) {
      throw new Error(`Row ${rowNumber}: chain differs from private seal`)
    }
    if (
      comparableAddress(chain, walletAddress) !==
      comparableAddress(chain, required(audit, "wallet_address", rowNumber))
    ) {
      throw new Error(`Row ${rowNumber}: wallet address differs from private seal`)
    }
    if (required(row, "scenario_id", rowNumber) !== required(audit, "scenario_id", rowNumber)) {
      throw new Error(`Row ${rowNumber}: scenario_id differs from private seal`)
    }
    if (
      required(row, "split_group_id", rowNumber) !==
      required(audit, "split_group_id", rowNumber)
    ) {
      throw new Error(`Row ${rowNumber}: split_group_id differs from private seal`)
    }

    const label = normalizeLabel(required(row, "ground_truth_label", rowNumber), rowNumber)
    const rawExpected = required(row, "expected_decision", rowNumber)
    const expectedDecision = normalizeDecision(rawExpected, rowNumber)
    if (!/^(approved|manual_review|rejected)$/i.test(rawExpected)) {
      legacyExpectedDecisionRows += 1
    }

    const rawAcceptable = required(row, "acceptable_decisions", rowNumber)
    if (rawAcceptable.trim().startsWith("[")) jsonListRows += 1
    const acceptableDecisions = Array.from(
      new Set(parseFlexibleList(rawAcceptable).map((value) => normalizeDecision(value, rowNumber)))
    )
    if (!acceptableDecisions.includes(expectedDecision)) {
      acceptableDecisions.push(expectedDecision)
    }

    const rawMalicious = required(row, "malicious_risk_expectation", rowNumber)
    const maliciousRiskExpectation = normalizeMaliciousExpectation(label, rawMalicious)
    if (!/^(present|absent|unknown)$/i.test(rawMalicious)) {
      legacyMaliciousExpectationRows += 1
    }

    const rawConfidence = required(row, "review_confidence", rowNumber)
    const confidence = normalizeConfidence(rawConfidence, rowNumber)
    if (/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(rawConfidence.trim())) {
      numericConfidenceRows += 1
    }

    const reviewers = reviewerNames(required(row, "reviewer", rowNumber))
    if (!reviewers.length) throw new Error(`Row ${rowNumber}: reviewer is required`)

    const reviewedAt = validIso(required(row, "reviewed_at", rowNumber), rowNumber)
    const rationale = required(row, "rationale", rowNumber)
    const tags = Array.from(
      new Set([
        ...parseFlexibleList(row.tags),
        "cohort:internal_calibration",
        `review_confidence:${confidence}`,
        `legacy_expected_decision:${rawExpected}`,
        `legacy_malicious_risk:${rawMalicious}`,
        `legacy_review_confidence:${rawConfidence}`,
      ])
    )

    return {
      row,
      audit,
      caseId,
      chain,
      walletAddress,
      scenarioId: required(row, "scenario_id", rowNumber),
      splitGroupId: required(row, "split_group_id", rowNumber),
      label,
      expectedDecision,
      acceptableDecisions,
      maliciousRiskExpectation,
      reviewers,
      reviewedAt,
      confidence,
      rationale,
      tags,
    }
  })

  const missing = Array.from(expectedCaseIds).filter((caseId) => !reviewedCaseIds.has(caseId))
  const extra = Array.from(reviewedCaseIds).filter((caseId) => !expectedCaseIds.has(caseId))
  if (missing.length || extra.length) {
    throw new Error(
      `Reviewed cohort must exactly match the seal. Missing=${missing.length}, extra=${extra.length}`
    )
  }

  const reviewsByScenario = new Map<string, typeof normalized>()
  normalized.forEach((review) => {
    const bucket = reviewsByScenario.get(review.scenarioId) ?? []
    bucket.push(review)
    reviewsByScenario.set(review.scenarioId, bucket)
  })

  const auditByScenario = new Map<string, CsvRow[]>()
  auditRows.forEach((audit) => {
    const scenarioId = audit.scenario_id?.trim()
    if (!scenarioId) return
    const bucket = auditByScenario.get(scenarioId) ?? []
    bucket.push(audit)
    auditByScenario.set(scenarioId, bucket)
  })

  const scenarios = Array.from(reviewsByScenario.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([scenarioId, reviews]) => {
      const first = reviews[0]
      if (!first) throw new Error(`Scenario ${scenarioId}: no reviewed cases`)
      const scenarioAudit = auditByScenario.get(scenarioId) ?? []
      if (!scenarioAudit.length) throw new Error(`Scenario ${scenarioId}: no campaign context`)

      const splitGroups = new Set(reviews.map((review) => review.splitGroupId))
      if (splitGroups.size !== 1) {
        throw new Error(`Scenario ${scenarioId}: multiple project split groups detected`)
      }
      if (scenarioAudit.some((audit) => required(audit, "chain", 0) !== first.chain)) {
        throw new Error(`Scenario ${scenarioId}: campaign context crosses chains`)
      }

      const reviewedIds = new Set(reviews.map((review) => review.caseId))
      const contextInputs = scenarioAudit
        .filter((audit) => !reviewedIds.has(required(audit, "case_id", 0)))
        .map((audit) => JSON.parse(required(audit, "input_json", 0)) as BenchmarkWalletInput)
      const reviewers = Array.from(new Set(reviews.flatMap((review) => review.reviewers))).sort()
      const reviewedAt = reviews.map((review) => review.reviewedAt).sort().at(-1) ?? null

      return {
        schemaVersion: BENCHMARK_SCENARIO_SCHEMA_VERSION,
        id: scenarioId,
        title: `Internal calibration batch ${seal.batchId} — ${scenarioId}`,
        chain: first.chain,
        riskPolicy: "balanced" as const,
        split: deterministicRealWorldSplit(first.splitGroupId),
        provenance: {
          kind: "verified_human" as const,
          sourceRef: `internal-calibration:${seal.batchId}:${scenarioId}`,
          reviewers,
          reviewedAt,
          notes:
            "CLAIM-INELIGIBLE internal calibration. Human labels were normalized from a sealed blind-review batch. Single-reviewer malicious labels may be used for error discovery only and require independent adjudication before external validation.",
        },
        contextInputs,
        cases: reviews.map((review) => ({
          id: review.caseId,
          input: JSON.parse(required(review.audit, "input_json", 0)) as BenchmarkWalletInput,
          groundTruth: {
            label: review.label,
            expectedDecision: review.expectedDecision,
            acceptableDecisions: review.acceptableDecisions,
            maliciousRiskExpectation: review.maliciousRiskExpectation,
            rationale: review.rationale,
          },
          tags: review.tags,
        })),
        expectations: {},
      }
    })

  const dataset = parseLabeledBenchmarkDataset({
    schemaVersion: BENCHMARK_DATASET_SCHEMA_VERSION,
    datasetVersion: `internal-calibration-${seal.batchId}`,
    createdAt: new Date().toISOString(),
    description:
      "CLAIM-INELIGIBLE internal calibration dataset compiled from a sealed engine-blind reviewer batch. This dataset is for error discovery and calibration only.",
    scenarios,
  })

  const report = runLabeledBenchmark(dataset, lockedCalibrationThresholds())
  const normalizedByCase = new Map(normalized.map((review) => [review.caseId, review]))

  const mismatches = report.observations
    .filter((observation) => !normalizedByCase.get(observation.caseId)?.acceptableDecisions.includes(observation.predictedDecision))
    .map((observation): InternalCalibrationMismatch => {
      const review = normalizedByCase.get(observation.caseId)
      if (!review) throw new Error(`Missing normalized review ${observation.caseId}`)
      let category: InternalCalibrationMismatch["category"] = "other_decision_mismatch"
      if (
        (review.label === "sybil" || review.label === "bot") &&
        observation.predictedDecision === "approved"
      ) {
        category = "malicious_false_approval"
      } else if (review.label === "organic_user" && observation.predictedDecision === "rejected") {
        category = "organic_false_reject"
      } else if (
        review.label === "organic_user" &&
        observation.predictedDecision === "manual_review"
      ) {
        category = "organic_manual_review"
      }

      return {
        caseId: observation.caseId,
        chain: review.chain,
        walletAddress: review.walletAddress,
        label: review.label,
        expectedDecision: review.expectedDecision,
        predictedDecision: observation.predictedDecision,
        riskScore: observation.riskScore,
        split: observation.split,
        category,
      }
    })
    .sort((left, right) => right.riskScore - left.riskScore)

  const normalizedRows = normalized.map((review) => {
    const row = {} as BlindReviewerRow
    REVIEWER_EXPORT_HEADERS.forEach((header) => {
      row[header] = review.row[header] ?? ""
    })
    row.expected_decision = review.expectedDecision
    row.acceptable_decisions = review.acceptableDecisions.join("|")
    row.malicious_risk_expectation = review.maliciousRiskExpectation
    row.review_confidence = review.confidence
    row.reviewed_at = review.reviewedAt
    row.tags = review.tags.join("|")
    return row
  })

  const labelCounts = normalized.reduce<Record<string, number>>((counts, review) => {
    counts[review.label] = (counts[review.label] ?? 0) + 1
    return counts
  }, {})
  const secondReviewRequiredCases = normalized.filter(
    (review) => review.label === "sybil" || review.label === "bot"
  ).length

  return {
    schemaVersion: INTERNAL_CALIBRATION_SCHEMA_VERSION,
    batchId: seal.batchId,
    claimEligible: false,
    integrity: {
      reviewerSnapshotMatchesSeal,
      auditMatchesSeal,
      reviewerCases: reviewedRows.length,
      auditRows: auditRows.length,
    },
    normalization: {
      legacyExpectedDecisionRows,
      legacyMaliciousExpectationRows,
      numericConfidenceRows,
      jsonListRows,
    },
    labelCounts,
    secondReviewRequiredCases,
    report,
    mismatches,
    normalizedReviewerCsv: `${reviewerRowsToCsv(normalizedRows)}\n`,
    secondReviewerCsv: buildSecondReviewerCsv(reviewedRows),
  }
}
