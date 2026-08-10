import { readFile, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import type { ScamGuardChain, ScamGuardRiskLevel, ScamGuardScanType } from "@/lib/scamguard/engine"
import { summarizeCalibrationEvidenceCoverage, type CalibrationEvidenceCase } from "@/lib/scamguard/v2/calibration-evidence-coverage"
import { observeCalibratedScamGuardV2 } from "@/lib/scamguard/v2/calibrated-evidence-fusion"
import { evaluateScamGuardHoldout, type ScamGuardHoldoutCase } from "@/lib/scamguard/v2/holdout-evaluation"

const FIXTURE = path.join(process.cwd(), "lib/scamguard/v2/fixtures/holdout-150.csv")
const OUT_DIR = path.join(process.cwd(), "artifacts/scamguard-v2-calibration-replay")
const PUBLIC_SOLANA_RPC = "https://api.mainnet-beta.solana.com"
const PUBLIC_SOLANA_ARCHIVE_FALLBACK = "https://solana-rpc.publicnode.com"
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
        body: JSON.stringify({ jsonrpc: "2.0", id: `calibration-${method}-${attempt}`, method, params }),
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      })
      const body = await response.json() as { result?: T; error?: { message?: string } }
      if (response.ok && !body.error) return body.result ?? null
      if (response.status !== 429) return null
    } catch {
      // Bounded retry below. Replay failures remain diagnostic and are reported.
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
  }
  return null
}

async function resolveTransaction(chain: string, id: string) {
  if (chain === "evm") {
    const endpoint = process.env.EVM_REPLAY_RPC_URL?.trim() || process.env.EVM_RPC_URL?.trim() || PUBLIC_EVM_RPC
    const tx = await rpc<Record<string, unknown>>(endpoint, "eth_getTransactionByHash", [id])
    return tx ? JSON.stringify(tx) : null
  }
  if (chain === "solana") {
    const configured = process.env.SOLANA_RPC_URL?.trim()
    const endpoints = Array.from(new Set([configured, PUBLIC_SOLANA_RPC, PUBLIC_SOLANA_ARCHIVE_FALLBACK].filter(Boolean))) as string[]
    for (const endpoint of endpoints) {
      const tx = await rpc<{ transaction?: [string, string] | string }>(endpoint, "getTransaction", [
        id,
        { encoding: "base64", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
      ])
      const serialized = Array.isArray(tx?.transaction) ? tx.transaction[0] : tx?.transaction
      if (typeof serialized === "string" && serialized.length > 80) return serialized
    }
    return null
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

function percentage(value: number | null) {
  return value === null ? null : Math.round(value * 10_000) / 100
}

async function main() {
  process.env.SOLANA_RPC_URL = process.env.SOLANA_RPC_URL?.trim() || PUBLIC_SOLANA_RPC
  process.env.EVM_RPC_URL = process.env.EVM_RPC_URL?.trim() || process.env.EVM_REPLAY_RPC_URL?.trim() || PUBLIC_EVM_RPC
  process.env.PHISHING_DATABASE_FEED_URL = process.env.PHISHING_DATABASE_FEED_URL?.trim() || "https://openphish.com/feed.txt"

  const records = parseCsv(await readFile(FIXTURE, "utf8"))
  if (records.length !== 150) throw new Error(`Expected 150 seen calibration records, found ${records.length}`)

  const scored: ScamGuardHoldoutCase[] = []
  const evidenceCases: CalibrationEvidenceCase[] = []
  const details: Array<Record<string, unknown>> = []
  const unresolvedTransactions: string[] = []
  let transactionCases = 0
  let transactionCasesWithSourceContext = 0

  for (const record of records) {
    let resolvedTransaction: string | null = null
    if (record.surface === "transaction") {
      transactionCases += 1
      if (record.sourceUrl?.trim()) transactionCasesWithSourceContext += 1
      resolvedTransaction = await resolveTransaction(record.chain, record.target)
      if (!resolvedTransaction) {
        unresolvedTransactions.push(record.id)
        details.push({ id: record.id, status: "unresolved_transaction", surface: record.surface, chain: record.chain })
        continue
      }
    }

    try {
      // Holdout mode is intentionally reused here only to exclude internal
      // adjudication and graph history. The dataset itself is SEEN and this
      // report is calibration-only; it is never final validation evidence.
      const observation = await observeCalibratedScamGuardV2(normalizeInput(record, resolvedTransaction), { evaluationMode: "holdout" })
      const v1RiskLevel = observation.base.riskLevel
      const additiveV2RiskLevel = observation.proposedAssessment.proposedRiskLevel
      const effectiveV2RiskLevel = maxRisk(v1RiskLevel, additiveV2RiskLevel)
      const groundTruth = record.groundTruth as "benign" | "malicious"

      scored.push({ id: record.id, groundTruth, v1RiskLevel, v2RiskLevel: effectiveV2RiskLevel })
      evidenceCases.push({
        groundTruth,
        surface: record.surface as CalibrationEvidenceCase["surface"],
        evidenceScore: observation.proposedAssessment.evidenceScore,
        independentFamilies: observation.proposedAssessment.independentFamilies,
        independentSources: observation.proposedAssessment.independentSources,
      })
      details.push({
        id: record.id,
        projectId: record.projectId,
        surface: record.surface,
        chain: record.chain,
        groundTruth,
        v1RiskLevel,
        additiveV2RiskLevel,
        effectiveV2RiskLevel,
        evidenceScore: observation.proposedAssessment.evidenceScore,
        activationGate: observation.proposedAssessment.activationGate,
        independentFamilies: observation.proposedAssessment.independentFamilies,
        independentSources: observation.proposedAssessment.independentSources,
        sourceContextPresent: Boolean(record.sourceUrl?.trim()),
      })
    } catch (error) {
      details.push({ id: record.id, status: "scan_error", error: error instanceof Error ? error.message : String(error) })
    }
  }

  const comparison = evaluateScamGuardHoldout(scored)
  const evidenceCoverage = summarizeCalibrationEvidenceCoverage(evidenceCases)
  const providerParity = {
    tokensXyzConfigured: Boolean(process.env.TOKENS_XYZ_API_KEY?.trim()),
    phishingFeedConfigured: Boolean(process.env.PHISHING_DATABASE_FEED_URL?.trim()),
    solanaRpcConfigured: Boolean(process.env.SOLANA_RPC_URL?.trim()),
    evmRpcConfigured: Boolean(process.env.EVM_RPC_URL?.trim()),
  }

  const report = {
    schemaVersion: 1,
    evaluationMode: "calibration_replay",
    seenDataset: true,
    originalDatasetRole: "former_holdout_now_seen_calibration_data",
    activationEligible: false,
    finalValidationEligible: false,
    productionDecisionChanged: false,
    effectiveV2Policy: "max(v1, additive-v2); automatic downgrade prohibited",
    totalFixtureCases: records.length,
    scoredCases: scored.length,
    unresolvedTransactions,
    sourceContextCoverage: {
      transactionCases,
      transactionCasesWithSourceContext,
      coverage: transactionCases ? transactionCasesWithSourceContext / transactionCases : 0,
      note: "Historical fixture predates sourceUrl capture. Missing origin context is measured, never fabricated.",
    },
    providerParity,
    metrics: comparison,
    evidenceCoverage,
    headline: {
      v1RecallPercent: percentage(comparison.v1.recall),
      v2RecallPercent: percentage(comparison.v2.recall),
      v1FalseNegativeRatePercent: percentage(comparison.v1.falseNegativeRate),
      v2FalseNegativeRatePercent: percentage(comparison.v2.falseNegativeRate),
      v1FalsePositiveRatePercent: percentage(comparison.v1.falsePositiveRate),
      v2FalsePositiveRatePercent: percentage(comparison.v2.falsePositiveRate),
      maliciousEvidenceCoveragePercent: percentage(evidenceCoverage.maliciousEvidenceCoverage),
      sourceDiverseMaliciousCoveragePercent: percentage(evidenceCoverage.sourceDiverseMaliciousCoverage),
    },
    details,
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    evaluationMode: report.evaluationMode,
    seenDataset: report.seenDataset,
    finalValidationEligible: report.finalValidationEligible,
    totalFixtureCases: report.totalFixtureCases,
    scoredCases: report.scoredCases,
    unresolvedTransactions: report.unresolvedTransactions.length,
    sourceContextCoverage: report.sourceContextCoverage,
    headline: report.headline,
  }, null, 2))

  if (unresolvedTransactions.length) process.exitCode = 3
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
