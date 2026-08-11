import type { ScamGuardScanResult } from "@/lib/scamguard/engine"
import { decodeV11EvmTransaction } from "@/lib/scamguard/v1_1-evm-hardening"

const riskRank = {
  SAFE: 0,
  CAUTION: 1,
  HIGH_RISK: 2,
  CRITICAL: 3,
} as const

function maxRisk(current: ScamGuardScanResult["riskLevel"], minimum: ScamGuardScanResult["riskLevel"]) {
  return riskRank[current] >= riskRank[minimum] ? current : minimum
}

export function applyScamGuardV11TransactionHardening(
  result: ScamGuardScanResult,
  rawTransactionValue: string,
): ScamGuardScanResult {
  if (result.type !== "transaction") return result

  const decoded = decodeV11EvmTransaction(rawTransactionValue)
  if (!decoded || decoded.category === "unknown") return result

  const signals = [...result.signals]
  const warnings = [...(result.metadata.decodedIntent?.warnings ?? [])]
  let score = result.score
  let riskLevel = result.riskLevel

  if (decoded.highImpactAuthorityChange) {
    signals.push({
      code: "V11_AUTHORITY_CHANGE",
      severity: "medium",
      title: "Contract authority change",
      detail: `${decoded.method} can change contract implementation or administrative authority. Verify the target and initiating dApp before signing.`,
    })
    warnings.push("V1.1 decoded a contract authority change that should be explicitly reviewed before signing.")
    score = Math.max(score, 45)
    riskLevel = maxRisk(riskLevel, "CAUTION")
  }

  if (decoded.unlimitedApproval) {
    signals.push({
      code: "V11_UNLIMITED_APPROVAL",
      severity: "medium",
      title: "Unlimited token approval",
      detail: "This transaction can grant effectively unlimited token spending authority to the decoded spender.",
    })
    warnings.push("V1.1 detected an unlimited token approval.")
    score = Math.max(score, 45)
    riskLevel = maxRisk(riskLevel, "CAUTION")
  }

  const existing = result.metadata.decodedIntent
  const category = decoded.category === "authority"
    ? "authority"
    : decoded.category === "approval"
      ? "approval"
      : decoded.category === "transfer"
        ? "transfer"
        : (existing?.category ?? "unknown")

  return {
    ...result,
    score,
    riskLevel,
    summary: riskLevel === result.riskLevel
      ? result.summary
      : "ScamGuard V1.1 found a transaction permission or authority change that requires review.",
    explanation: riskLevel === result.riskLevel
      ? result.explanation
      : `${result.explanation} ScamGuard V1.1 additionally decoded ${decoded.method} and raised the transaction to review level without overriding stronger existing protections.`,
    signals,
    metadata: {
      ...result.metadata,
      decodedIntent: {
        ...existing,
        method: decoded.method,
        category,
        spender: decoded.spender ?? existing?.spender,
        recipient: decoded.recipient ?? existing?.recipient,
        contractTarget: decoded.contractTarget ?? existing?.contractTarget,
        warnings: Array.from(new Set(warnings)),
      },
    },
  }
}
