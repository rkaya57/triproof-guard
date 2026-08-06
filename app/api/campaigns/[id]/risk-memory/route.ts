import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { loadCrossCampaignRiskMemory } from "@/lib/risk-memory/server"

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
    const memory = await loadCrossCampaignRiskMemory(id, user.id)
    if (!memory) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }
    return NextResponse.json({ memory })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json(
        { error: "Cross-campaign risk memory is temporarily unavailable" },
        { status: 503 }
      )
    }
    console.error("Cross-campaign risk memory load failed", error)
    return NextResponse.json(
      { error: "Cross-campaign risk memory could not be loaded" },
      { status: 500 }
    )
  }
}
