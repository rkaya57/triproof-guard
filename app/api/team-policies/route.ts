import { NextResponse } from "next/server"
import { TeamPolicyAction, TeamPolicyRuleType } from "@prisma/client"
import { z } from "zod"

import { getCurrentUser } from "@/lib/auth/session"
import { getSubscriptionEntitlement } from "@/lib/billing/subscription"
import { db } from "@/lib/db/prisma"
import { teamPolicyCreateSchema } from "@/lib/team-policy/engine"
import { listTeamPolicies } from "@/lib/team-policy/store"

export const runtime = "nodejs"

async function policyUser() {
  const user = await getCurrentUser()
  if (!user) return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const entitlement = await getSubscriptionEntitlement(user)
  const allowed = entitlement.isAdmin || ["community", "api_starter", "api_growth"].includes(entitlement.plan.id)
  if (!allowed) return { user: null, error: NextResponse.json({ error: "Team Policy Engine requires Community, API Starter, or API Growth.", code: "PLAN_REQUIRED" }, { status: 403 }) }
  return { user, error: null }
}

export async function GET() {
  const auth = await policyUser()
  if (auth.error || !auth.user) return auth.error
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [policies, violations, total, recent, byAction, bySource] = await Promise.all([
    listTeamPolicies(auth.user.id),
    db.teamPolicyViolation.findMany({ where: { userId: auth.user.id }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, target: true, source: true, chain: true, action: true, reason: true, createdAt: true, policy: { select: { name: true } } } }),
    db.teamPolicyViolation.count({ where: { userId: auth.user.id } }),
    db.teamPolicyViolation.count({ where: { userId: auth.user.id, createdAt: { gte: since } } }),
    db.teamPolicyViolation.groupBy({ by: ["action"], where: { userId: auth.user.id }, _count: { _all: true } }),
    db.teamPolicyViolation.groupBy({ by: ["source"], where: { userId: auth.user.id }, _count: { _all: true }, orderBy: { _count: { source: "desc" } }, take: 5 }),
  ])
  return NextResponse.json({
    policies,
    violations,
    summary: {
      total,
      last24Hours: recent,
      blocked: byAction.find((row) => row.action === TeamPolicyAction.BLOCK)?._count._all ?? 0,
      reviewed: byAction.find((row) => row.action === TeamPolicyAction.REVIEW)?._count._all ?? 0,
      sources: bySource.map((row) => ({ source: row.source, count: row._count._all })),
    },
  })
}

export async function POST(request: Request) {
  const auth = await policyUser()
  if (auth.error || !auth.user) return auth.error
  const parsed = teamPolicyCreateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "A policy needs a name and one to thirty valid rules." }, { status: 400 })
  const policy = await db.teamSecurityPolicy.create({ data: { userId: auth.user.id, name: parsed.data.name, rules: { create: parsed.data.rules.map((rule) => ({ type: rule.type, value: rule.value || null, action: rule.action })) } }, include: { rules: true } })
  return NextResponse.json({ policy }, { status: 201 })
}

const patchSchema = z.object({
  id: z.string().min(1),
  active: z.boolean().optional(),
  addRule: z.object({ type: z.nativeEnum(TeamPolicyRuleType), value: z.string().trim().max(280).optional().nullable(), action: z.nativeEnum(TeamPolicyAction).default(TeamPolicyAction.BLOCK) }).optional(),
  removeRuleId: z.string().min(1).optional(),
})

export async function PATCH(request: Request) {
  const auth = await policyUser()
  if (auth.error || !auth.user) return auth.error
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid policy update." }, { status: 400 })
  const policy = await db.teamSecurityPolicy.findFirst({ where: { id: parsed.data.id, userId: auth.user.id } })
  if (!policy) return NextResponse.json({ error: "Policy not found." }, { status: 404 })
  if (parsed.data.removeRuleId) await db.teamSecurityPolicyRule.deleteMany({ where: { id: parsed.data.removeRuleId, policyId: policy.id } })
  if (parsed.data.addRule) await db.teamSecurityPolicyRule.create({ data: { policyId: policy.id, type: parsed.data.addRule.type, value: parsed.data.addRule.value || null, action: parsed.data.addRule.action } })
  if (typeof parsed.data.active === "boolean") await db.teamSecurityPolicy.update({ where: { id: policy.id }, data: { active: parsed.data.active } })
  return NextResponse.json({ policy: await db.teamSecurityPolicy.findUnique({ where: { id: policy.id }, include: { rules: true } }) })
}

export async function DELETE(request: Request) {
  const auth = await policyUser()
  if (auth.error || !auth.user) return auth.error
  const id = String(new URL(request.url).searchParams.get("id") ?? "")
  if (!id) return NextResponse.json({ error: "Policy id is required." }, { status: 400 })
  const deleted = await db.teamSecurityPolicy.deleteMany({ where: { id, userId: auth.user.id } })
  if (!deleted.count) return NextResponse.json({ error: "Policy not found." }, { status: 404 })
  return NextResponse.json({ ok: true })
}
