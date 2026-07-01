import { NextResponse } from "next/server"

import { buildProductionHealthReport } from "@/lib/health/production"

export const runtime = "nodejs"

export async function GET() {
  const report = await buildProductionHealthReport()
  const statusCode = report.status === "error" ? 503 : 200
  return NextResponse.json(report, { status: statusCode })
}
