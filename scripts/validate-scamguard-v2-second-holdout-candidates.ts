import { readFile } from "node:fs/promises"
import path from "node:path"

import { parseCsvObjects } from "@/lib/scamguard/v2/csv"
import { candidateFingerprint, validateCandidateIntake, type SecondHoldoutCandidate } from "@/lib/scamguard/v2/second-holdout-candidate"

const CANDIDATES = path.join(process.cwd(), "lib/scamguard/v2/fixtures/second-holdout-candidates.csv")
const SEEN = path.join(process.cwd(), "lib/scamguard/v2/fixtures/holdout-150.csv")

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
  const candidates = parseCsvObjects(await readFile(CANDIDATES, "utf8")).map(candidateFromRow)
  const seenRows = parseCsvObjects(await readFile(SEEN, "utf8"))
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
  const blockers = [...intake.blockers]
  for (const candidate of candidates) {
    if (seenIds.has(candidate.id)) blockers.push(`Seen fixture id reused: ${candidate.id}`)
    const fingerprint = candidateFingerprint(candidate)
    if (seenFingerprints.has(fingerprint)) blockers.push(`Seen fixture target reused: ${fingerprint}`)
  }

  const summary = {
    valid: blockers.length === 0,
    totalCandidates: candidates.length,
    verified: candidates.filter((item) => item.verificationStatus === "verified").length,
    benign: candidates.filter((item) => item.groundTruth === "benign").length,
    malicious: candidates.filter((item) => item.groundTruth === "malicious").length,
    blockers,
  }
  console.log(JSON.stringify(summary, null, 2))
  if (blockers.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
