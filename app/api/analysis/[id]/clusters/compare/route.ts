import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { loadCrossClusterComparison } from "@/lib/cluster-investigation/comparison-server"
import { MAX_COMPARED_CLUSTERS } from "@/lib/cluster-investigation/comparison"
import { isDatabaseConnectionError } from "@/lib/db/errors"

export const runtime = "nodejs"

function clusterLabels(request: Request) {
  const url = new URL(request.url)
  return Array.from(
    new Set(
      url.searchParams
        .getAll("cluster")
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, MAX_COMPARED_CLUSTERS)
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const labels = clusterLabels(request)
  if (labels.length < 2) {
    return NextResponse.json(
      { error: "Select at least two clusters to compare" },
      { status: 400 },
    )
  }

  try {
    const result = await loadCrossClusterComparison(id, user.id, labels)
    if (!result) return NextResponse.json({ error: "Analysis not found" }, { status: 404 })
    if (result.report.clusters.length < 2) {
      return NextResponse.json(
        { error: "At least two valid stored clusters are required" },
        { status: 404 },
      )
    }
    return NextResponse.json({ report: result.report })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json(
        { error: "Cross-cluster comparison is temporarily unavailable" },
        { status: 503 },
      )
    }
    console.error("Cross-cluster comparison API load failed", error)
    return NextResponse.json({ error: "Cross-cluster comparison could not be loaded" }, { status: 500 })
  }
}
