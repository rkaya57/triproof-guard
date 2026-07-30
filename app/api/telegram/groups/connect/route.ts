import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { createTelegramConnectCode, getSubscriptionEntitlement, hashTelegramConnectCode } from "@/lib/billing/subscription"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const [entitlement, groups] = await Promise.all([
    getSubscriptionEntitlement(user),
    db.telegramGuardianGroup.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, username: true, guardianEnabled: true, alertLevel: true, lastSeenAt: true } }),
  ])
  return NextResponse.json({ plan: entitlement.plan.id, groupLimit: entitlement.plan.telegramGroupLimit, adminLimit: entitlement.plan.telegramAdminLimit, groups })
}

export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const entitlement = await getSubscriptionEntitlement(user)
  if (!entitlement.isAdmin && entitlement.plan.telegramGroupLimit <= 0) return NextResponse.json({ error: "Telegram group protection requires a Community or API Growth plan.", code: "GROUP_PLAN_REQUIRED" }, { status: 403 })
  const ownedCount = await db.telegramGuardianGroup.count({ where: { ownerId: user.id } })
  if (!entitlement.isAdmin && ownedCount >= entitlement.plan.telegramGroupLimit) return NextResponse.json({ error: `Your plan already protects ${entitlement.plan.telegramGroupLimit} Telegram group.`, code: "GROUP_LIMIT_REACHED" }, { status: 409 })
  const code = createTelegramConnectCode()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
  await db.telegramGroupInvite.create({ data: { userId: user.id, codeHash: hashTelegramConnectCode(code), expiresAt } })
  return NextResponse.json({ code, expiresAt, command: `/guardian connect ${code}` }, { status: 201 })
}
