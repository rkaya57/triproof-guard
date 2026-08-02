import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdminUser } from "@/lib/auth/admin"
import {
  getTelegramGuardianAdminOverview,
  updateTelegramGroupFromAdmin,
} from "@/lib/telegram/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const updateSchema = z.object({
  id: z.string().min(1),
  guardianEnabled: z.boolean().optional(),
  allowlisted: z.boolean().optional(),
  alertLevel: z.enum(["CAUTION", "HIGH_RISK", "CRITICAL"]).optional(),
  dailySummary: z.boolean().optional(),
  autoMuteCritical: z.boolean().optional(),
})

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  return NextResponse.json(await getTelegramGuardianAdminOverview())
}

export async function PATCH(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Telegram group settings" }, { status: 400 })
  }

  const { id, ...values } = parsed.data
  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: "No settings were provided" }, { status: 400 })
  }

  const group = await updateTelegramGroupFromAdmin(id, values)
  return NextResponse.json({ group })
}
