import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

import Papa from "papaparse"

import {
  REAL_WORLD_LABELING_SCHEMA_VERSION,
  deterministicRealWorldSplit,
  type RealWorldLabelingCohort,
} from "@/lib/benchmark/labeling-queue"
import {
  BENCHMARK_DATASET_SCHEMA_VERSION,
  BENCHMARK_SCENARIO_SCHEMA_VERSION,
  parseLabeledBenchmarkDataset,
} from "@/lib/benchmark/schema"

type CsvRow = Record<string, string | undefined>

function argumentValue(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function required(row: CsvRow, key: string, rowNumber: number) {
  const value = row[key]?.trim()
  if (!value) throw new Error(`Row ${rowNumber}: ${key} is required`)
  return value
}

function splitList(value: string | undefined) {
  return (value ?? "")
    .split(/[|;]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

async function parseCsv(path: string) {
  const parsed = Papa.parse<CsvRow>(await readFile(path, "utf8"), {
    header: true,
    skipEmptyLines: true,
  })
  if (parsed.errors.length > 0) {
    throw new Error(
      `CSV parse failed for ${path}: ${parsed.errors
        .map((error) => `${error.row ?? "?"}:${error.message}`)
        .join("; ")}`
    )
  }
  return parsed.data
}

function comparableAddress(chain: string, address: string) {
  return /^(ethereum|base|arbitrum|optimism|polygon|bnb|bsc)$/i.test(chain)
    ? address.toLowerCase()
    : address
}

function reviewConfidence(row: CsvRow, rowNumber: number) {
  const value = required(row, "review_confidence", rowNumber).toLowerCase()
  if (value !== "high" && value !== "medium" && value !== "low") {
    throw new Error(
      `Row ${rowNumber}: review_confidence must be high, medium, or low`
    )
  }
  return value
}

async function main() {
  const cohort = (argumentValue("--cohort") ??
    process.env.BENCHMARK_REVIEW_COHORT ??
    "representative") as RealWorldLabelingCohort
  if (cohort !== "representative" && cohort !== "challenge") {
    throw new Error("--cohort must be representative or challenge")
  }

  const inputPath = resolve(
    argumentValue("--input") ??
      process.env.BENCHMARK_REVIEWED_CSV ??
      `artifacts/benchmark-labeling/labeling-queue-${cohort}-reviewed.csv`
  )
  const auditMapPath = resolve(
    argumentValue("--audit-map") ??
      process.env.BENCHMARK_AUDIT_MAP ??
      "artifacts/benchmark-labeling/labeling-audit-map.csv"
  )
  const datasetVersion =
    argumentValue("--version") ??
    process.env.BENCHMARK_DATASET_VERSION ??
    `${cohort === "representative" ? "real-world" : "challenge"}-${new Date()
      .toISOString()
      .slice(0, 10)}`
  const outputPath = resolve(
    argumentValue("--output") ??
      process.env.BENCHMARK_COMPILED_OUTPUT ??
      `artifacts/benchmark-labeling/${datasetVersion}.json`
  )

  const reviewedRows = await parseCsv(inputPath)
  const auditRows = await parseCsv(auditMapPath)

  const auditByCase = new Map<string, CsvRow>()
  auditRows.forEach((row, index) => {
    const rowNumber = index + 2
    if (
      required(row, "labeling_schema_version", rowNumber) !==
      REAL_WORLD_LABELING_SCHEMA_VERSION
    ) {
      throw new Error(`Audit row ${rowNumber}: unsupported labeling schema`)
    }
    const caseId = required(row, "case_id", rowNumber)
    if (auditByCase.has(caseId)) {
      throw new Error(`Audit row ${rowNumber}: duplicate case_id ${caseId}`)
    }
    auditByCase.set(caseId, row)
  })

  const expectedCaseIds = new Set(
    auditRows
      .filter((row) => row.selected_cohort?.trim() === cohort)
      .map((row, index) => required(row, "case_id", index + 2))
  )
  const reviewedCaseIds = new Set<string>()

  const normalizedReviews = reviewedRows.map((row, index) => {
    const rowNumber = index + 2
    if (
      required(row, "labeling_schema_version", rowNumber) !==
      REAL_WORLD_LABELING_SCHEMA_VERSION
    ) {
      throw new Error(`Row ${rowNumber}: unsupported labeling schema`)
    }
    if (required(row, "cohort", rowNumber) !== cohort) {
      throw new Error(`Row ${rowNumber}: cohort does not match ${cohort}`)
    }

    const caseId = required(row, "case_id", rowNumber)
    if (reviewedCaseIds.has(caseId)) {
      throw new Error(`Row ${rowNumber}: duplicate reviewed case_id ${caseId}`)
    }
    reviewedCaseIds.add(caseId)

    const audit = auditByCase.get(caseId)
    if (!audit) throw new Error(`Row ${rowNumber}: case missing from sealed audit map`)
    if (audit.selected_cohort?.trim() !== cohort) {
      throw new Error(`Row ${rowNumber}: case is not selected for ${cohort}`)
    }

    const chain = required(row, "chain", rowNumber)
    const walletAddress = required(row, "wallet_address", rowNumber)
    if (chain !== required(audit, "chain", rowNumber)) {
      throw new Error(`Row ${rowNumber}: chain differs from sealed audit map`)
    }
    if (
      comparableAddress(chain, walletAddress) !==
      comparableAddress(chain, required(audit, "wallet_address", rowNumber))
    ) {
      throw new Error(`Row ${rowNumber}: wallet address differs from sealed audit map`)
    }
    if (required(row, "scenario_id", rowNumber) !== required(audit, "scenario_id", rowNumber)) {
      throw new Error(`Row ${rowNumber}: scenario_id differs from sealed audit map`)
    }
    if (
      required(row, "split_group_id", rowNumber) !==
      required(audit, "split_group_id", rowNumber)
    ) {
      throw new Error(`Row ${rowNumber}: split_group_id differs from sealed audit map`)
    }

    const groundTruthLabel = required(row, "ground_truth_label", rowNumber)
    const reviewers = Array.from(
      new Set(splitList(required(row, "reviewer", rowNumber)))
    )
    const confidence = reviewConfidence(row, rowNumber)
    if (cohort === "representative" && confidence === "low") {
      throw new Error(
        `Row ${rowNumber}: claim-eligible representative cases cannot use low-confidence human labels; use insufficient_data or obtain stronger evidence.`
      )
    }
    if (
      cohort === "representative" &&
      (groundTruthLabel === "sybil" || groundTruthLabel === "bot") &&
      reviewers.length < 2
    ) {
      throw new Error(
        `Row ${rowNumber}: representative ${groundTruthLabel} labels require two independent reviewers before claim-eligible compilation.`
      )
    }

    return {
      row,
      audit,
      rowNumber,
      caseId,
      chain,
      walletAddress,
      groundTruthLabel,
      reviewers,
      confidence,
      reviewedAt: required(row, "reviewed_at", rowNumber),
      scenarioId: required(row, "scenario_id", rowNumber),
      splitGroupId: required(row, "split_group_id", rowNumber),
    }
  })

  const missing = Array.from(expectedCaseIds).filter(
    (caseId) => !reviewedCaseIds.has(caseId)
  )
  const extra = Array.from(reviewedCaseIds).filter(
    (caseId) => !expectedCaseIds.has(caseId)
  )
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Reviewed cohort must be frozen and complete before compilation. Missing=${missing.length}, extra=${extra.length}.`
    )
  }

  const reviewsByScenario = new Map<
    string,
    typeof normalizedReviews
  >()
  normalizedReviews.forEach((review) => {
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
      if (scenarioAudit.length === 0) {
        throw new Error(`Scenario ${scenarioId}: no sealed campaign context`)
      }

      const chain = first.chain
      const splitGroupIds = new Set(reviews.map((review) => review.splitGroupId))
      if (splitGroupIds.size !== 1) {
        throw new Error(`Scenario ${scenarioId}: multiple split groups detected`)
      }
      const splitGroupId = first.splitGroupId
      if (
        scenarioAudit.some(
          (audit) => required(audit, "chain", 0) !== chain
        )
      ) {
        throw new Error(`Scenario ${scenarioId}: campaign context crosses chains`)
      }

      const reviewedIds = new Set(reviews.map((review) => review.caseId))
      const contextInputs = scenarioAudit
        .filter((audit) => !reviewedIds.has(required(audit, "case_id", 0)))
        .map((audit) => JSON.parse(required(audit, "input_json", 0)))

      const reviewers = Array.from(
        new Set(reviews.flatMap((review) => review.reviewers))
      ).sort()
      const reviewedAt = [...reviews]
        .map((review) => review.reviewedAt)
        .sort()
        .at(-1) ?? null
      const analysisId = required(first.audit, "analysis_id", first.rowNumber)

      return {
        schemaVersion: BENCHMARK_SCENARIO_SCHEMA_VERSION,
        id: scenarioId,
        title: `Blind-reviewed real-world campaign ${scenarioId}`,
        chain,
        riskPolicy: "balanced" as const,
        split: deterministicRealWorldSplit(splitGroupId),
        provenance: {
          kind: "verified_human" as const,
          sourceRef: `analysis:${analysisId}`,
          reviewers,
          reviewedAt,
          notes:
            cohort === "representative"
              ? "Compiled from an engine-blind, campaign-balanced representative queue. Engine outputs were sealed in a separate audit map until labels were frozen. Unlabeled wallets from the same campaign are replayed as context only."
              : "Compiled from an engine-blind challenge queue selected with hidden engine-output stratification for error discovery. This cohort is not eligible for external accuracy claims.",
        },
        contextInputs,
        cases: reviews.map((review) => ({
          id: review.caseId,
          input: JSON.parse(required(review.audit, "input_json", review.rowNumber)),
          groundTruth: {
            label: review.groundTruthLabel,
            expectedDecision: required(
              review.row,
              "expected_decision",
              review.rowNumber
            ),
            acceptableDecisions: splitList(
              required(
                review.row,
                "acceptable_decisions",
                review.rowNumber
              )
            ),
            maliciousRiskExpectation: required(
              review.row,
              "malicious_risk_expectation",
              review.rowNumber
            ),
            rationale: required(review.row, "rationale", review.rowNumber),
          },
          tags: Array.from(
            new Set([
              ...splitList(review.row.tags),
              `cohort:${cohort}`,
              `review_confidence:${review.confidence}`,
            ])
          ),
        })),
        expectations: {},
      }
    })

  const dataset = parseLabeledBenchmarkDataset({
    schemaVersion: BENCHMARK_DATASET_SCHEMA_VERSION,
    datasetVersion,
    createdAt: new Date().toISOString(),
    description:
      cohort === "representative"
        ? "Human-reviewed real-world benchmark compiled from an engine-blind campaign-balanced representative queue with sealed engine outputs and full unlabeled campaign context."
        : "Human-reviewed real-world challenge dataset for error discovery. Selection was stratified using hidden engine outputs and MUST NOT be used for external accuracy claims.",
    scenarios,
  })

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8")

  const splitCounts = dataset.scenarios.reduce(
    (counts, scenario) => {
      counts[scenario.split] += scenario.cases.length
      return counts
    },
    { development: 0, validation: 0, holdout: 0 }
  )

  console.log(
    JSON.stringify({
      datasetVersion,
      cohort,
      claimEligible: cohort === "representative",
      scenarios: scenarios.length,
      cases: normalizedReviews.length,
      contextWallets: scenarios.reduce(
        (sum, scenario) => sum + scenario.contextInputs.length,
        0
      ),
      splitCounts,
      outputPath,
    })
  )
}

main().catch((error) => {
  console.error("Failed to compile reviewed benchmark labels", error)
  process.exitCode = 1
})
