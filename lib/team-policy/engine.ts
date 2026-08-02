import { TeamPolicyAction, TeamPolicyRuleType, type Prisma } from "@prisma/client"
import { z } from "zod"

import type { ScamGuardScanResult } from "@/lib/scamguard/engine"

export const teamPolicyRuleSchema = z.object({
  type: z.nativeEnum(TeamPolicyRuleType),
  value: z.string().trim().max(280).optional().nullable(),
  action: z.nativeEnum(TeamPolicyAction).default(TeamPolicyAction.BLOCK),
})

export const teamPolicyCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  rules: z.array(teamPolicyRuleSchema).min(1).max(30),
})

export type TeamPolicyWithRules = Prisma.TeamSecurityPolicyGetPayload<{ include: { rules: true } }>

export type TeamPolicyDecision = {
  action: TeamPolicyAction
  matched: Array<{ policyId: string; policyName: string; ruleId: string; ruleType: TeamPolicyRuleType; action: TeamPolicyAction; reason: string }>
}

const actionRank: Record<TeamPolicyAction, number> = {
  [TeamPolicyAction.ALLOW]: 0,
  [TeamPolicyAction.REVIEW]: 1,
  [TeamPolicyAction.BLOCK]: 2,
}

function normalizeDomain(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")
}

function domainMatches(domain: string, ruleValue: string | null) {
  const expected = normalizeDomain(ruleValue)
  return Boolean(expected) && (domain === expected || domain.endsWith(`.${expected}`))
}

function normalizedAddress(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase()
}

function ruleMatch(rule: TeamPolicyWithRules["rules"][number], result: ScamGuardScanResult) {
  const metadata = result.metadata ?? {}
  const intent = metadata.decodedIntent
  const domain = normalizeDomain(metadata.domain)
  const codes = new Set(result.signals.map((signal) => signal.code))

  if (rule.type === TeamPolicyRuleType.DOMAIN_ALLOWLIST) {
    if (!domain) return null
    return domainMatches(domain, rule.value) ? null : `Destination ${domain} is outside the team allowlist entry ${normalizeDomain(rule.value)}.`
  }
  if (rule.type === TeamPolicyRuleType.DOMAIN_BLOCK) {
    return domainMatches(domain, rule.value) ? `Destination ${domain} matches the team blocklist.` : null
  }
  if (rule.type === TeamPolicyRuleType.EVM_SPENDER_BLOCK) {
    const spender = normalizedAddress(intent?.spender)
    return spender && spender === normalizedAddress(rule.value) ? `EVM spender ${spender} is blocked by team policy.` : null
  }
  if (rule.type === TeamPolicyRuleType.UNLIMITED_APPROVAL_BLOCK) {
    return codes.has("UNLIMITED_EVM_APPROVAL") ? "An unlimited token approval violates team policy." : null
  }
  if (rule.type === TeamPolicyRuleType.SOLANA_AUTHORITY_CHANGE_BLOCK) {
    return codes.has("AUTHORITY_CHANGE") ? "A Solana authority change violates team policy." : null
  }
  return null
}

export function evaluateTeamPolicies(policies: TeamPolicyWithRules[], result: ScamGuardScanResult): TeamPolicyDecision {
  const matched: TeamPolicyDecision["matched"] = []
  for (const policy of policies) {
    if (!policy.active) continue
    for (const rule of policy.rules) {
      if (!rule.active) continue
      const reason = ruleMatch(rule, result)
      if (reason) matched.push({ policyId: policy.id, policyName: policy.name, ruleId: rule.id, ruleType: rule.type, action: rule.action, reason })
    }
  }
  const action = matched.reduce<TeamPolicyAction>((current, item) => actionRank[item.action] > actionRank[current] ? item.action : current, TeamPolicyAction.ALLOW)
  return { action, matched }
}
