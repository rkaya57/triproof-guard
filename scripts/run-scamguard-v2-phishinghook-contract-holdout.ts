import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import type { ScamGuardRiskLevel } from "@/lib/scamguard/engine"
import { observeCalibratedScamGuardV2 } from "@/lib/scamguard/v2/calibrated-evidence-fusion"

const ROOT = path.join(process.cwd(), "phishinghook-contract-source")
const MALICIOUS_FILE = path.join(ROOT, "phishinghook-malicious-contracts.txt")
const BENIGN_FILE = path.join(ROOT, "phishinghook-benign-contracts.txt")
const OUT_DIR = path.join(process.cwd(), "artifacts/scamguard-v2-phishinghook-contract-holdout")
const EXPECTED_MALICIOUS_SHA = "e70c83fc77943862681cafc096676416fbdf55257dff834d969281c4ee651061"
const EXPECTED_BENIGN_SHA = "29f6f38bdde36c4d756d61a399bc0172402702946ef883ca525178fe9f03e417"
const PER_CLASS = 500

type GroundTruth = "benign" | "malicious"
type Case = { address: string; groundTruth: GroundTruth }
type Evaluated = Case & {
  v1Risk: ScamGuardRiskLevel
  v2Risk: ScamGuardRiskLevel
  evidenceScore: number
  activationGate: string
  independentFamilies: string[]
  independentSources: string[]
  proposedSignalCodes: string[]
  publicThreatSignal: boolean
}

function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex") }
function bucket(level: ScamGuardRiskLevel): "safe" | "review" | "malicious" {
  if (level === "SAFE") return "safe"
  if (level === "CAUTION") return "review"
  return "malicious"
}
function ratio(n: number, d: number) { return d ? n / d : 0 }
function summarize(rows: Array<{ groundTruth: GroundTruth; risk: ScamGuardRiskLevel }>) {
  const malicious = rows.filter((r) => r.groundTruth === "malicious")
  const benign = rows.filter((r) => r.groundTruth === "benign")
  const tp = malicious.filter((r) => bucket(r.risk) === "malicious").length
  const maliciousReview = malicious.filter((r) => bucket(r.risk) === "review").length
  const maliciousSafe = malicious.filter((r) => bucket(r.risk) === "safe").length
  const fp = benign.filter((r) => bucket(r.risk) === "malicious").length
  const benignReview = benign.filter((r) => bucket(r.risk) === "review").length
  const tn = benign.filter((r) => bucket(r.risk) === "safe").length
  return {
    total: rows.length, maliciousCases: malicious.length, benignCases: benign.length,
    tp, fp, tn, maliciousReview, maliciousSafe, benignReview,
    precision: ratio(tp, tp + fp), strictRecall: ratio(tp, malicious.length),
    protectedRecall: ratio(tp + maliciousReview, malicious.length), falseNegativeSafeRate: ratio(maliciousSafe, malicious.length),
    falsePositiveRate: ratio(fp, benign.length), benignSafeRate: ratio(tn, benign.length), benignReviewRate: ratio(benignReview, benign.length),
    strictAccuracy: ratio(tp + tn, rows.length),
  }
}

async function readAndVerify(file: string, expectedSha: string) {
  const raw = await readFile(file)
  const actual = sha256(raw)
  if (actual !== expectedSha) throw new Error(`Source SHA drift for ${path.basename(file)}: ${actual}`)
  const rows = raw.toString("utf8").split(/\r?\n/).map((x) => x.trim().toLowerCase()).filter(Boolean)
  if (rows.length !== new Set(rows).size) throw new Error(`Duplicate addresses in ${file}`)
  return rows
}

function select(rows: string[], count: number) {
  return [...rows].sort((a, b) => sha256(a).localeCompare(sha256(b))).slice(0, count)
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      out[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

function isPublicThreatSignal(code: string) {
  const c = code.toLowerCase()
  return c.includes("real_cats") || c.includes("rug_pull") || c.includes("mew") || c.includes("public_threat") || c.includes("threat_corpus")
}

async function main() {
  const maliciousAll = await readAndVerify(MALICIOUS_FILE, EXPECTED_MALICIOUS_SHA)
  const benignAll = await readAndVerify(BENIGN_FILE, EXPECTED_BENIGN_SHA)
  const malicious = select(maliciousAll, PER_CLASS)
  const benign = select(benignAll, PER_CLASS)
  if (malicious.length !== PER_CLASS || benign.length !== PER_CLASS) throw new Error("Insufficient source rows")
  if (malicious.some((a) => benign.includes(a))) throw new Error("Cross-class address overlap")
  const cases: Case[] = [
    ...malicious.map((address) => ({ address, groundTruth: "malicious" as const })),
    ...benign.map((address) => ({ address, groundTruth: "benign" as const })),
  ]
  const manifestCore = {
    schemaVersion: 1,
    evaluationRole: "fresh_independent_phishinghook_contract_holdout",
    source: "PhishingHook DSN 2025 Zenodo record 15076626",
    maliciousSourceSha256: EXPECTED_MALICIOUS_SHA,
    benignSourceSha256: EXPECTED_BENIGN_SHA,
    selection: "first 500 per class by sha256(lowercase address)",
    modelOutputUsedForSelection: false,
    cases,
  }
  const manifestSha256 = sha256(JSON.stringify(manifestCore))

  process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED = process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED ?? "true"
  process.env.SCAMGUARD_SANDBOX_ENABLED = "false"

  const details = await mapWithConcurrency(cases, 8, async (item): Promise<Evaluated> => {
    const observation = await observeCalibratedScamGuardV2({ type: "wallet", chain: "evm", value: item.address, deepScan: false }, { evaluationMode: "holdout" })
    const proposedSignalCodes = observation.proposedSignals.map((s) => s.code)
    return {
      ...item,
      v1Risk: observation.base.riskLevel,
      v2Risk: observation.proposedAssessment.proposedRiskLevel,
      evidenceScore: observation.proposedAssessment.evidenceScore,
      activationGate: observation.proposedAssessment.activationGate,
      independentFamilies: observation.proposedAssessment.independentFamilies,
      independentSources: observation.proposedAssessment.independentSources,
      proposedSignalCodes,
      publicThreatSignal: proposedSignalCodes.some(isPublicThreatSignal),
    }
  })

  const v1 = summarize(details.map((r) => ({ groundTruth: r.groundTruth, risk: r.v1Risk })))
  const v2 = summarize(details.map((r) => ({ groundTruth: r.groundTruth, risk: r.v2Risk })))
  const unseen = details.filter((r) => !r.publicThreatSignal)
  const seen = details.filter((r) => r.publicThreatSignal)
  const unseenV1 = summarize(unseen.map((r) => ({ groundTruth: r.groundTruth, risk: r.v1Risk })))
  const unseenV2 = summarize(unseen.map((r) => ({ groundTruth: r.groundTruth, risk: r.v2Risk })))
  const seenV1 = summarize(seen.map((r) => ({ groundTruth: r.groundTruth, risk: r.v1Risk })))
  const seenV2 = summarize(seen.map((r) => ({ groundTruth: r.groundTruth, risk: r.v2Risk })))

  const report = {
    schemaVersion: 1,
    evaluationRole: "fresh_independent_phishinghook_contract_holdout_evaluation",
    activationEligible: false,
    activationEligibleReason: "Independent address-level holdout. It validates contract/address intelligence, not transaction-level presigning accuracy. Production activation still requires transaction and URL holdouts plus governance gates.",
    manifestSha256,
    counts: { malicious: PER_CLASS, benign: PER_CLASS, total: cases.length },
    v1, v2,
    deltas: {
      precision: v2.precision - v1.precision,
      strictRecall: v2.strictRecall - v1.strictRecall,
      protectedRecall: v2.protectedRecall - v1.protectedRecall,
      falseNegativeSafeRate: v2.falseNegativeSafeRate - v1.falseNegativeSafeRate,
      falsePositiveRate: v2.falsePositiveRate - v1.falsePositiveRate,
      strictAccuracy: v2.strictAccuracy - v1.strictAccuracy,
    },
    leakageDiagnostics: {
      providerSeenCases: seen.length,
      providerUnseenCases: unseen.length,
      providerSeenByClass: { malicious: seen.filter((r) => r.groundTruth === "malicious").length, benign: seen.filter((r) => r.groundTruth === "benign").length },
      providerUnseenByClass: { malicious: unseen.filter((r) => r.groundTruth === "malicious").length, benign: unseen.filter((r) => r.groundTruth === "benign").length },
      providerSeenV1: seenV1,
      providerSeenV2: seenV2,
      providerUnseenV1: unseenV1,
      providerUnseenV2: unseenV2,
    },
    signalCounts: Object.fromEntries([...new Set(details.flatMap((r) => r.proposedSignalCodes))].sort().map((code) => [code, details.filter((r) => r.proposedSignalCodes.includes(code)).length])),
    details,
  }
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    evaluationRole: report.evaluationRole,
    manifestSha256,
    counts: report.counts,
    v1, v2,
    deltas: report.deltas,
    leakageDiagnostics: report.leakageDiagnostics,
    signalCounts: report.signalCounts,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
