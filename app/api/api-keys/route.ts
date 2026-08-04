import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { createApiKeyMaterial, getSubscriptionEntitlement } from "@/lib/billing/subscription"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const [entitlement, keys] = await Promise.all([
    getSubscriptionEntitlement(user),
    db.apiKey.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, prefix: true, lastFour: true, isActive: true, lastUsedAt: true, createdAt: true, revokedAt: true } }),
  ])
  return NextResponse.json({ plan: entitlement.plan.id, monthlyLimit: entitlement.isAdmin ? null : entitlement.plan.monthlyApiRequestLimit, isAdmin: entitlement.isAdmin, keys })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const entitlement = await getSubscriptionEntitlement(user)
  if (!entitlement.isAdmin && entitlement.plan.monthlyApiRequestLimit <= 0) {
    return NextResponse.json({ error: "API keys require an API Starter or API Growth plan.", code: "PLAN_REQUIRED" }, { status: 403 })
  }
  const body = (await request.json().catch(() => ({}))) as { name?: string }
  const name = String(body.name ?? "Production key").trim().slice(0, 80) || "Production key"
  const activeCount = await db.apiKey.count({ where: { userId: user.id, isActive: true } })
  if (!entitlement.isAdmin && activeCount >= 5) return NextResponse.json({ error: "You can keep up to five active API keys." }, { status: 409 })
  const material = createApiKeyMaterial()
  const key = await db.apiKey.create({ data: { userId: user.id, name, keyHash: material.keyHash, prefix: material.prefix, lastFour: material.lastFour } })
  return NextResponse.json({ key: { id: key.id, name: key.name, prefix: key.prefix, lastFour: key.lastFour, createdAt: key.createdAt }, token: material.token, warning: "Copy this key now. It cannot be shown again." }, { status: 201 })
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { id?: string }
  const id = String(body.id ?? "")
  if (!id) return NextResponse.json({ error: "API key id is required." }, { status: 400 })
  const key = await db.apiKey.findFirst({ where: { id, userId: user.id } })
  if (!key) return NextResponse.json({ error: "API key not found." }, { status: 404 })
  await db.apiKey.update({ where: { id }, data: { isActive: false, revokedAt: new Date() } })
  return NextResponse.json({ ok: true })
}
