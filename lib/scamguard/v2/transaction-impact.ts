import type { ScamGuardScanResult } from "@/lib/scamguard/engine"

export type V2TransactionAction =
  | "transfer"
  | "approval"
  | "authority_change"
  | "account_close"
  | "mint"
  | "signature"
  | "unknown"

export type V2TransactionImpact = {
  mode: "observe_only"
  status: "available" | "not_applicable"
  chain: ScamGuardScanResult["metadata"]["chain"]
  action: V2TransactionAction
  confidence: "decoded" | "partial" | "unavailable"
  simulation: "not_attempted" | "succeeded" | "failed"
  highImpact: boolean
  highImpactReasons: string[]
  capabilities: Array<"delegate_rights" | "authority_control" | "account_closure" | "unlimited_approval" | "typed_authorization" | "asset_outflow">
  outgoingCount: number
  approvalCount: number
  hasRecipient: boolean
  hasSpender: boolean
  hasAmount: boolean
  instructionCount?: number
  programCount?: number
  containsRawPayload: false
  productionDecisionChanged: false
  note: string
}

const highImpactSignalReasons: Record<string, { reason: string; capability?: V2TransactionImpact["capabilities"][number] }> = {
  AUTHORITY_CHANGE: {
    reason: "The decoded transaction includes an authority-control change.",
    capability: "authority_control",
  },
  DELEGATE_APPROVAL: {
    reason: "The decoded transaction can grant delegate rights over assets.",
    capability: "delegate_rights",
  },
  EVM_APPROVAL: {
    reason: "The decoded transaction grants token approval rights.",
    capability: "delegate_rights",
  },
  UNLIMITED_EVM_APPROVAL: {
    reason: "The decoded transaction contains an unlimited or all-assets approval.",
    capability: "unlimited_approval",
  },
  CLOSE_ACCOUNT: {
    reason: "The decoded transaction can close an account.",
    capability: "account_closure",
  },
  SWEEP_LANGUAGE: {
    reason: "The transaction context indicates sweep or transfer-all behavior.",
    capability: "asset_outflow",
  },
  HIGH_IMPACT_TYPED_DATA: {
    reason: "The signing request can authorize a high-impact action through typed data.",
    capability: "typed_authorization",
  },
}

function actionFrom(result: ScamGuardScanResult): V2TransactionAction {
  const category = result.metadata.decodedIntent?.category
  if (category === "transfer") return "transfer"
  if (category === "approval") return "approval"
  if (category === "authority") return "authority_change"
  if (category === "account_close") return "account_close"
  if (category === "mint") return "mint"
  if (category === "signature") return "signature"
  return "unknown"
}

function simulationState(result: ScamGuardScanResult): V2TransactionImpact["simulation"] {
  const simulation = result.metadata.simulation
  if (!simulation?.attempted) return "not_attempted"
  return simulation.ok ? "succeeded" : "failed"
}

export function buildV2TransactionImpact(result: ScamGuardScanResult): V2TransactionImpact {
  if (result.type !== "transaction") {
    return {
      mode: "observe_only",
      status: "not_applicable",
      chain: result.metadata.chain,
      action: "unknown",
      confidence: "unavailable",
      simulation: "not_attempted",
      highImpact: false,
      highImpactReasons: [],
      capabilities: [],
      outgoingCount: 0,
      approvalCount: 0,
      hasRecipient: false,
      hasSpender: false,
      hasAmount: false,
      containsRawPayload: false,
      productionDecisionChanged: false,
      note: "Transaction-impact normalization only applies to transaction scans.",
    }
  }

  const decoded = result.metadata.decodedIntent
  const assetImpact = result.metadata.assetImpact
  const reasons: string[] = []
  const capabilities = new Set<V2TransactionImpact["capabilities"][number]>()

  for (const signal of result.signals) {
    const mapped = highImpactSignalReasons[signal.code]
    if (!mapped) continue
    reasons.push(mapped.reason)
    if (mapped.capability) capabilities.add(mapped.capability)
  }

  if (decoded?.category === "authority") capabilities.add("authority_control")
  if (decoded?.category === "approval") capabilities.add("delegate_rights")
  if (decoded?.category === "account_close") capabilities.add("account_closure")
  if (decoded?.typedData?.highImpact) capabilities.add("typed_authorization")
  if ((assetImpact?.outgoing.length ?? 0) > 0 || decoded?.category === "transfer") capabilities.add("asset_outflow")
  if (assetImpact?.approvals.some((approval) => approval.unlimited)) capabilities.add("unlimited_approval")

  const action = actionFrom(result)
  const decodedAvailable = Boolean(decoded && (decoded.category !== "unknown" || decoded.method || decoded.instructionCount || decoded.typedData || decoded.batch))
  const impactAvailable = Boolean(assetImpact && (assetImpact.outgoing.length || assetImpact.approvals.length))
  const confidence: V2TransactionImpact["confidence"] = decodedAvailable
    ? "decoded"
    : impactAvailable || result.metadata.simulation?.attempted
      ? "partial"
      : "unavailable"

  const outgoingCount = assetImpact?.outgoing.length ?? (action === "transfer" ? 1 : 0)
  const approvalCount = assetImpact?.approvals.length ?? (action === "approval" ? 1 : 0)
  const highImpact = reasons.length > 0 || ["authority_change", "approval", "account_close"].includes(action) || Boolean(decoded?.typedData?.highImpact)

  return {
    mode: "observe_only",
    status: "available",
    chain: result.metadata.chain,
    action,
    confidence,
    simulation: simulationState(result),
    highImpact,
    highImpactReasons: Array.from(new Set(reasons)).slice(0, 8),
    capabilities: Array.from(capabilities),
    outgoingCount,
    approvalCount,
    hasRecipient: Boolean(decoded?.recipient || assetImpact?.outgoing.some((item) => item.recipient)),
    hasSpender: Boolean(decoded?.spender || assetImpact?.approvals.some((item) => item.spender)),
    hasAmount: Boolean(decoded?.amount || assetImpact?.outgoing.some((item) => item.amount) || assetImpact?.approvals.some((item) => item.amount)),
    instructionCount: decoded?.instructionCount,
    programCount: decoded?.programs?.length,
    containsRawPayload: false,
    productionDecisionChanged: false,
    note: "This V2 model normalizes already-decoded V1 transaction evidence. It does not independently re-parse or retain the raw signing payload.",
  }
}
