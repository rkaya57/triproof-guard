import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { buildProductionHealthReport } from "@/lib/health/production"

export const runtime = "nodejs"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const report = await buildProductionHealthReport()
  return NextResponse.json(report)
}
