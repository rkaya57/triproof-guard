import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import type { ScamGuardChain, ScamGuardRiskLevel, ScamGuardScanType } from "@/lib/scamguard/engine"
import { applyVerifiedDomainFalsePositiveGuard } from "@/lib/scamguard/verified-domain-guard"
import { parseCsvObjects } from "@/lib/scamguard/v2/csv"
import { observeCalibratedScamGuardV2 } from "@/lib/scamguard/v2/calibrated-evidence-fusion"
import { evaluateScamGuardHoldout, type ScamGuardHoldoutCase } from "@/lib/scamguard/v2/holdout-evaluation"

const FIXTURE = path.join(process.cwd(), "lib/scamguard/v2/fixtures/second-holdout-candidates.csv")
const OUT_DIR = path.join(process.cwd(), "artifacts/scamguard-v2-second-holdout-validation")
const PUBLIC_SOLANA_RPC = "https://api.mainnet-beta.solana.com"
const PUBLIC_EVM_RPC = "https://ethereum-rpc.publicnode.com"
const riskRank: Record<ScamGuardRiskLevel, number> = { SAFE: 0, CAUTION: 1, HIGH_RISK: 2, CRITICAL: 3 }

function maxRisk(left: ScamGuardRiskLevel, right: ScamGuardRiskLevel): ScamGuardRiskLevel {
  return riskRank[left] >= riskRank[right] ? left : right
}

function percent(value: number | null) {
  return value === null ? null : Math.round(value * 10_000) / 100
}

function summarize(cases: ScamGuardHoldoutCase[]) {
  if (!cases.length) return null
  const comparison = evaluateScamGuardHoldout(cases)
  return {
    ...comparison,
    headline: {
      v1PrecisionPercent: percent(comparison.v1.precision),
      v2PrecisionPercent: percent(comparison.v2.precision),
      v1RecallPercent: percent(comparison.v1.recall),
      v2RecallPercent: percent(comparison.v2.recall),
      v1FalsePositiveRatePercent: percent(comparison.v1.falsePositiveRate),
      v2FalsePositiveRatePercent: percent(comparison.v2.falsePositiveRate),
      v1FalseNegativeRatePercent: percent(comparison.v1.falseNegativeRate),
      v2FalseNegativeRatePercent: percent(comparison.v2.falseNegativeRate),
      v1AccuracyPercent: percent(comparison.v1.accuracy),
      v2AccuracyPercent: percent(comparison.v2.accuracy),
    },
  }
}

async function main() {
  process.env.SOLANA_RPC_URL = process.env.SOLANA_RPC_URL?.trim() || PUBLIC_SOLANA_RPC
  process.env.EVM_RPC_URL = process.env.EVM_RPC_URL?.trim() || PUBLIC_EVM_RPC
  process.env.PHISHING_DATABASE_FEED_URL = process.env.PHISHING_DATABASE_FEED_URL?.trim() || "https://openphish.com/feed.txt"
  process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED = process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED ?? "true"
  process.env.METAMASK_PHISHING_CONFIG_ENABLED = process.env.METAMASK_PHISHING_CONFIG_ENABLED ?? "true"

  const fixtureText = await readFile(FIXTURE, "utf8")
  const fixtureSha256 = createHash("sha256").update(fixtureText).digest("hex")
  const rows = parseCsvObjects(fixtureText)
  if (rows.length !== 200) throw new Error(`Expected exactly 200 second-Holdout candidates, found ${rows.length}`)

  const all: ScamGuardHoldoutCase[] = []
  const controlled: ScamGuardHoldoutCase[] = []
  const fieldLike: ScamGuardHoldoutCase[] = []
  const details: Array<Record<string, unknown>> = []
  const errors: Array<{ id: string; error: string }> = []

  for (const row of rows) {
    try {
      const input = {
        type: row.surface as ScamGuardScanType,
        value: row.target,
        chain: row.chain as ScamGuardChain,
        sourceUrl: row.sourceUrl || undefined,
        deepScan: false,
      }
      const observation = await observeCalibratedScamGuardV2(input, { evaluationMode: "holdout" })
      const productionBase = input.type === "url"
        ? applyVerifiedDomainFalsePositiveGuard(input.value, observation.base)
        : observation.base
      const effectiveV2RiskLevel = maxRisk(productionBase.riskLevel, observation.proposedAssessment.proposedRiskLevel)
      const scored: ScamGuardHoldoutCase = {
        id: row.id,
        groundTruth: row.groundTruth as "benign" | "malicious",
        v1RiskLevel: productionBase.riskLevel,
        v2RiskLevel: effectiveV2RiskLevel,
      }
      all.push(scored)
      const isControlled = row.provenanceId.includes("-controlled-")
      ;(isControlled ? controlled : fieldLike).push(scored)
      details.push({
        id: row.id,
        projectId: row.projectId,
        surface: row.surface,
        chain: row.chain,
        groundTruth: row.groundTruth,
        stratum: isControlled ? "controlled_robustness" : "registry_or_first_party",
        v1RiskLevel: productionBase.riskLevel,
        proposedV2RiskLevel: observation.proposedAssessment.proposedRiskLevel,
        effectiveV2RiskLevel,
        evidenceScore: observation.proposedAssessment.evidenceScore,
        activationGate: observation.proposedAssessment.activationGate,
        independentSources: observation.proposedAssessment.independentSources,
        proposedSignalCodes: observation.proposedSignals.map((signal) => signal.code),
      })
    } catch (error) {
      errors.push({ id: row.id, error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300) })
    }
  }

  const report = {
    schemaVersion: 2,
    evaluationRole: "second_holdout_candidate_validation",
    fixtureSha256,
    activationEligible: false,
    finalBlindValidationEligible: false,
    reason: "This 200-case candidate set was assembled during calibration and includes a controlled adversarial robustness stratum. It cannot independently activate V2. A fresh real-world blind set is still required for activation.",
    totalFixtureCases: rows.length,
    scoredCases: all.length,
    errors,
    composition: {
      controlledRobustnessCases: controlled.length,
      registryOrFirstPartyCases: fieldLike.length,
    },
    overall: summarize(all),
    controlledRobustness: summarize(controlled),
    registryOrFirstParty: summarize(fieldLike),
    details,
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    evaluationRole: report.evaluationRole,
    fixtureSha256: report.fixtureSha256,
    activationEligible: report.activationEligible,
    totalFixtureCases: report.totalFixtureCases,
    scoredCases: report.scoredCases,
    errors: report.errors.length,
    composition: report.composition,
    overall: report.overall?.headline,
    controlledRobustness: report.controlledRobustness?.headline,
    registryOrFirstParty: report.registryOrFirstParty?.headline,
  }, null, 2))

  if (errors.length > 10) process.exitCode = 2
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
