import { CAMPAIGN_LIFECYCLES, type CampaignLifecycle } from "@/lib/campaigns/model"
import { riskPolicies } from "@/lib/validators/wallet"
import type { RiskPolicy } from "@/types"

export const CAMPAIGN_OPERATIONS_SCHEMA_VERSION = "tri-proof-campaign-operations-v1" as const
export const MIN_POLICY_CHANGE_RATIONALE = 8
export const MAX_POLICY_CHANGE_RATIONALE = 2000

export type CampaignPolicyChangeInput = {
  preset: RiskPolicy
  rationale: string
}

export type CampaignOperationResult<T> =
  | { value: T; error: null; code: null }
  | { value: null; error: string; code: string }

const lifecycleTransitions: Record<CampaignLifecycle, readonly CampaignLifecycle[]> = {
  draft: ["active", "archived"],
  active: ["paused", "completed", "archived"],
  paused: ["active", "completed", "archived"],
  completed: ["archived"],
  archived: [],
}

function ok<T>(value: T): CampaignOperationResult<T> {
  return { value, error: null, code: null }
}

function fail<T>(error: string, code: string): CampaignOperationResult<T> {
  return { value: null, error, code }
}

export function normalizeCampaignPolicyChange(
  input: Record<string, unknown>,
  current: {
    preset: RiskPolicy
    lifecycle: CampaignLifecycle
  },
): CampaignOperationResult<CampaignPolicyChangeInput> {
  const preset = riskPolicies.includes(input.preset as RiskPolicy)
    ? (input.preset as RiskPolicy)
    : null
  if (!preset) {
    return fail("preset must be conservative, balanced, or strict", "INVALID_POLICY_PRESET")
  }

  if (current.lifecycle === "completed" || current.lifecycle === "archived") {
    return fail(
      `Campaign lifecycle ${current.lifecycle} does not accept a new policy version.`,
      "CAMPAIGN_CLOSED",
    )
  }

  if (preset === current.preset) {
    return fail(`Campaign policy is already ${preset}.`, "POLICY_NO_CHANGE")
  }

  const rationale = typeof input.rationale === "string" ? input.rationale.trim() : ""
  if (rationale.length < MIN_POLICY_CHANGE_RATIONALE || rationale.length > MAX_POLICY_CHANGE_RATIONALE) {
    return fail(
      `rationale must contain ${MIN_POLICY_CHANGE_RATIONALE}-${MAX_POLICY_CHANGE_RATIONALE} characters`,
      "INVALID_POLICY_RATIONALE",
    )
  }

  return ok({ preset, rationale })
}

export function normalizeCampaignLifecycleChange(
  input: Record<string, unknown>,
  current: CampaignLifecycle,
): CampaignOperationResult<{ lifecycle: CampaignLifecycle }> {
  const requested = CAMPAIGN_LIFECYCLES.includes(input.lifecycle as CampaignLifecycle)
    ? (input.lifecycle as CampaignLifecycle)
    : null
  if (!requested) {
    return fail(
      `lifecycle must be one of: ${CAMPAIGN_LIFECYCLES.join(", ")}`,
      "INVALID_LIFECYCLE",
    )
  }

  if (requested === current) {
    return fail(`Campaign lifecycle is already ${current}.`, "LIFECYCLE_NO_CHANGE")
  }

  if (!lifecycleTransitions[current].includes(requested)) {
    return fail(
      `Campaign lifecycle cannot transition from ${current} to ${requested}.`,
      "INVALID_LIFECYCLE_TRANSITION",
    )
  }

  return ok({ lifecycle: requested })
}

export function replaceRiskPolicyMarker(notes: string | null | undefined, preset: RiskPolicy) {
  const lines = (notes ?? "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => !/^TRIPROOF_RISK_POLICY=/i.test(line.trim()))
  lines.push(`TRIPROOF_RISK_POLICY=${preset}`)
  return lines.filter(Boolean).join("\n")
}

export function campaignOperationBoundaries() {
  return [
    "A policy activation creates a new CampaignPolicy version; it never rewrites an earlier policy row.",
    "Changing campaign policy affects future analysis runs only and never recomputes stored wallet decisions.",
    "A completed campaign can only be archived, and an archived campaign cannot be reopened by Campaign Operations v1.",
    "Policy changes require an analyst/operator rationale and preserve the prior policy reference in version metadata.",
    "Lifecycle and policy operations do not convert provider limitations or neutral infrastructure context into malicious risk.",
  ]
}
