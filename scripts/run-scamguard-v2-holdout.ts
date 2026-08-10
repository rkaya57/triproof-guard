import { readFile, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import type { ScamGuardRiskLevel, ScamGuardScanType, ScamGuardChain } from "@/lib/scamguard/engine"
import { observeScamGuardV2 } from "@/lib/scamguard/v2/evidence-fusion"
import { evaluateScamGuardHoldout, type ScamGuardHoldoutCase } from "@/lib/scamguard/v2/holdout-evaluation"

const FIXTURE = path.join(process.cwd(), "lib/scamguard/v2/fixtures/holdout-150.csv")
const OUT_DIR = path.join(process.cwd(), "artifacts/scamguard-v2-holdout")
const FROZEN_COMMIT = "8561f45c72868ae75e8a5bcfeb554b964717d8ff"
const PUBLIC_SOLANA_RPC = "https://api.mainnet-beta.solana.com"
const PUBLIC_EVM_RPC = "https://ethereum-rpc.publicnode.com"

const rank: Record<ScamGuardRiskLevel, number> = { SAFE: 0, CAUTION: 1, HIGH_RISK: 2, CRITICAL: 3 }
function maxRisk(a: ScamGuardRiskLevel, b: ScamGuardRiskLevel): ScamGuardRiskLevel {
  return rank[a] >= rank[b] ? a : b
}

function parseCsv(text: string) {
  const lines = text.trim().split(/\r?\n/)
  const headers = lines.shift()!.split(",")
  return lines.map((line) => {
    const values = line.split(",")
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
  })
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: `${method}-${attempt}`, method, params }),
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      })
      const body = await response.json() as { result?: T; error?: { message?: string } }
      if (response.ok && !body.error) return body.result ?? null
      if (response.status !== 429) return null
    } catch {
      // bounded retry below
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
  }
  return null
}

async function resolveTransaction(chain: string, id: string) {
  if (chain === "evm") {
    const endpoint = process.env.EVM_HOLDOUT_RPC_URL?.trim() || process.env.EVM_RPC_URL?.trim() || PUBLIC_EVM_RPC
    const tx = await rpc<Record<string, unknown>>(endpoint, "eth_getTransactionByHash", [id])
    return tx ? JSON.stringify(tx) : null
  }
  if (chain === "solana") {
    const endpoint = process.env.SOLANA_RPC_URL?.trim() || PUBLIC_SOLANA_RPC
    const tx = await rpc<{ transaction?: [string, string] | string }>(endpoint, "getTransaction", [
      id,
      { encoding: "base64", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
    ])
    const serialized = Array.isArray(tx?.transaction) ? tx?.transaction[0] : tx?.transaction
    return typeof serialized === "string" && serialized.length > 80 ? serialized : null
  }
  return null
}

function normalizeInput(record: Record<string, string>, resolvedTransaction: string | null) {
  const type = record.surface as ScamGuardScanType
  const chain = record.chain as ScamGuardChain
  let value = record.target
  if (type === "url" && !/^https?:\/\//i.test(value)) value = `https://${value}`
  if (type === "transaction") value = resolvedTransaction ?? value
  return {
    type,
    value,
    chain,
    claimedAsset: type === "token" && record.tokenName ? record.tokenName : undefined,
    deepScan: false,
  }
}

function metricsFor(rows: Array<{ id: string; groundTruth: "benign" | "malicious"; v1RiskLevel: ScamGuardRiskLevel; v2RiskLevel: ScamGuardRiskLevel }>) {
  return evaluateScamGuardHoldout(rows)
}

async function main() {
  process.env.SOLANA_RPC_URL = process.env.SOLANA_RPC_URL?.trim() || PUBLIC_SOLANA_RPC
  process.env.EVM_RPC_URL = process.env.EVM_RPC_URL?.trim() || process.env.EVM_HOLDOUT_RPC_URL?.trim() || PUBLIC_EVM_RPC
  process.env.PHISHING_DATABASE_FEED_URL = process.env.PHISHING_DATABASE_FEED_URL?.trim() || "https://openphish.com/feed.txt"

  const records = parseCsv(await readFile(FIXTURE, "utf8"))
  if (records.length !== 150) throw new Error(`Expected 150 Holdout records, found ${records.length}`)

  const scored: ScamGuardHoldoutCase[] = []
  const details: Array<Record<string, unknown>> = []
  const unresolved: string[] = []
  const strata = new Map<string, ScamGuardHoldoutCase[]>()

  for (const record of records) {
    let resolvedTransaction: string | null = null
    if (record.surface === "transaction") {
      resolvedTransaction = await resolveTransaction(record.chain, record.target)
      if (!resolvedTransaction) {
        unresolved.push(record.id)
        details.push({ id: record.id, status: "unresolved_transaction", chain: record.chain, target: record.target })
        continue
      }
    }

    try {
      const observation = await observeScamGuardV2(normalizeInput(record, resolvedTransaction), { evaluationMode: "holdout" })
      const v1RiskLevel = observation.base.riskLevel
      const additiveRiskLevel = observation.proposedAssessment.proposedRiskLevel
      const v2RiskLevel = maxRisk(v1RiskLevel, additiveRiskLevel)
      const item: ScamGuardHoldoutCase = {
        id: record.id,
        groundTruth: record.groundTruth as "benign" | "malicious",
        v1RiskLevel,
        v2RiskLevel,
      }
      scored.push(item)
      const surfaceKey = `surface:${record.surface}`
      const chainKey = `chain:${record.chain}`
      strata.set(surfaceKey, [...(strata.get(surfaceKey) ?? []), item])
      strata.set(chainKey, [...(strata.get(chainKey) ?? []), item])
      details.push({
        id: record.id,
        projectId: record.projectId,
        surface: record.surface,
        chain: record.chain,
        groundTruth: record.groundTruth,
        v1RiskLevel,
        additiveV2RiskLevel: additiveRiskLevel,
        effectiveV2RiskLevel: v2RiskLevel,
        evidenceScore: observation.proposedAssessment.evidenceScore,
        activationGate: observation.proposedAssessment.activationGate,
        independentFamilies: observation.proposedAssessment.independentFamilies,
        independentSources: observation.proposedAssessment.independentSources,
        providerQuality: observation.providerQuality,
      })
    } catch (error) {
      details.push({ id: record.id, status: "scan_error", error: error instanceof Error ? error.message : String(error) })
    }
  }

  const overall = metricsFor(scored)
  const stratified = Object.fromEntries([...strata.entries()].map(([key, cases]) => [key, metricsFor(cases)]))
  const providerParity = {
    tokensXyzConfigured: Boolean(process.env.TOKENS_XYZ_API_KEY?.trim()),
    phishingFeedConfigured: Boolean(process.env.PHISHING_DATABASE_FEED_URL?.trim()),
    solanaRpcConfigured: Boolean(process.env.SOLANA_RPC_URL?.trim()),
    evmRpcConfigured: Boolean(process.env.EVM_RPC_URL?.trim()),
  }
  const providerParityReady = providerParity.tokensXyzConfigured && providerParity.phishingFeedConfigured && providerParity.solanaRpcConfigured && providerParity.evmRpcConfigured

  const report = {
    schemaVersion: 2,
    frozenCommit: FROZEN_COMMIT,
    evaluationMode: "holdout",
    effectiveV2Policy: "max(v1, additive-v2); automatic downgrade prohibited",
    totalFixtureCases: records.length,
    scoredCases: scored.length,
    unresolvedTransactions: unresolved,
    providerParity,
    providerParityReady,
    productionActivationEligible: false,
    overall,
    stratified,
    details,
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    frozenCommit: report.frozenCommit,
    totalFixtureCases: report.totalFixtureCases,
    scoredCases: report.scoredCases,
    unresolvedTransactions: report.unresolvedTransactions.length,
    providerParity: report.providerParity,
    providerParityReady: report.providerParityReady,
    overall: report.overall,
  }, null, 2))

  if (unresolved.length) process.exitCode = 3
  if (!providerParityReady) process.exitCode = 2
}

await main()
