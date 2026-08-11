import type { ScamGuardScanResult } from "@/lib/scamguard/engine"
import { decodeV11EvmIntent, v11CounterpartyCandidates } from "@/lib/scamguard/v1-1-evm-hardening"
import { checkV11ExactThreatIntel } from "@/lib/scamguard/v1-1-threat-intel"

const riskRank = {
  SAFE: 0,
  CAUTION: 1,
  HIGH_RISK: 2,
  CRITICAL: 3,
} as const

function maxRisk(current: ScamGuardScanResult["riskLevel"], minimum: ScamGuardScanResult["riskLevel"]) {
  return riskRank[current] >= riskRank[minimum] ? current : minimum
}

export async function applyScamGuardV11TransactionHardening(
  result: ScamGuardScanResult,
  rawTransactionValue: string,
  sourceUrl?: string,
): Promise<ScamGuardScanResult> {
  if (result.type !== "transaction") return result

  let parsedTo: string | undefined
  try {
    const parsed = JSON.parse(rawTransactionValue) as { to?: unknown; params?: Array<{ to?: unknown }> }
    const candidate = typeof parsed.to === "string"
      ? parsed.to
      : typeof parsed.params?.[0]?.to === "string"
        ? parsed.params[0].to
        : undefined
    parsedTo = candidate
  } catch {
    parsedTo = undefined
  }

  const decoded = decodeV11EvmIntent(rawTransactionValue, parsedTo)
  const counterparties = v11CounterpartyCandidates(decoded)
  const threatIntel = await checkV11ExactThreatIntel({ sourceUrl, counterparties })

  if (decoded.category === "unknown" && !threatIntel.domain && threatIntel.evmAddresses.length === 0) return result

  const signals = [...result.signals]
  const warnings = [...(result.metadata.decodedIntent?.warnings ?? [])]
  let score = result.score
  let riskLevel = result.riskLevel

  const highImpactAuthorityChange = decoded.category === "authority" && decoded.highImpact
  const unlimitedApproval = decoded.reasonCodes.includes("UNLIMITED_APPROVAL") || decoded.reasonCodes.includes("OPERATOR_APPROVAL_ENABLED")

  if (highImpactAuthorityChange) {
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

  if (unlimitedApproval) {
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

  if (threatIntel.domain) {
    signals.push({
      code: "V11_EXACT_PHISHING_DOMAIN",
      severity: "high",
      title: "Known phishing source",
      detail: `${threatIntel.domain} exactly matches an external phishing feed entry.`,
    })
    warnings.push("V1.1 matched the transaction source URL to an exact external phishing-feed entry.")
    score = Math.max(score, 68)
    riskLevel = maxRisk(riskLevel, "HIGH_RISK")
  }

  if (threatIntel.evmAddresses.length > 0) {
    signals.push({
      code: "V11_EXACT_BAD_COUNTERPARTY",
      severity: "high",
      title: "Known malicious transaction counterparty",
      detail: `${threatIntel.evmAddresses.join(", ")} exactly matched an external EVM threat-feed entry.`,
    })
    warnings.push("V1.1 matched a decoded transaction counterparty to an exact external threat-feed entry.")
    score = Math.max(score, 72)
    riskLevel = maxRisk(riskLevel, "HIGH_RISK")
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
      : riskLevel === "HIGH_RISK"
        ? "ScamGuard V1.1 matched a known phishing source or malicious transaction counterparty."
        : "ScamGuard V1.1 found a transaction permission or authority change that requires review.",
    explanation: riskLevel === result.riskLevel
      ? result.explanation
      : `${result.explanation} ScamGuard V1.1 added exact threat-intelligence and decoded-intent checks without overriding stronger existing protections.`,
    signals,
    metadata: {
      ...result.metadata,
      decodedIntent: {
        ...existing,
        method: decoded.method ?? existing?.method,
        category,
        spender: decoded.spender ?? existing?.spender,
        recipient: decoded.recipient ?? existing?.recipient,
        contractTarget: decoded.contractTarget ?? existing?.contractTarget,
        warnings: Array.from(new Set(warnings)),
      },
    },
  }
}
