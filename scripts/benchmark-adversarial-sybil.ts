import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  formatAdversarialReport,
  runAdversarialSuite,
} from "@/lib/benchmark/adversarial-suite"

const report = runAdversarialSuite()
const markdown = formatAdversarialReport(report)
const outputDir = join(process.cwd(), "artifacts", "benchmark")

mkdirSync(outputDir, { recursive: true })
writeFileSync(
  join(outputDir, "adversarial-sybil-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
)
writeFileSync(
  join(outputDir, "adversarial-sybil-report.md"),
  markdown,
  "utf8"
)

process.stdout.write(markdown)

if (!report.passed) {
  process.stderr.write(
    "Adversarial Sybil resilience gate failed. Production build must stop until every scenario is resolved.\n"
  )
  process.exitCode = 1
}
