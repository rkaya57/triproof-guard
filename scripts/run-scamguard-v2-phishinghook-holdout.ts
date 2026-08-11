import { readFile, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import type { ScamGuardRiskLevel } from "@/lib/scamguard/engine"
import { observeCalibratedScamGuardV2 } from "@/lib/scamguard/v2/calibrated-evidence-fusion"
import { applyPresigningPolicy } from "@/lib/scamguard/v2/presigning-policy"

const INPUT = path.join(process.cwd(), "phishinghook-transaction-holdout", "artifacts", "phishinghook-transaction-holdout", "report.json")
const OUT_DIR = path.join(process.cwd(), "artifacts/scamguard-v2-phishinghook-holdout")
const EXPECTED_MANIFEST_SHA = "8c039685a51f730ed5b796ce9426ede3affc2cf68eb3dfb6059d5afb14ee25a5"
const EXPECTED_PER_CLASS = 100

type GroundTruth = "benign" | "malicious"
type CollectedCase = {
  txHash: string
  groundTruth: GroundTruth
  contract: string
  from?: string | null
  to: string
  input: string
  selector: string
  value: string
  blockNumber?: number | null
  blockTimestamp?: string | null
  method?: string | null
  source: string
}
type SourceReport = {
  evaluationRole: string
  manifestSha256: string
  counts: { malicious: number; benign: number; total: number }
  details: CollectedCase[]
}

type Evaluated = CollectedCase & {
  v1Risk: ScamGuardRiskLevel
  proposedV2Risk: ScamGuardRiskLevel
  v2Risk: ScamGuardRiskLevel
  policyMode: string
  policyReasonCodes: string[]
  evidenceScore: number
  activationGate: string
  independentFamilies: string[]
  independentSources: string[]
  proposedSignalCodes: string[]
  publicThreatSignal: boolean
}

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
    total: rows.length,
    maliciousCases: malicious.length,
    benignCases: benign.length,
    tp, fp, tn, maliciousReview, maliciousSafe, benignReview,
    precision: ratio(tp, tp + fp),
    strictRecall: ratio(tp, malicious.length),
    protectedRecall: ratio(tp + maliciousReview, malicious.length),
    falseNegativeSafeRate: ratio(maliciousSafe, malicious.length),
    falsePositiveRate: ratio(fp, benign.length),
    benignSafeRate: ratio(tn, benign.length),
    benignReviewRate: ratio(benignReview, benign.length),
    strictAccuracy: ratio(tp + tn, rows.length),
  }
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
  const source = JSON.parse(await readFile(INPUT, "utf8")) as SourceReport
  if (source.evaluationRole !== "fresh_independent_phishinghook_transaction_holdout") throw new Error(`Unexpected evaluation role: ${source.evaluationRole}`)
  if (source.manifestSha256 !== EXPECTED_MANIFEST_SHA) throw new Error(`PhishingHook manifest SHA drift: ${source.manifestSha256}`)
  if (source.counts.malicious !== EXPECTED_PER_CLASS || source.counts.benign !== EXPECTED_PER_CLASS || source.counts.total !== EXPECTED_PER_CLASS * 2) {
    throw new Error(`Unexpected class counts: ${JSON.stringify(source.counts)}`)
  }
  if (source.details.length !== source.counts.total) throw new Error("PhishingHook detail count mismatch")
  if (new Set(source.details.map((r) => r.txHash.toLowerCase())).size !== source.details.length) throw new Error("Duplicate transaction hash in frozen holdout")
  if (new Set(source.details.map((r) => r.contract.toLowerCase())).size !== source.details.length) throw new Error("Duplicate contract in frozen holdout")

  process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED = process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED ?? "true"
  process.env.METAMASK_PHISHING_CONFIG_ENABLED = process.env.METAMASK_PHISHING_CONFIG_ENABLED ?? "true"
  process.env.SCAMGUARD_SANDBOX_ENABLED = "false"

  const details = await mapWithConcurrency(source.details, 4, async (item): Promise<Evaluated> => {
    const value = JSON.stringify({ method: "eth_sendTransaction", params: [{ from: item.from ?? undefined, to: item.to, data: item.input, value: item.value || "0x0" }] })
    const observation = await observeCalibratedScamGuardV2({ type: "transaction", chain: "evm", value, deepScan: false }, { evaluationMode: "holdout" })
    const v1Risk = observation.base.riskLevel
    const proposedV2Risk = observation.proposedAssessment.proposedRiskLevel
    const policy = applyPresigningPolicy({ baseRisk: v1Risk, proposedRisk: proposedV2Risk, transaction: { to: item.to, data: item.input } })
    const proposedSignalCodes = observation.proposedSignals.map((signal) => signal.code)
    return {
      ...item,
      v1Risk,
      proposedV2Risk,
      v2Risk: policy.riskLevel,
      policyMode: policy.mode,
      policyReasonCodes: policy.reasonCodes,
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
  const providerUnseen = details.filter((r) => !r.publicThreatSignal)
  const providerSeen = details.filter((r) => r.publicThreatSignal)
  const providerUnseenV1 = summarize(providerUnseen.map((r) => ({ groundTruth: r.groundTruth, risk: r.v1Risk })))
  const providerUnseenV2 = summarize(providerUnseen.map((r) => ({ groundTruth: r.groundTruth, risk: r.v2Risk })))
  const providerSeenV1 = summarize(providerSeen.map((r) => ({ groundTruth: r.groundTruth, risk: r.v1Risk })))
  const providerSeenV2 = summarize(providerSeen.map((r) => ({ groundTruth: r.groundTruth, risk: r.v2Risk })))

  const selectorBreakdown = Object.fromEntries([...new Set(details.map((r) => r.selector))].sort().map((selector) => {
    const rows = details.filter((r) => r.selector === selector)
    return [selector, {
      total: rows.length,
      malicious: rows.filter((r) => r.groundTruth === "malicious").length,
      benign: rows.filter((r) => r.groundTruth === "benign").length,
      v1: summarize(rows.map((r) => ({ groundTruth: r.groundTruth, risk: r.v1Risk }))),
      v2: summarize(rows.map((r) => ({ groundTruth: r.groundTruth, risk: r.v2Risk }))),
    }]
  }))

  const report = {
    schemaVersion: 1,
    evaluationRole: "fresh_independent_phishinghook_transaction_holdout_evaluation",
    sourceManifestSha256: source.manifestSha256,
    activationEligible: false,
    activationEligibleReason: "Fresh independent balanced holdout. Activation remains false until leakage diagnostics, CI regression guards, and governance review are satisfied.",
    totalCases: details.length,
    v1,
    v2,
    deltas: {
      precision: v2.precision - v1.precision,
      strictRecall: v2.strictRecall - v1.strictRecall,
      protectedRecall: v2.protectedRecall - v1.protectedRecall,
      falseNegativeSafeRate: v2.falseNegativeSafeRate - v1.falseNegativeSafeRate,
      falsePositiveRate: v2.falsePositiveRate - v1.falsePositiveRate,
      benignSafeRate: v2.benignSafeRate - v1.benignSafeRate,
      benignReviewRate: v2.benignReviewRate - v1.benignReviewRate,
      strictAccuracy: v2.strictAccuracy - v1.strictAccuracy,
    },
    leakageDiagnostics: {
      providerSeenCases: providerSeen.length,
      providerUnseenCases: providerUnseen.length,
      providerSeenByClass: {
        malicious: providerSeen.filter((r) => r.groundTruth === "malicious").length,
        benign: providerSeen.filter((r) => r.groundTruth === "benign").length,
      },
      providerUnseenByClass: {
        malicious: providerUnseen.filter((r) => r.groundTruth === "malicious").length,
        benign: providerUnseen.filter((r) => r.groundTruth === "benign").length,
      },
      providerUnseenV1,
      providerUnseenV2,
      providerSeenV1,
      providerSeenV2,
    },
    selectorBreakdown,
    policyDiagnostics: {
      escalated: details.filter((r) => r.policyMode === "escalated").length,
      trustedFlowAttenuated: details.filter((r) => r.policyMode === "trusted_flow_attenuation").length,
      unchanged: details.filter((r) => r.policyMode === "unchanged").length,
      reasonCodes: Object.fromEntries([...new Set(details.flatMap((r) => r.policyReasonCodes))].sort().map((code) => [code, details.filter((r) => r.policyReasonCodes.includes(code)).length])),
    },
    details,
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    evaluationRole: report.evaluationRole,
    sourceManifestSha256: report.sourceManifestSha256,
    totalCases: report.totalCases,
    v1,
    v2,
    deltas: report.deltas,
    leakageDiagnostics: report.leakageDiagnostics,
    policyDiagnostics: report.policyDiagnostics,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
