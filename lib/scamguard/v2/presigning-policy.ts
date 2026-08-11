import type { ScamGuardRiskLevel } from "@/lib/scamguard/engine"

const riskRank: Record<ScamGuardRiskLevel, number> = { SAFE: 0, CAUTION: 1, HIGH_RISK: 2, CRITICAL: 3 }

const HIGH_IMPACT_ADMIN_SELECTORS = new Map([
  ["0x3659cfe6", "upgradeTo(address)"],
  ["0x4f1ef286", "upgradeToAndCall(address,bytes)"],
])

const OFFICIAL_USDC_ETHEREUM = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
const OFFICIAL_AAVE_V3_ETHEREUM_POOL = "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2"
const MAX_UINT256 = (1n << 256n) - 1n

type TransactionEnvelope = {
  to?: string | null
  data?: string
  input?: string
}

export type PresigningPolicyDecision = {
  riskLevel: ScamGuardRiskLevel
  mode: "unchanged" | "escalated" | "trusted_flow_attenuation"
  reasonCodes: string[]
  notes: string[]
}

function maxRisk(a: ScamGuardRiskLevel, b: ScamGuardRiskLevel): ScamGuardRiskLevel {
  return riskRank[a] >= riskRank[b] ? a : b
}

function normalizeAddress(value?: string | null) {
  const normalized = value?.trim().toLowerCase()
  return normalized && /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : undefined
}

function normalizeData(tx: TransactionEnvelope) {
  const value = (tx.data ?? tx.input ?? "0x").trim().toLowerCase()
  return /^0x[a-f0-9]*$/.test(value) ? value : "0x"
}

function decodeApprove(data: string) {
  if (!data.startsWith("0x095ea7b3") || data.length < 138) return null
  const spenderWord = data.slice(10, 74)
  const amountWord = data.slice(74, 138)
  const spender = normalizeAddress(`0x${spenderWord.slice(24)}`)
  if (!spender || !/^[a-f0-9]{64}$/.test(amountWord)) return null
  return { spender, amount: BigInt(`0x${amountWord}`) }
}

/**
 * Calibration-only pre-signing policy layer.
 *
 * It does two narrowly-scoped things that V1 cannot currently express:
 * 1) floors explicit proxy implementation-changing calls at HIGH_RISK because
 *    they alter contract execution authority and are atypical end-user actions;
 * 2) attenuates a limited ERC-20 approval only when the token contract and
 *    spender are both independently verified official Ethereum addresses for
 *    the USDC -> Aave V3 Pool supply flow.
 *
 * Unlimited approvals are never attenuated. This module is not wired into the
 * production V1 decision path during calibration.
 */
export function applyPresigningPolicy(input: {
  baseRisk: ScamGuardRiskLevel
  proposedRisk: ScamGuardRiskLevel
  transaction: TransactionEnvelope
}): PresigningPolicyDecision {
  const tx = input.transaction
  const data = normalizeData(tx)
  const selector = data.slice(0, 10)
  const baseline = maxRisk(input.baseRisk, input.proposedRisk)
  const adminMethod = HIGH_IMPACT_ADMIN_SELECTORS.get(selector)

  if (adminMethod) {
    return {
      riskLevel: maxRisk(baseline, "HIGH_RISK"),
      mode: riskRank[baseline] < riskRank.HIGH_RISK ? "escalated" : "unchanged",
      reasonCodes: ["V2_EXPLICIT_PROXY_ADMIN_CALL"],
      notes: [`${adminMethod} changes proxy implementation authority and is treated as a high-impact pre-signing action.`],
    }
  }

  const to = normalizeAddress(tx.to)
  const approval = decodeApprove(data)
  if (
    to === OFFICIAL_USDC_ETHEREUM &&
    approval?.spender === OFFICIAL_AAVE_V3_ETHEREUM_POOL &&
    approval.amount !== MAX_UINT256
  ) {
    return {
      riskLevel: "SAFE",
      mode: "trusted_flow_attenuation",
      reasonCodes: ["V2_VERIFIED_USDC_AAVE_LIMITED_APPROVAL"],
      notes: ["Limited USDC approval targets the independently verified official Aave V3 Ethereum Pool. Unlimited approvals are excluded from attenuation."],
    }
  }

  return {
    riskLevel: baseline,
    mode: "unchanged",
    reasonCodes: [],
    notes: [],
  }
}
