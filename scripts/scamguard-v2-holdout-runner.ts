import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"

import type { ScamGuardChain, ScamGuardRiskLevel, ScamGuardScanInput } from "../lib/scamguard/engine"
import { evaluateScamGuardHoldout, type ScamGuardHoldoutCase } from "../lib/scamguard/v2/holdout-evaluation"
import { observeScamGuardV2 } from "../lib/scamguard/v2/evidence-fusion"

const FROZEN_COMMIT = "8561f45c72868ae75e8a5bcfeb554b964717d8ff"
const DATA_DIR = path.join(process.cwd(), "data/holdout/scamguard-v2-2026-08-10")
const OUTPUT_DIR = path.join(process.cwd(), "artifacts")
const OUTPUT_PATH = path.join(OUTPUT_DIR, "scamguard-v2-holdout-report.json")
const REQUEST_TIMEOUT_MS = 20_000

type HoldoutRecord = {
  id: string
  projectId: string
  surface: "url" | "token" | "transaction" | "wallet"
  chain: ScamGuardChain
  groundTruth: "benign" | "malicious"
  target: string
  tokenName: string | null
  verificationStatus: string
  evidenceQuality: string
  source1: string
  source2: string
  freezeCommit: string
  evaluationMode: "holdout"
}

type ScoredRecord = HoldoutRecord & {
  status: "scored"
  v1RiskLevel: ScamGuardRiskLevel
  v2RiskLevel: ScamGuardRiskLevel
  providerSummary: {
    providerCount: number
    availableProviders: number
    activationEligibleSources: number
    proposedSignalCount: number
  }
  providerQuality: Array<{
    source: string
    status: string
    activationEligible: boolean
    reason?: string
  }>
}

type UnscorableRecord = HoldoutRecord & {
  status: "unscorable"
  reason: string
}

type CaseResult = ScoredRecord | UnscorableRecord

function normalizeUrl(value: string) {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed.replace(/^\/+/, "")}`
}

function isEvmTxHash(value: string) {
  return /^0x[a-fA-F0-9]{64}$/.test(value.trim())
}

function isSolanaSignature(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(value.trim())
}

async function rpc(url: string, method: string, params: unknown[]) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`${method} HTTP ${response.status}`)
  const body = (await response.json()) as { result?: unknown; error?: { message?: string } }
  if (body.error) throw new Error(body.error.message || `${method} RPC error`)
  return body.result
}

function ethereumRpcUrl() {
  const explicit = process.env.ETHEREUM_RPC_URL?.trim()
  if (explicit) return explicit
  const key = process.env.ALCHEMY_API_KEY?.trim()
  return key ? `https://eth-mainnet.g.alchemy.com/v2/${key}` : null
}

function solanaRpcUrl() {
  const explicit = process.env.SOLANA_RPC_URL?.trim()
  if (explicit) return explicit
  const helius = process.env.HELIUS_API_KEY?.trim()
  return helius ? `https://mainnet.helius-rpc.com/?api-key=${helius}` : "https://api.mainnet-beta.solana.com"
}

async function resolveEvmTransaction(hash: string) {
  if (!isEvmTxHash(hash)) throw new Error("invalid EVM transaction hash format")
  const url = ethereumRpcUrl()
  if (!url) throw new Error("ETHEREUM_RPC_URL or ALCHEMY_API_KEY is required to resolve EVM transaction hashes")
  const tx = (await rpc(url, "eth_getTransactionByHash", [hash])) as {
    from?: string
    to?: string | null
    input?: string
    value?: string
  } | null
  if (!tx) throw new Error("EVM transaction not found by RPC")
  return JSON.stringify({
    method: "eth_sendTransaction",
    params: [{
      from: tx.from,
      to: tx.to ?? undefined,
      data: tx.input || "0x",
      value: tx.value || "0x0",
    }],
  })
}

async function resolveSolanaTransaction(signature: string) {
  if (!isSolanaSignature(signature)) throw new Error("invalid Solana transaction signature format")
  const result = (await rpc(solanaRpcUrl(), "getTransaction", [
    signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
  ])) as {
    transaction?: { message?: { instructions?: unknown[] } }
  } | null
  const instructions = result?.transaction?.message?.instructions
  if (!instructions?.length) throw new Error("Solana transaction not found or has no parsed instructions")
  return JSON.stringify({ transaction: { instructions } })
}

async function toScanInput(item: HoldoutRecord): Promise<ScamGuardScanInput & { claimedAsset?: string }> {
  if (item.surface === "transaction") {
    const value = item.chain === "evm"
      ? await resolveEvmTransaction(item.target)
      : item.chain === "solana"
        ? await resolveSolanaTransaction(item.target)
        : (() => { throw new Error("transaction case requires evm or solana chain") })()
    return { type: "transaction", chain: item.chain, value }
  }

  if (item.surface === "url") {
    return { type: "url", chain: "unknown", value: normalizeUrl(item.target), deepScan: false }
  }

  if (item.surface === "token") {
    return {
      type: "token",
      chain: item.chain,
      value: item.target.trim(),
      claimedAsset: item.tokenName?.trim() || undefined,
      deepScan: false,
    }
  }

  return { type: "wallet", chain: item.chain, value: item.target.trim(), deepScan: false }
}

async function loadDataset() {
  const filenames = (await readdir(DATA_DIR)).filter((name) => /^part-\d+\.json$/.test(name)).sort((a, b) => {
    const an = Number(a.match(/\d+/)?.[0] ?? 0)
    const bn = Number(b.match(/\d+/)?.[0] ?? 0)
    return an - bn
  })
  if (!filenames.length) throw new Error(`No Holdout dataset parts found under ${DATA_DIR}`)

  const records: HoldoutRecord[] = []
  for (const filename of filenames) {
    const parsed = JSON.parse(await readFile(path.join(DATA_DIR, filename), "utf8")) as HoldoutRecord[]
    records.push(...parsed)
  }

  const ids = new Set<string>()
  for (const item of records) {
    if (ids.has(item.id)) throw new Error(`Duplicate Holdout id: ${item.id}`)
    ids.add(item.id)
    if (item.freezeCommit !== FROZEN_COMMIT) throw new Error(`${item.id} is not pinned to frozen commit`)
    if (item.evaluationMode !== "holdout") throw new Error(`${item.id} is not in holdout evaluation mode`)
  }
  if (records.length !== 150) throw new Error(`Expected 150 Holdout records, found ${records.length}`)
  return records
}

function metricCase(item: ScoredRecord): ScamGuardHoldoutCase {
  return {
    id: item.id,
    groundTruth: item.groundTruth,
    v1RiskLevel: item.v1RiskLevel,
    v2RiskLevel: item.v2RiskLevel,
  }
}

function evaluateGroup(items: ScoredRecord[]) {
  return items.length ? evaluateScamGuardHoldout(items.map(metricCase)) : null
}

function groupBy(items: ScoredRecord[], key: (item: ScoredRecord) => string) {
  const result: Record<string, ReturnType<typeof evaluateGroup>> = {}
  for (const value of [...new Set(items.map(key))].sort()) {
    result[value] = evaluateGroup(items.filter((item) => key(item) === value))
  }
  return result
}

async function main() {
  // Holdout isolation: do not let Tri-Proof DB intelligence/adjudication become ground-truth leakage.
  delete process.env.DATABASE_URL

  const dataset = await loadDataset()
  const results: CaseResult[] = []

  for (const [index, item] of dataset.entries()) {
    process.stdout.write(`[${index + 1}/${dataset.length}] ${item.id} ${item.surface}/${item.chain} ... `)
    try {
      const input = await toScanInput(item)
      const observation = await observeScamGuardV2(input, { evaluationMode: "holdout" })
      const scored: ScoredRecord = {
        ...item,
        status: "scored",
        v1RiskLevel: observation.base.riskLevel,
        v2RiskLevel: observation.proposedAssessment.proposedRiskLevel,
        providerSummary: {
          providerCount: observation.summary.providerCount,
          availableProviders: observation.summary.availableProviders,
          activationEligibleSources: observation.summary.activationEligibleSources,
          proposedSignalCount: observation.summary.proposedSignalCount,
        },
        providerQuality: observation.providerQuality.map((entry) => ({
          source: entry.source,
          status: entry.status,
          activationEligible: entry.activationEligible,
          reason: entry.reason,
        })),
      }
      results.push(scored)
      console.log(`V1=${scored.v1RiskLevel} V2=${scored.v2RiskLevel}`)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      results.push({ ...item, status: "unscorable", reason })
      console.log(`UNSCORABLE: ${reason}`)
    }
  }

  const scored = results.filter((item): item is ScoredRecord => item.status === "scored")
  const unscorable = results.filter((item): item is UnscorableRecord => item.status === "unscorable")
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    frozenCommit: FROZEN_COMMIT,
    evaluationMode: "holdout",
    isolation: {
      databaseIntelDisabled: true,
      internalAdjudicationExcludedByV2HoldoutMode: true,
      internalGraphExcludedByV2HoldoutMode: true,
      productionDecisionChanged: false,
    },
    environment: {
      ethereumRpcConfigured: Boolean(ethereumRpcUrl()),
      solanaRpcConfigured: Boolean(solanaRpcUrl()),
      tokensXyzConfigured: Boolean(process.env.TOKENS_XYZ_API_KEY?.trim()),
      phishingDatabaseEnabled: (process.env.PHISHING_DATABASE_ENABLED ?? "true").toLowerCase() !== "false",
    },
    dataset: {
      total: dataset.length,
      scored: scored.length,
      unscorable: unscorable.length,
      groundTruth: {
        benign: dataset.filter((item) => item.groundTruth === "benign").length,
        malicious: dataset.filter((item) => item.groundTruth === "malicious").length,
      },
    },
    overall: evaluateGroup(scored),
    bySurface: groupBy(scored, (item) => item.surface),
    byChain: groupBy(scored, (item) => item.chain),
    byVerificationStatus: groupBy(scored, (item) => item.verificationStatus),
    byEvidenceQuality: groupBy(scored, (item) => item.evidenceQuality),
    unscorableReasons: unscorable.reduce<Record<string, number>>((acc, item) => {
      acc[item.reason] = (acc[item.reason] ?? 0) + 1
      return acc
    }, {}),
    cases: results,
  }

  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8")
  console.log(`\nScored ${scored.length}/${dataset.length}; unscorable ${unscorable.length}`)
  console.log(JSON.stringify(report.overall, null, 2))
  console.log(`Report: ${OUTPUT_PATH}`)

  if (scored.length < 100) {
    throw new Error(`Holdout run is not decision-grade: only ${scored.length}/150 cases were scorable`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
