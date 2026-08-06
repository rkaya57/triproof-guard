import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import {
  formatBenchmarkMarkdown,
  runLabeledBenchmark,
} from "@/lib/benchmark/runner"
import { parseLabeledBenchmarkDataset } from "@/lib/benchmark/schema"

function argumentValue(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const datasetPath = resolve(
  argumentValue("--dataset") ??
    process.env.BENCHMARK_DATASET ??
    "data/benchmarks/reference-v1.json"
)
const outputDirectory = resolve(
  argumentValue("--output") ??
    process.env.BENCHMARK_OUTPUT ??
    "artifacts/benchmark"
)
const requireClaimReady = process.argv.includes("--require-claim-ready")

async function main() {
  const rawDataset = JSON.parse(await readFile(datasetPath, "utf8"))
  const dataset = parseLabeledBenchmarkDataset(rawDataset)
  const report = runLabeledBenchmark(dataset)
  const markdown = formatBenchmarkMarkdown(report)

  await mkdir(outputDirectory, { recursive: true })
  await Promise.all([
    writeFile(
      resolve(outputDirectory, `${dataset.datasetVersion}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    ),
    writeFile(
      resolve(outputDirectory, `${dataset.datasetVersion}.md`),
      markdown,
      "utf8"
    ),
  ])

  process.stdout.write(markdown)

  if (!report.metrics.operationalGate.passed) {
    process.exitCode = 1
    return
  }

  if (requireClaimReady && !report.metrics.claimReadiness.ready) {
    process.stderr.write(
      "Benchmark passed the operational gate but is not ready for external real-world accuracy claims.\n"
    )
    process.exitCode = 2
  }
}

main().catch((error) => {
  console.error("Labeled benchmark failed", error)
  process.exitCode = 1
})
