import type { ScamGuardSignal } from "@/lib/scamguard/engine"
import type { V2TransactionImpact } from "@/lib/scamguard/v2/transaction-impact"

export function transactionImpactSignals(impact: V2TransactionImpact): ScamGuardSignal[] {
  if (impact.status !== "available") return []

  const capabilities = new Set(impact.capabilities)
  const signals: ScamGuardSignal[] = []

  if (capabilities.has("unlimited_approval")) {
    signals.push({
      code: "V2_TX_UNLIMITED_APPROVAL",
      severity: "medium",
      title: "Unlimited asset approval capability",
      detail: "The decoded signing request can grant unlimited token spending rights. Tri-Proof treats this as high-impact transaction evidence that requires independent corroboration before escalation.",
    })
  }

  if (capabilities.has("authority_control")) {
    signals.push({
      code: "V2_TX_AUTHORITY_CONTROL",
      severity: "medium",
      title: "Authority-control change",
      detail: "The decoded signing request can change an authority or control surface. This is high-impact capability evidence, not standalone proof of maliciousness.",
    })
  }

  if (capabilities.has("delegate_rights")) {
    signals.push({
      code: "V2_TX_DELEGATE_RIGHTS",
      severity: "medium",
      title: "Delegated asset rights",
      detail: "The decoded signing request can grant another address spending or delegate rights over assets. Independent context is required before risk escalation.",
    })
  }

  if (capabilities.has("typed_authorization")) {
    signals.push({
      code: "V2_TX_TYPED_AUTHORIZATION",
      severity: "medium",
      title: "High-impact typed authorization",
      detail: "The signing request contains a decoded high-impact typed authorization. This signal remains bounded until corroborated by independent evidence.",
    })
  }

  if (capabilities.has("account_closure")) {
    signals.push({
      code: "V2_TX_ACCOUNT_CLOSURE",
      severity: "low",
      title: "Account closure capability",
      detail: "The decoded transaction can close an account. This may be legitimate maintenance and therefore requires corroboration before escalation.",
    })
  }

  // Ordinary asset transfer/outflow and simulation failure are intentionally not converted
  // into maliciousness signals. Their presence remains visible in the transaction-impact model.
  return signals
}
