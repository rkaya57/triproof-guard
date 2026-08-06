import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { loadCampaignRiskGraph } from "@/lib/risk-graph/server"

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
    const graph = await loadCampaignRiskGraph(id, user.id)
    if (!graph) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }
    return NextResponse.json({ graph })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json(
        { error: "Risk graph is temporarily unavailable" },
        { status: 503 }
      )
    }
    console.error("Campaign risk graph load failed", error)
    return NextResponse.json({ error: "Risk graph could not be loaded" }, { status: 500 })
  }
}
