import { readFile } from "node:fs/promises"
import path from "node:path"

import {
  candidateFingerprint,
  toSecondHoldoutRecord,
  validateCandidateIntake,
  type SecondHoldoutCandidate,
} from "@/lib/scamguard/v2/second-holdout-candidate"
import { secondHoldoutCollectionPlan } from "@/lib/scamguard/v2/second-holdout-collection-plan"
import { validateSecondHoldoutDataset } from "@/lib/scamguard/v2/second-holdout-dataset-contract"

const CANDIDATES = path.join(process.cwd(), "lib/scamguard/v2/fixtures/second-holdout-candidates.csv")
const SEEN = path.join(process.cwd(), "lib/scamguard/v2/fixtures/holdout-150.csv")

function parseCsv(text: string) {
  const lines = text.trim().split(/\r?\n/)
  const headers = lines.shift()?.split(",") ?? []
  return lines.filter(Boolean).map((line) => {
    const values = line.split(",")
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
  })
}

function candidateFromRow(row: Record<string, string>): SecondHoldoutCandidate {
  return {
    id: row.id,
    projectId: row.projectId,
    surface: row.surface as SecondHoldoutCandidate["surface"],
    chain: row.chain as SecondHoldoutCandidate["chain"],
    groundTruth: row.groundTruth as SecondHoldoutCandidate["groundTruth"],
    target: row.target,
    sourceUrl: row.sourceUrl || undefined,
    provenanceId: row.provenanceId,
    source1Url: row.source1Url,
    source2Url: row.source2Url || undefined,
    verificationStatus: row.verificationStatus as SecondHoldoutCandidate["verificationStatus"],
    evidenceQuality: row.evidenceQuality as SecondHoldoutCandidate["evidenceQuality"],
    collectedAt: row.collectedAt,
    collectorNote: row.collectorNote || undefined,
  }
}

async function main() {
  const candidates = parseCsv(await readFile(CANDIDATES, "utf8")).map(candidateFromRow)
  const seenRows = parseCsv(await readFile(SEEN, "utf8"))
  const seenIds = new Set(seenRows.map((row) => row.id.trim()).filter(Boolean))
  const seenFingerprints = new Set(seenRows.map((row) => candidateFingerprint({
    id: row.id,
    projectId: row.projectId,
    surface: row.surface as SecondHoldoutCandidate["surface"],
    chain: row.chain as SecondHoldoutCandidate["chain"],
    groundTruth: row.groundTruth as SecondHoldoutCandidate["groundTruth"],
    target: row.target,
    provenanceId: "seen",
    source1Url: "seen",
    verificationStatus: "verified",
    evidenceQuality: "high",
    collectedAt: "2026-08-10T00:00:00.000Z",
  })))

  const intake = validateCandidateIntake(candidates)
  const intakeBlockers = [...intake.blockers]
  for (const candidate of candidates) {
    if (seenIds.has(candidate.id)) intakeBlockers.push(`Seen fixture id reused: ${candidate.id}`)
    if (seenFingerprints.has(candidateFingerprint(candidate))) {
      intakeBlockers.push(`Seen fixture target reused: ${candidateFingerprint(candidate)}`)
    }
  }

  const validation = validateSecondHoldoutDataset(candidates.map(toSecondHoldoutRecord), seenIds)
  const projectCounts = Object.fromEntries(secondHoldoutCollectionPlan.contexts.map((context) => {
    const rows = candidates.filter((candidate) => candidate.projectId === context.id)
    return [context.id, {
      current: rows.length,
      target: context.targetCases,
      benign: rows.filter((candidate) => candidate.groundTruth === "benign").length,
      malicious: rows.filter((candidate) => candidate.groundTruth === "malicious").length,
    }]
  }))

  const report = {
    collectionReady: intakeBlockers.length === 0 && validation.valid,
    intakeValid: intakeBlockers.length === 0,
    currentCases: candidates.length,
    targetCases: secondHoldoutCollectionPlan.targetCases,
    minimumAcceptedCases: secondHoldoutCollectionPlan.minimumAcceptedCases,
    remainingToTarget: Math.max(0, secondHoldoutCollectionPlan.targetCases - candidates.length),
    remainingToMinimum: Math.max(0, secondHoldoutCollectionPlan.minimumAcceptedCases - candidates.length),
    groundTruth: validation.groundTruthCounts,
    surfaces: validation.surfaceCounts,
    transactionSourceContextCoverage: validation.transactionSourceContextCoverage,
    verifiedCoverage: validation.verifiedCoverage,
    maliciousDualSourceCoverage: validation.maliciousDualSourceCoverage,
    projectCounts,
    intakeBlockers,
    readinessBlockers: validation.blockers,
  }

  console.log(JSON.stringify(report, null, 2))

  // Collection incompleteness is expected while curating the second Holdout.
  // Only malformed/leaky intake data should fail this operational report.
  if (intakeBlockers.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
