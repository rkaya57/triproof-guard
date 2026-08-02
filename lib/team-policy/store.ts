import { TeamPolicyAction } from "@prisma/client"

import { db } from "@/lib/db/prisma"
import { evaluateTeamPolicies, type TeamPolicyWithRules } from "@/lib/team-policy/engine"
import type { ScamGuardScanResult } from "@/lib/scamguard/engine"

export async function listTeamPolicies(userId: string) {
  return db.teamSecurityPolicy.findMany({
    where: { userId },
    include: { rules: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
  })
}

export async function enforceTeamPolicies({ userId, result, target, source }: { userId: string; result: ScamGuardScanResult; target: string; source: string }) {
  const policies = await listTeamPolicies(userId) as TeamPolicyWithRules[]
  const decision = evaluateTeamPolicies(policies, result)
  if (decision.action !== TeamPolicyAction.ALLOW) {
    await db.teamPolicyViolation.createMany({
      data: decision.matched.map((match) => ({
        userId,
        policyId: match.policyId,
        ruleId: match.ruleId,
        target: target.slice(0, 4096),
        source: source.slice(0, 80),
        chain: result.metadata.chain,
        action: match.action,
        reason: match.reason.slice(0, 1200),
      })),
    })
  }
  return decision
}

export async function enforceTelegramGroupPolicies(chatId: number, result: ScamGuardScanResult, target: string) {
  const group = await db.telegramGuardianGroup.findUnique({ where: { telegramChatId: String(chatId) }, select: { ownerId: true } })
  if (!group?.ownerId) return { action: TeamPolicyAction.ALLOW, matched: [] }
  return enforceTeamPolicies({ userId: group.ownerId, result, target, source: "telegram_guardian" })
}
