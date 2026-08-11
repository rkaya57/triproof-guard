import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import type { ScamGuardRiskLevel } from "@/lib/scamguard/engine"
import { observeCalibratedScamGuardV2 } from "@/lib/scamguard/v2/calibrated-evidence-fusion"

const MANIFEST = path.join(process.cwd(), "artifacts/ptxphish-realworld/manifest.json")
const OUT_DIR = path.join(process.cwd(), "artifacts/ptxphish-realworld-validation")
const EXPECTED_MANIFEST_SHA256 = "ace6406902269865b9f281a9796ba2961a1bf6bd7b63f193acf0fc151a7ad0aa"
const EXPECTED_UPSTREAM_SHA256 = "a5bdc03757963d22a58b755caf08f058530658c34b5b38af428af0ee35b38ce0"
const PUBLIC_EVM_RPC = process.env.EVM_RPC_URL?.trim() || "https://ethereum-rpc.publicnode.com"
const riskRank: Record<ScamGuardRiskLevel, number> = { SAFE: 0, CAUTION: 1, HIGH_RISK: 2, CRITICAL: 3 }

type ManifestCase = {
  txHash: string
  category: string
  sourceUrl: string
  upstream: string
}

type Manifest = {
  schemaVersion: number
  manifestSha256: string
  upstreamSha256: string
  targetCases: number
  cases: ManifestCase[]
}

type RpcTransaction = {
  hash: string
  from?: string
  to?: string | null
  input?: string
  value?: string
}

type RpcResponse = { id: number; result?: RpcTransaction | null; error?: { message?: string } }

function maxRisk(a: ScamGuardRiskLevel, b: ScamGuardRiskLevel): ScamGuardRiskLevel {
  return riskRank[a] >= riskRank[b] ? a : b
}

function prediction(level: ScamGuardRiskLevel): "benign" | "review" | "malicious" {
  if (level === "SAFE") return "benign"
  if (level === "CAUTION") return "review"
  return "malicious"
}

function summarize(rows: Array<{ risk: ScamGuardRiskLevel }>) {
  const total = rows.length
  const malicious = rows.filter((row) => prediction(row.risk) === "malicious").length
  const review = rows.filter((row) => prediction(row.risk) === "review").length
  const benign = rows.filter((row) => prediction(row.risk) === "benign").length
  return {
    total,
    malicious,
    review,
    benign,
    strictRecall: total ? malicious / total : 0,
    protectedCoverage: total ? (malicious + review) / total : 0,
    falseNegativeRate: total ? benign / total : 0,
    reviewRate: total ? review / total : 0,
  }
}

async function fetchTransactions(cases: ManifestCase[]) {
  const found = new Map<string, RpcTransaction>()
  const failures: Array<{ txHash: string; error: string }> = []
  const chunkSize = 30
  for (let start = 0; start < cases.length; start += chunkSize) {
    const chunk = cases.slice(start, start + chunkSize)
    const payload = chunk.map((item, index) => ({
      jsonrpc: "2.0",
      id: start + index + 1,
      method: "eth_getTransactionByHash",
      params: [item.txHash],
    }))
    const response = await fetch(PUBLIC_EVM_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error(`EVM RPC batch failed with HTTP ${response.status}`)
    const rows = (await response.json()) as RpcResponse[]
    const byId = new Map(rows.map((row) => [row.id, row]))
    for (let index = 0; index < chunk.length; index += 1) {
      const item = chunk[index]
      const row = byId.get(start + index + 1)
      if (row?.result?.hash) found.set(item.txHash.toLowerCase(), row.result)
      else failures.push({ txHash: item.txHash, error: row?.error?.message ?? "transaction not returned by RPC" })
    }
  }
  return { found, failures }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      output[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return output
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8")) as Manifest
  if (manifest.manifestSha256 !== EXPECTED_MANIFEST_SHA256) {
    throw new Error(`Manifest hash mismatch: expected ${EXPECTED_MANIFEST_SHA256}, got ${manifest.manifestSha256}`)
  }
  if (manifest.upstreamSha256 !== EXPECTED_UPSTREAM_SHA256) {
    throw new Error(`Upstream corpus hash mismatch: expected ${EXPECTED_UPSTREAM_SHA256}, got ${manifest.upstreamSha256}`)
  }
  if (manifest.cases.length !== 120) throw new Error(`Expected 120 sealed PTXPhish cases, got ${manifest.cases.length}`)

  process.env.EVM_RPC_URL = PUBLIC_EVM_RPC
  process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED = process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED ?? "true"
  process.env.METAMASK_PHISHING_CONFIG_ENABLED = process.env.METAMASK_PHISHING_CONFIG_ENABLED ?? "true"
  process.env.SCAMGUARD_SANDBOX_ENABLED = "false"

  const { found, failures: rpcFailures } = await fetchTransactions(manifest.cases)
  const executable = manifest.cases.filter((item) => found.has(item.txHash.toLowerCase()))
  if (executable.length < 100) throw new Error(`Only ${executable.length}/120 sealed transactions resolved from RPC`)

  const details = await mapWithConcurrency(executable, 4, async (item) => {
    const tx = found.get(item.txHash.toLowerCase())!
    const value = JSON.stringify({
      method: "eth_sendTransaction",
      params: [{
        from: tx.from,
        to: tx.to ?? undefined,
        data: tx.input ?? "0x",
        value: tx.value ?? "0x0",
      }],
    })
    const observation = await observeCalibratedScamGuardV2({
      type: "transaction",
      chain: "evm",
      value,
      deepScan: false,
    }, { evaluationMode: "holdout" })
    const v1Risk = observation.base.riskLevel
    const v2Risk = maxRisk(v1Risk, observation.proposedAssessment.proposedRiskLevel)
    const decoded = observation.base.metadata.decodedIntent
    const threat = observation.evidence.evmThreatCorpus
    return {
      txHash: item.txHash,
      category: item.category,
      provenanceUrl: item.sourceUrl,
      from: tx.from,
      to: tx.to,
      selector: (tx.input ?? "0x").slice(0, 10),
      decodedMethod: decoded?.method,
      decodedCategory: decoded?.category,
      decodedSpender: decoded?.spender,
      decodedRecipient: decoded?.recipient,
      decodedContractTarget: decoded?.contractTarget,
      contractIntelligenceTarget: observation.base.metadata.contractIntelligence?.target,
      threatQueriedAddress: threat?.address,
      threatMatchedSources: threat?.matchedSources ?? [],
      threatAvailableSources: threat?.availableSources ?? [],
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

  const v1Rows = details.map((row) => ({ risk: row.v1Risk }))
  const v2Rows = details.map((row) => ({ risk: row.v2Risk }))
  const categories = [...new Set(details.map((row) => row.category))].sort()
  const byCategory = Object.fromEntries(categories.map((category) => {
    const rows = details.filter((row) => row.category === category)
    return [category, {
      total: rows.length,
      v1: summarize(rows.map((row) => ({ risk: row.v1Risk }))),
      v2: summarize(rows.map((row) => ({ risk: row.v2Risk }))),
    }]
  }))

  const report = {
    schemaVersion: 2,
    evaluationRole: "sealed_ptxphish_post_execution_realworld_transaction_validation",
    activationEligible: false,
    reason: "PTXPhish contains real phishing/execution transactions and is used here as a post-execution counterparty/detection stratum, not as a pure pre-signing activation benchmark. Activation still requires fresh benign controls and a pre-signing-compatible multi-surface blind gate.",
    manifestSha256: manifest.manifestSha256,
    upstreamSha256: manifest.upstreamSha256,
    sealedCases: manifest.cases.length,
    resolvedCases: details.length,
    rpcFailures,
    v1: summarize(v1Rows),
    v2: summarize(v2Rows),
    deltas: {
      strictRecall: summarize(v2Rows).strictRecall - summarize(v1Rows).strictRecall,
      protectedCoverage: summarize(v2Rows).protectedCoverage - summarize(v1Rows).protectedCoverage,
      falseNegativeRate: summarize(v2Rows).falseNegativeRate - summarize(v1Rows).falseNegativeRate,
      reviewRate: summarize(v2Rows).reviewRate - summarize(v1Rows).reviewRate,
    },
    diagnostics: {
      threatMatches: details.filter((row) => row.threatMatchedSources.length > 0).length,
      threatMatchesBySource: {
        realCats: details.filter((row) => row.threatMatchedSources.includes("real-cats")).length,
        rugPullDataset: details.filter((row) => row.threatMatchedSources.includes("rug-pull-dataset")).length,
        mewDarklist: details.filter((row) => row.threatMatchedSources.includes("mew-darklist")).length,
      },
      decodedCategories: Object.fromEntries([...new Set(details.map((row) => row.decodedCategory ?? "unknown"))].sort().map((category) => [category, details.filter((row) => (row.decodedCategory ?? "unknown") === category).length])),
    },
    byCategory,
    details,
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    evaluationRole: report.evaluationRole,
    manifestSha256: report.manifestSha256,
    sealedCases: report.sealedCases,
    resolvedCases: report.resolvedCases,
    rpcFailures: report.rpcFailures.length,
    diagnostics: report.diagnostics,
    v1: report.v1,
    v2: report.v2,
    deltas: report.deltas,
    byCategory: Object.fromEntries(Object.entries(report.byCategory).map(([key, value]) => [key, {
      total: value.total,
      v1StrictRecall: value.v1.strictRecall,
      v2StrictRecall: value.v2.strictRecall,
      v1ProtectedCoverage: value.v1.protectedCoverage,
      v2ProtectedCoverage: value.v2.protectedCoverage,
    }])),
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
