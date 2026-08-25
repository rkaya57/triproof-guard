import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { buildInvestigationCaseBriefMarkdown } from "@/lib/cluster-investigation/case-brief"
import { loadInvestigationCaseBrief } from "@/lib/cluster-investigation/case-brief-server"
import { safeClusterExportFileStem } from "@/lib/cluster-investigation/export"
import { isDatabaseConnectionError } from "@/lib/db/errors"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; clusterLabel: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id, clusterLabel } = await context.params
  const normalizedClusterLabel = decodeURIComponent(clusterLabel).trim()
  const format = new URL(request.url).searchParams.get("format")?.trim().toLowerCase() || "json"
  if (format !== "json" && format !== "md" && format !== "markdown") {
    return NextResponse.json({ error: "format must be json or markdown" }, { status: 400 })
  }

  try {
    const result = await loadInvestigationCaseBrief(id, user.id, normalizedClusterLabel)
    if (!result?.brief) return NextResponse.json({ error: "Cluster not found" }, { status: 404 })

    const stem = safeClusterExportFileStem(result.brief.project.name, normalizedClusterLabel)
    if (format === "md" || format === "markdown") {
      return new Response(buildInvestigationCaseBriefMarkdown(result.brief), {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${stem}-case-brief.md"`,
          "Cache-Control": "private, no-store",
        },
      })
    }

    return NextResponse.json(
      { brief: result.brief },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json(
        { error: "Investigation case brief is temporarily unavailable" },
        { status: 503 },
      )
    }
    console.error("Investigation case brief load failed", error)
    return NextResponse.json({ error: "Investigation case brief could not be loaded" }, { status: 500 })
  }
}
