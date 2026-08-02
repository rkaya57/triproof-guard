import { TeamPolicyAction } from "@prisma/client"

import { db } from "@/lib/db/prisma"
import { evaluateTeamPolicies, type TeamPolicyWithRules } from "@/lib/team-policy/engine"
import type { ScamGuardScanResult } from "@/lib/scamguard/engine"
import { deliverTeamPolicyWebhook } from "@/lib/webhooks/policy"

export async function listTeamPolicies(userId: string) {
  return db.teamSecurityPolicy.findMany({
    where: { userId },
    include: { rules: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
  })
}

type StoredPolicyDecision = {
  action: TeamPolicyAction
  matched: Array<{ policyId: string; policyName: string; ruleId: string; ruleType: string; action: TeamPolicyAction; reason: string }>
}

function safeTarget(value: string) {
  try {
    const url = new URL(value)
    url.search = ""
    url.hash = ""
    return url.toString().slice(0, 4096)
  } catch {
    return value.slice(0, 4096)
  }
}

export async function recordTeamPolicyDecision({
  userId,
  decision,
  target,
  source,
  chain,
}: {
  userId: string
  decision: StoredPolicyDecision
  target: string
  source: string
  chain?: string | null
}) {
  if (decision.action === TeamPolicyAction.ALLOW || !decision.matched.length) return decision
  const normalizedTarget = safeTarget(target)
  const matches = decision.matched.slice(0, 12)
  await db.teamPolicyViolation.createMany({
    data: matches.map((match) => ({
      userId,
      policyId: match.policyId,
      ruleId: match.ruleId,
      target: normalizedTarget,
      source: source.slice(0, 80),
      chain: chain ?? null,
      action: match.action,
      reason: match.reason.slice(0, 1200),
    })),
  })

  try {
    await deliverTeamPolicyWebhook({
      userId,
      action: decision.action,
      target: normalizedTarget,
      source: source.slice(0, 80),
      chain: chain ?? null,
      matches,
    })
  } catch (error) {
    console.error("Team policy webhook delivery failed", error)
  }
  return decision
}

export async function enforceTeamPolicies({ userId, result, target, source }: { userId: string; result: ScamGuardScanResult; target: string; source: string }) {
  const policies = await listTeamPolicies(userId) as TeamPolicyWithRules[]
  const decision = evaluateTeamPolicies(policies, result)
  return recordTeamPolicyDecision({ userId, decision, target, source, chain: result.metadata.chain })
}

export async function enforceTelegramGroupPolicies(chatId: number, result: ScamGuardScanResult, target: string) {
  const group = await db.telegramGuardianGroup.findUnique({ where: { telegramChatId: String(chatId) }, select: { ownerId: true } })
  if (!group?.ownerId) return { action: TeamPolicyAction.ALLOW, matched: [] }
  return enforceTeamPolicies({ userId: group.ownerId, result, target, source: "telegram_guardian" })
}
