import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { loadClusterInvestigation } from "@/lib/cluster-investigation/server"
import { isDatabaseConnectionError } from "@/lib/db/errors"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; clusterLabel: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id, clusterLabel } = await context.params
  const normalizedClusterLabel = decodeURIComponent(clusterLabel).trim()
  if (!normalizedClusterLabel) {
    return NextResponse.json({ error: "Cluster label is required" }, { status: 400 })
  }

  try {
    const result = await loadClusterInvestigation(id, user.id, normalizedClusterLabel)
    if (!result) return NextResponse.json({ error: "Analysis not found" }, { status: 404 })
    if (!result.report) return NextResponse.json({ error: "Cluster not found" }, { status: 404 })
    return NextResponse.json({ report: result.report })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json(
        { error: "Cluster investigation is temporarily unavailable" },
        { status: 503 },
      )
    }
    console.error("Cluster investigation API load failed", error)
    return NextResponse.json({ error: "Cluster investigation could not be loaded" }, { status: 500 })
  }
}
