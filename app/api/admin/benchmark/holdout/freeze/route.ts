import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import {
  createIndependentHoldoutFreeze,
  getActiveHoldoutRun,
  getLatestHoldoutRun,
} from "@/lib/benchmark/holdout-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function requireAdmin() {
  const admin = await getAdminUser()
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }
  return null
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const active = await getActiveHoldoutRun()
    const latest = active ?? (await getLatestHoldoutRun())
    return NextResponse.json(
      { activeRun: active, latestRun: latest },
      {
        headers: {
          "Cache-Control": "no-store, private",
          "X-Content-Type-Options": "nosniff",
        },
      }
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Holdout freeze state failed" },
      { status: 400 }
    )
  }
}

export async function POST() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const existing = await getActiveHoldoutRun()
    if (existing) {
      return NextResponse.json({ created: false, run: existing })
    }
    const result = await createIndependentHoldoutFreeze()
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    console.error("Independent holdout freeze creation failed", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Holdout freeze creation failed" },
      { status: 400 }
    )
  }
}
