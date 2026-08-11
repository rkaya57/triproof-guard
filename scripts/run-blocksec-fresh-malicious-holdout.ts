import { createHash } from "node:crypto"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"

import type { ScamGuardRiskLevel } from "@/lib/scamguard/engine"
import { observeCalibratedScamGuardV2 } from "@/lib/scamguard/v2/calibrated-evidence-fusion"
import { applyPresigningPolicy } from "@/lib/scamguard/v2/presigning-policy"

const TX_FILE = path.join(process.cwd(), "blocksec-dataset/phishing_transactions.log")
const CONTRACT_FILE = path.join(process.cwd(), "blocksec-dataset/phishing_contracts.log")
const PTX_REPORT = path.join(process.cwd(), "artifacts/ptxphish-presigning-inspection/report.json")
const OUT_DIR = path.join(process.cwd(), "artifacts/blocksec-fresh-malicious-holdout")
const EXPECTED_TX_SHA = "6d6eeaafc9c901b068479b2e5dba929c0ff8056fc982d56a12faf7d2fcec4362"
const EXPECTED_CONTRACT_SHA = "858e60d5078659989aa160ad0890fb9b157910754e6127dafcef3f1c376e2e1e"
const TARGET = 120
const MAX_SCAN = 12000
const RPCS = [
  process.env.EVM_RPC_URL?.trim(),
  "https://ethereum-rpc.publicnode.com",
  "https://eth.llamarpc.com",
  "https://eth.blockscout.com/api/eth-rpc",
].filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i)

const THRESHOLDS = Object.freeze({
  strictRecallMin: 0.95,
  protectedRecallMin: 0.98,
  safeFalseNegativeRateMax: 0.02,
})

type RpcTx = { hash: string; from?: string; to?: string | null; input?: string; value?: string; blockNumber?: string } | null
type RpcReceipt = { status?: string; blockNumber?: string } | null
type HoldoutCase = { txHash: string; from: string; to: string; selector: string; blockNumber: number; inputLengthBytes: number }

function sha256(value: string) { return createHash("sha256").update(value).digest("hex") }
function riskBucket(level: ScamGuardRiskLevel) {
  if (level === "SAFE") return "safe" as const
  if (level === "CAUTION") return "review" as const
  return "malicious" as const
}
async function rpcBatch(method: string, values: string[]) {
  let lastError = "no RPC endpoint"
  for (const endpoint of RPCS) {
    try {
      const body = values.map((value, index) => ({ jsonrpc: "2.0", id: index + 1, method, params: [value] }))
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      if (!response.ok) { lastError = `${endpoint} ${method} HTTP ${response.status}`; continue }
      const payload = await response.json() as Array<{ id: number; result?: unknown; error?: { message?: string } }>
      if (!Array.isArray(payload)) { lastError = `${endpoint} ${method} non-batch response`; continue }
      return { endpoint, payload }
    } catch (error) { lastError = `${endpoint} ${method}: ${error instanceof Error ? error.message : String(error)}` }
  }
  throw new Error(lastError)
}

async function buildSealedManifest() {
  const txRaw = await readFile(TX_FILE, "utf8")
  const contractRaw = await readFile(CONTRACT_FILE, "utf8")
  if (sha256(txRaw) !== EXPECTED_TX_SHA) throw new Error("BlockSec transaction source SHA drift")
  if (sha256(contractRaw) !== EXPECTED_CONTRACT_SHA) throw new Error("BlockSec contract source SHA drift")

  const phishingContracts = new Set(contractRaw.split(/\r?\n/).map((x) => x.trim().toLowerCase()).filter((x) => /^0x[a-f0-9]{40}$/.test(x)))
  const ptx = JSON.parse(await readFile(PTX_REPORT, "utf8")) as { cases?: Array<{ txHash: string }> }
  const retired = new Set((ptx.cases ?? []).map((x) => x.txHash.toLowerCase()))
  const hashes = [...new Set(txRaw.split(/\r?\n/).map((x) => x.trim().toLowerCase()).filter((x) => /^0x[a-f0-9]{64}$/.test(x) && !retired.has(x)))]
    .sort((a, b) => sha256(a).localeCompare(sha256(b)))
    .slice(0, MAX_SCAN)

  const selected: HoldoutCase[] = []
  const senders = new Set<string>()
  let scanned = 0
  let resolved = 0
  let destinationMatched = 0
  let successful = 0
  let lastSuccessfulRpc = ""

  for (let start = 0; start < hashes.length && selected.length < TARGET; start += 40) {
    const batch = hashes.slice(start, start + 40)
    const txResponse = await rpcBatch("eth_getTransactionByHash", batch)
    lastSuccessfulRpc = txResponse.endpoint
    const byId = new Map(txResponse.payload.map((row) => [row.id, row]))
    const eligible: Array<{ hash: string; tx: NonNullable<RpcTx> }> = []
    for (let index = 0; index < batch.length; index++) {
      scanned++
      const tx = byId.get(index + 1)?.result as RpcTx | undefined
      if (!tx?.hash || !tx.from || !tx.to) continue
      resolved++
      const to = tx.to.toLowerCase()
      const from = tx.from.toLowerCase()
      const input = (tx.input ?? "0x").toLowerCase()
      if (!phishingContracts.has(to)) continue
      destinationMatched++
      if (input === "0x" || input.length < 10 || senders.has(from)) continue
      eligible.push({ hash: tx.hash.toLowerCase(), tx })
    }
    if (!eligible.length) continue
    const receipts = await rpcBatch("eth_getTransactionReceipt", eligible.map((x) => x.hash))
    lastSuccessfulRpc = receipts.endpoint
    const receiptById = new Map(receipts.payload.map((row) => [row.id, row]))
    for (let index = 0; index < eligible.length && selected.length < TARGET; index++) {
      const { hash, tx } = eligible[index]
      const receipt = receiptById.get(index + 1)?.result as RpcReceipt | undefined
      if (!receipt || receipt.status !== "0x1") continue
      successful++
      const from = tx.from!.toLowerCase()
      if (senders.has(from)) continue
      senders.add(from)
      const input = (tx.input ?? "0x").toLowerCase()
      selected.push({
        txHash: hash,
        from,
        to: tx.to!.toLowerCase(),
        selector: input.slice(0, 10),
        blockNumber: Number.parseInt(receipt.blockNumber ?? tx.blockNumber ?? "0x0", 16),
        inputLengthBytes: Math.max(0, (input.length - 2) / 2),
      })
    }
  }
  if (selected.length !== TARGET) throw new Error(`Could seal only ${selected.length}/${TARGET} BlockSec cases`)
  const core = {
    schemaVersion: 1,
    evaluationRole: "fresh_untouched_blocksec_malicious_holdout",
    sourceRepo: "blocksecteam/phishing_contract_sigmetrics25",
    sourceCommit: "b3e7a78eaf96bf09cb617ffda480203deb7516f2",
    sourceTransactionSha256: EXPECTED_TX_SHA,
    sourceContractSha256: EXPECTED_CONTRACT_SHA,
    selectionUsesModelOutputs: false,
    selectionRule: "exclude retired PTXPhish hashes; dedupe; SHA-256(lowercase txHash) ascending; require RPC-resolved top-level tx.to in BlockSec phishing_contracts.log, non-empty calldata, successful receipt, unique sender; stop at 120",
    thresholds: THRESHOLDS,
    cases: selected,
  }
  return { manifest: { ...core, manifestSha256: sha256(JSON.stringify(core)) }, diagnostics: { scanned, resolved, destinationMatched, successful, uniqueSenders: senders.size, lastSuccessfulRpc } }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out = new Array<R>(items.length); let cursor = 0
  async function worker() { while (true) { const i = cursor++; if (i >= items.length) return; out[i] = await fn(items[i]) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

async function main() {
  const { manifest, diagnostics } = await buildSealedManifest()
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2))
  console.log(JSON.stringify({ phase: "sealed_before_model_evaluation", manifestSha256: manifest.manifestSha256, cases: manifest.cases.length, thresholds: THRESHOLDS, diagnostics }, null, 2))

  process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED = process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED ?? "true"
  process.env.METAMASK_PHISHING_CONFIG_ENABLED = process.env.METAMASK_PHISHING_CONFIG_ENABLED ?? "true"
  process.env.SCAMGUARD_SANDBOX_ENABLED = "false"

  const details = await mapWithConcurrency(manifest.cases, 4, async (item) => {
    const txResp = await rpcBatch("eth_getTransactionByHash", [item.txHash])
    const tx = txResp.payload[0]?.result as RpcTx
    if (!tx?.hash) throw new Error(`Holdout tx disappeared: ${item.txHash}`)
    const data = tx.input ?? "0x"
    const value = JSON.stringify({ method: "eth_sendTransaction", params: [{ from: tx.from, to: tx.to ?? undefined, data, value: tx.value ?? "0x0" }] })
    const observation = await observeCalibratedScamGuardV2({ type: "transaction", chain: "evm", value, deepScan: false }, { evaluationMode: "holdout" })
    const policy = applyPresigningPolicy({ baseRisk: observation.base.riskLevel, proposedRisk: observation.proposedAssessment.proposedRiskLevel, transaction: { to: tx.to, data } })
    return {
      ...item,
      v1Risk: observation.base.riskLevel,
      fusionRisk: observation.proposedAssessment.proposedRiskLevel,
      v2Risk: policy.riskLevel,
      policyMode: policy.mode,
      policyReasonCodes: policy.reasonCodes,
      evidenceScore: observation.proposedAssessment.evidenceScore,
      activationGate: observation.proposedAssessment.activationGate,
      independentFamilies: observation.proposedAssessment.independentFamilies,
      independentSources: observation.proposedAssessment.independentSources,
      signalCodes: observation.proposedSignals.map((s) => s.code),
    }
  })

  function summarize(key: "v1Risk" | "v2Risk") {
    const malicious = details.filter((row) => riskBucket(row[key]) === "malicious").length
    const review = details.filter((row) => riskBucket(row[key]) === "review").length
    const safe = details.filter((row) => riskBucket(row[key]) === "safe").length
    return { total: details.length, malicious, review, safe, strictRecall: malicious / details.length, protectedRecall: (malicious + review) / details.length, safeFalseNegativeRate: safe / details.length }
  }
  const v1 = summarize("v1Risk")
  const v2 = summarize("v2Risk")
  const gate = {
    strictRecall: v2.strictRecall >= THRESHOLDS.strictRecallMin,
    protectedRecall: v2.protectedRecall >= THRESHOLDS.protectedRecallMin,
    safeFalseNegativeRate: v2.safeFalseNegativeRate <= THRESHOLDS.safeFalseNegativeRateMax,
  }
  const passed = Object.values(gate).every(Boolean)
  const report = {
    schemaVersion: 1,
    activationEligible: false,
    maliciousHoldoutGatePassed: passed,
    activationDecisionDeferred: true,
    reason: "This is a fresh independent malicious-only holdout. Production activation additionally requires a fresh non-overlapping benign holdout and combined gate.",
    manifestSha256: manifest.manifestSha256,
    thresholds: THRESHOLDS,
    gate,
    v1,
    v2,
    policyDiagnostics: {
      escalated: details.filter((x) => x.policyMode === "escalated").length,
      attenuated: details.filter((x) => x.policyMode === "trusted_flow_attenuation").length,
      unchanged: details.filter((x) => x.policyMode === "unchanged").length,
    },
    details,
  }
  await writeFile(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ phase: "evaluation_complete", manifestSha256: manifest.manifestSha256, thresholds: THRESHOLDS, gate, maliciousHoldoutGatePassed: passed, v1, v2, policyDiagnostics: report.policyDiagnostics }, null, 2))
}

main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1 })
