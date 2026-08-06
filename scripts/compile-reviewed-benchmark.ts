import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

import Papa from "papaparse"

import {
  BENCHMARK_DATASET_SCHEMA_VERSION,
  BENCHMARK_SCENARIO_SCHEMA_VERSION,
  parseLabeledBenchmarkDataset,
  type BenchmarkSplit,
} from "@/lib/benchmark/schema"

type ReviewedRow = Record<string, string | undefined>

function argumentValue(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function required(row: ReviewedRow, key: string, rowNumber: number) {
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

function deterministicSplit(groupKey: string): BenchmarkSplit {
  const value = Number.parseInt(
    createHash("sha256").update(groupKey).digest("hex").slice(0, 8),
    16
  ) % 100
  if (value < 70) return "development"
  if (value < 85) return "validation"
  return "holdout"
}

async function main() {
  const inputPath = resolve(
    argumentValue("--input") ??
      process.env.BENCHMARK_REVIEWED_CSV ??
      "artifacts/benchmark-labeling/labeling-queue-reviewed.csv"
  )
  const datasetVersion =
    argumentValue("--version") ??
    process.env.BENCHMARK_DATASET_VERSION ??
    `real-world-${new Date().toISOString().slice(0, 10)}`
  const outputPath = resolve(
    argumentValue("--output") ??
      process.env.BENCHMARK_COMPILED_OUTPUT ??
      `artifacts/benchmark-labeling/${datasetVersion}.json`
  )

  const parsed = Papa.parse<ReviewedRow>(await readFile(inputPath, "utf8"), {
    header: true,
    skipEmptyLines: true,
  })
  if (parsed.errors.length > 0) {
    throw new Error(
      `CSV parse failed: ${parsed.errors
        .map((error) => `${error.row ?? "?"}:${error.message}`)
        .join("; ")}`
    )
  }

  const scenarios = parsed.data.map((row, index) => {
    const rowNumber = index + 2
    const caseId = required(row, "case_id", rowNumber)
    const chain = required(row, "chain", rowNumber)
    const sourceRef = required(row, "source_ref", rowNumber)
    const reviewerNames = splitList(required(row, "reviewer", rowNumber))
    const reviewedAt = required(row, "reviewed_at", rowNumber)
    const acceptableDecisions = splitList(
      required(row, "acceptable_decisions", rowNumber)
    )
    const input = JSON.parse(required(row, "input_json", rowNumber))

    return {
      schemaVersion: BENCHMARK_SCENARIO_SCHEMA_VERSION,
      id: `${required(row, "scenario_id", rowNumber)}-${caseId}`,
      title: `Reviewed real-world case ${caseId}`,
      chain,
      riskPolicy: "balanced",
      split: deterministicSplit(required(row, "scenario_id", rowNumber)),
      provenance: {
        kind: required(row, "provenance_kind", rowNumber),
        sourceRef,
        reviewers: reviewerNames,
        reviewedAt,
        notes:
          "Compiled from a blind labeling queue. Engine predictions were stored in a separate audit map.",
      },
      cases: [
        {
          id: caseId,
          input,
          groundTruth: {
            label: required(row, "ground_truth_label", rowNumber),
            expectedDecision: required(row, "expected_decision", rowNumber),
            acceptableDecisions,
            maliciousRiskExpectation: required(
              row,
              "malicious_risk_expectation",
              rowNumber
            ),
            rationale: required(row, "rationale", rowNumber),
          },
          tags: splitList(row.tags),
        },
      ],
      expectations: {},
    }
  })

  const dataset = parseLabeledBenchmarkDataset({
    schemaVersion: BENCHMARK_DATASET_SCHEMA_VERSION,
    datasetVersion,
    createdAt: new Date().toISOString(),
    description:
      "Human-reviewed real-world benchmark labels compiled from a blind queue. Dataset provenance is validated before use.",
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
      cases: scenarios.length,
      splitCounts,
      outputPath,
    })
  )
}

main().catch((error) => {
  console.error("Failed to compile reviewed benchmark labels", error)
  process.exitCode = 1
})
