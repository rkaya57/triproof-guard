import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import type { ScamGuardRiskLevel } from "@/lib/scamguard/engine"
import { observeCalibratedScamGuardV2 } from "@/lib/scamguard/v2/calibrated-evidence-fusion"

const MALICIOUS_REPORT = path.join(process.cwd(), "artifacts/ptxphish-presigning-inspection/report.json")
const BENIGN_REPORT = path.join(process.cwd(), "artifacts/scamguard-v2-benign-presigning-controls/report.json")
const OUT_DIR = path.join(process.cwd(), "artifacts/scamguard-v2-presigning-challenge")
const EXPECTED_MALICIOUS_SHA = "747211560fa6a0244b115d0d7fcc896073057a6bc4c3acdf8115100ee3c1c932"
const EXPECTED_BENIGN_END_BLOCK = 25731971
const EXPECTED_PER_CLASS = 106
const RPC = process.env.EVM_RPC_URL?.trim() || "https://ethereum-rpc.publicnode.com"
const riskRank: Record<ScamGuardRiskLevel, number> = { SAFE: 0, CAUTION: 1, HIGH_RISK: 2, CRITICAL: 3 }

type MaliciousCase = {
  txHash: string
  category: string
  sourceUrl: string
  from: string
  to: string
  selector: string
  selectorFamily: string
}
type MaliciousReport = {
  compatibleSha256: string
  compatibleCount: number
  cases: MaliciousCase[]
}
type BenignCase = {
  txHash: string
  blockNumber: number
  from: string
  token: string
  spender: string
  selector: string
  method: string
  groundTruth: "benign"
  sources: string[]
}
type BenignReport = {
  endBlock: number
  selectedControlsSha256: string
  selectedChallengeControls: number
  uniqueVerifiedSenders: number
  selectedControls: BenignCase[]
}
type ChallengeCase = {
  txHash: string
  groundTruth: "benign" | "malicious"
  stratum: "ptxphish_proxy_upgrade" | "aave_usdc_approval"
  provenanceUrls: string[]
}
type RpcTransaction = { hash: string; from?: string; to?: string | null; input?: string; value?: string }
type RpcResponse = { id: number; result?: RpcTransaction | null; error?: { message?: string } }

function maxRisk(a: ScamGuardRiskLevel, b: ScamGuardRiskLevel) {
  return riskRank[a] >= riskRank[b] ? a : b
}
function bucket(level: ScamGuardRiskLevel): "safe" | "review" | "malicious" {
  if (level === "SAFE") return "safe"
  if (level === "CAUTION") return "review"
  return "malicious"
}
function ratio(n: number, d: number) { return d ? n / d : 0 }
function summarize(rows: Array<{ groundTruth: "benign" | "malicious"; risk: ScamGuardRiskLevel }>) {
  const maliciousRows = rows.filter((row) => row.groundTruth === "malicious")
  const benignRows = rows.filter((row) => row.groundTruth === "benign")
  const tp = maliciousRows.filter((row) => bucket(row.risk) === "malicious").length
  const maliciousReview = maliciousRows.filter((row) => bucket(row.risk) === "review").length
  const maliciousSafe = maliciousRows.filter((row) => bucket(row.risk) === "safe").length
  const fp = benignRows.filter((row) => bucket(row.risk) === "malicious").length
  const benignReview = benignRows.filter((row) => bucket(row.risk) === "review").length
  const tn = benignRows.filter((row) => bucket(row.risk) === "safe").length
  return {
    total: rows.length,
    maliciousCases: maliciousRows.length,
    benignCases: benignRows.length,
    tp,
    fp,
    tn,
    maliciousReview,
    maliciousSafe,
    benignReview,
    precision: ratio(tp, tp + fp),
    strictRecall: ratio(tp, maliciousRows.length),
    protectedRecall: ratio(tp + maliciousReview, maliciousRows.length),
    falseNegativeSafeRate: ratio(maliciousSafe, maliciousRows.length),
    falsePositiveRate: ratio(fp, benignRows.length),
    benignSafeRate: ratio(tn, benignRows.length),
    benignReviewRate: ratio(benignReview, benignRows.length),
    strictAccuracy: ratio(tp + tn, rows.length),
  }
}

async function fetchTransactions(cases: ChallengeCase[]) {
  const found = new Map<string, RpcTransaction>()
  const failures: Array<{ txHash: string; error: string }> = []
  for (let start = 0; start < cases.length; start += 30) {
    const chunk = cases.slice(start, start + 30)
    const payload = chunk.map((item, index) => ({ jsonrpc: "2.0", id: start + index + 1, method: "eth_getTransactionByHash", params: [item.txHash] }))
    const response = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error(`EVM RPC batch failed HTTP ${response.status}`)
    const returned = await response.json() as RpcResponse[]
    const byId = new Map(returned.map((row) => [row.id, row]))
    for (let index = 0; index < chunk.length; index++) {
      const item = chunk[index]
      const row = byId.get(start + index + 1)
      if (row?.result?.hash) found.set(item.txHash.toLowerCase(), row.result)
      else failures.push({ txHash: item.txHash, error: row?.error?.message || "transaction not returned" })
    }
  }
  return { found, failures }
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

async function main() {
  const malicious = JSON.parse(await readFile(MALICIOUS_REPORT, "utf8")) as MaliciousReport
  const benign = JSON.parse(await readFile(BENIGN_REPORT, "utf8")) as BenignReport
  if (malicious.compatibleSha256 !== EXPECTED_MALICIOUS_SHA) throw new Error(`PTXPhish compatible SHA drift: ${malicious.compatibleSha256}`)
  if (malicious.compatibleCount !== EXPECTED_PER_CLASS) throw new Error(`Expected ${EXPECTED_PER_CLASS} malicious cases, got ${malicious.compatibleCount}`)
  if (benign.endBlock !== EXPECTED_BENIGN_END_BLOCK) throw new Error(`Benign end-block drift: ${benign.endBlock}`)
  if (benign.selectedChallengeControls !== EXPECTED_PER_CLASS) throw new Error(`Expected ${EXPECTED_PER_CLASS} benign controls, got ${benign.selectedChallengeControls}`)
  if (new Set(benign.selectedControls.map((item) => item.from.toLowerCase())).size !== EXPECTED_PER_CLASS) throw new Error("Benign challenge controls are not sender-unique")

  const cases: ChallengeCase[] = [
    ...malicious.cases.map((item) => ({ txHash: item.txHash.toLowerCase(), groundTruth: "malicious" as const, stratum: "ptxphish_proxy_upgrade" as const, provenanceUrls: [item.sourceUrl] })),
    ...benign.selectedControls.map((item) => ({ txHash: item.txHash.toLowerCase(), groundTruth: "benign" as const, stratum: "aave_usdc_approval" as const, provenanceUrls: item.sources })),
  ]
  const hashes = cases.map((item) => item.txHash)
  if (new Set(hashes).size !== cases.length) throw new Error("Challenge contains duplicate transaction hashes")
  const manifestCore = {
    schemaVersion: 1,
    evaluationRole: "sealed_presigning_challenge_validation",
    activationEligible: false,
    maliciousSourceSha256: malicious.compatibleSha256,
    benignSourceSha256: benign.selectedControlsSha256,
    cases: cases.map(({ txHash, groundTruth, stratum }) => ({ txHash, groundTruth, stratum })),
  }
  const challengeManifestSha256 = createHash("sha256").update(JSON.stringify(manifestCore)).digest("hex")

  process.env.EVM_RPC_URL = RPC
  process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED = process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED ?? "true"
  process.env.METAMASK_PHISHING_CONFIG_ENABLED = process.env.METAMASK_PHISHING_CONFIG_ENABLED ?? "true"
  process.env.SCAMGUARD_SANDBOX_ENABLED = "false"

  const { found, failures } = await fetchTransactions(cases)
  if (failures.length) throw new Error(`Failed to resolve ${failures.length}/${cases.length} challenge transactions`)

  const details = await mapWithConcurrency(cases, 4, async (item) => {
    const tx = found.get(item.txHash)!
    const value = JSON.stringify({ method: "eth_sendTransaction", params: [{ from: tx.from, to: tx.to ?? undefined, data: tx.input ?? "0x", value: tx.value ?? "0x0" }] })
    const observation = await observeCalibratedScamGuardV2({ type: "transaction", chain: "evm", value, deepScan: false }, { evaluationMode: "holdout" })
    const v1Risk = observation.base.riskLevel
    const v2Risk = maxRisk(v1Risk, observation.proposedAssessment.proposedRiskLevel)
    return {
      txHash: item.txHash,
      groundTruth: item.groundTruth,
      stratum: item.stratum,
      provenanceUrls: item.provenanceUrls,
      from: tx.from,
      to: tx.to,
      selector: (tx.input ?? "0x").slice(0, 10).toLowerCase(),
      v1Risk,
      proposedV2Risk: observation.proposedAssessment.proposedRiskLevel,
      v2Risk,
      evidenceScore: observation.proposedAssessment.evidenceScore,
      activationGate: observation.proposedAssessment.activationGate,
      independentFamilies: observation.proposedAssessment.independentFamilies,
      independentSources: observation.proposedAssessment.independentSources,
      proposedSignalCodes: observation.proposedSignals.map((signal) => signal.code),
    }
  })

  const v1 = summarize(details.map((row) => ({ groundTruth: row.groundTruth, risk: row.v1Risk })))
  const v2 = summarize(details.map((row) => ({ groundTruth: row.groundTruth, risk: row.v2Risk })))
  const report = {
    schemaVersion: 1,
    evaluationRole: "sealed_presigning_challenge_validation",
    activationEligible: false,
    representativeActivationEligible: false,
    reason: "Both strata are real on-chain pre-signing-compatible transactions and selection is model-independent, but the malicious stratum is proxy upgradeTo while the benign stratum is Aave USDC approve. Method-family confounding makes this an error-discovery/challenge gate, not a representative production activation gate.",
    challengeManifestSha256,
    maliciousSourceSha256: malicious.compatibleSha256,
    benignSourceSha256: benign.selectedControlsSha256,
    casesPerClass: EXPECTED_PER_CLASS,
    totalCases: cases.length,
    rpcFailures: failures,
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
    details,
  }
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ evaluationRole: report.evaluationRole, activationEligible: report.activationEligible, challengeManifestSha256, maliciousSourceSha256: report.maliciousSourceSha256, benignSourceSha256: report.benignSourceSha256, totalCases: report.totalCases, v1, v2, deltas: report.deltas }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
