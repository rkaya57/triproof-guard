import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { buildProductionHealthReport } from "@/lib/health/production"

export const runtime = "nodejs"

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const report = await buildProductionHealthReport()
  return NextResponse.json(report)
}
