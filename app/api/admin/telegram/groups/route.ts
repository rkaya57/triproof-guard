import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdminUser } from "@/lib/auth/admin"
import {
  getAdvancedTelegramGuardianAdminOverview,
  updateAdvancedTelegramGroupById,
} from "@/lib/telegram/advanced-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStoreHeaders = {
  "cache-control": "no-store, max-age=0",
}

const updateSchema = z.object({
  id: z.string().min(1),
  guardianEnabled: z.boolean().optional(),
  allowlisted: z.boolean().optional(),
  alertLevel: z.enum(["CAUTION", "HIGH_RISK", "CRITICAL"]).optional(),
  dailySummary: z.boolean().optional(),
  autoMuteCritical: z.boolean().optional(),
  safeMode: z.enum(["SILENT", "COMPACT", "FULL"]).optional(),
  highRiskAction: z.enum(["WARN_ONLY", "ADMIN_REVIEW", "DELETE", "DELETE_MUTE_1H", "DELETE_MUTE_24H"]).optional(),
  criticalAction: z.enum(["WARN_ONLY", "ADMIN_REVIEW", "DELETE", "DELETE_MUTE_1H", "DELETE_MUTE_24H"]).optional(),
})

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders })
}

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return json({ error: "Admin access required" }, 403)
  return json(await getAdvancedTelegramGuardianAdminOverview())
}

export async function PATCH(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return json({ error: "Admin access required" }, 403)

  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ error: "Invalid Telegram group settings" }, 400)

  const { id, ...values } = parsed.data
  if (Object.keys(values).length === 0) return json({ error: "No settings were provided" }, 400)

  const group = await updateAdvancedTelegramGroupById(id, values)
  if (!group) return json({ error: "Telegram group was not found" }, 404)
  return json({ group })
}
