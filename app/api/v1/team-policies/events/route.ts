import { NextResponse } from "next/server"
import { TeamPolicyAction } from "@prisma/client"
import { z } from "zod"

import { getV1ApiUser } from "@/lib/api/v1-auth"
import { db } from "@/lib/db/prisma"
import { recordTeamPolicyDecision } from "@/lib/team-policy/store"

export const runtime = "nodejs"

const eventSchema = z.object({
  target: z.string().trim().min(1).max(4096),
  chain: z.string().trim().max(40).optional().nullable(),
  action: z.nativeEnum(TeamPolicyAction).refine((value) => value !== TeamPolicyAction.ALLOW),
  matches: z.array(z.object({ policyId: z.string().min(1), ruleId: z.string().min(1), reason: z.string().trim().min(1).max(1200) })).min(1).max(12),
})

export async function POST(request: Request) {
  const auth = await getV1ApiUser(request)
  if (auth.error) return auth.error
  const parsed = eventSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid team policy event." }, { status: 400 })

  const policyIds = [...new Set(parsed.data.matches.map((match) => match.policyId))]
  const policies = await db.teamSecurityPolicy.findMany({
    where: { userId: auth.user.id, active: true, id: { in: policyIds } },
    include: { rules: { where: { active: true } } },
  })
  const knownMatches = parsed.data.matches.flatMap((match) => {
    const policy = policies.find((item) => item.id === match.policyId)
    const rule = policy?.rules.find((item) => item.id === match.ruleId)
    if (!policy || !rule) return []
    return [{ policyId: policy.id, policyName: policy.name, ruleId: rule.id, ruleType: rule.type, action: rule.action, reason: match.reason }]
  })
  if (!knownMatches.length) return NextResponse.json({ error: "No active team policy rule matched this event." }, { status: 400 })

  const action = knownMatches.some((match) => match.action === TeamPolicyAction.BLOCK) ? TeamPolicyAction.BLOCK : TeamPolicyAction.REVIEW
  await recordTeamPolicyDecision({ userId: auth.user.id, decision: { action, matched: knownMatches }, target: parsed.data.target, source: "chrome_extension", chain: parsed.data.chain })
  return NextResponse.json({ ok: true, action })
}
