import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { loadCampaignBenchmarkReport } from "@/lib/campaign-benchmark/server"
import { isDatabaseConnectionError } from "@/lib/db/errors"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  try {
    const result = await loadCampaignBenchmarkReport(id, user.id)
    if (!result) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json(
        { error: "Campaign metrics are temporarily unavailable" },
        { status: 503 }
      )
    }
    console.error("Campaign benchmark load failed", error)
    return NextResponse.json(
      { error: "Campaign metrics could not be loaded" },
      { status: 500 }
    )
  }
}
