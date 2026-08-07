import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { buildRepresentativeReviewerQueue } from "@/lib/benchmark/reviewer-export"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const admin = await getAdminUser()
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const url = new URL(request.url)
  const format = url.searchParams.get("format") ?? "summary"
  const perProjectParam = Number.parseInt(url.searchParams.get("perProject") ?? "20", 10)
  const perProject = Number.isFinite(perProjectParam)
    ? Math.min(50, Math.max(1, perProjectParam))
    : 20

  const queue = await buildRepresentativeReviewerQueue(perProject)

  if (format === "summary") {
    return NextResponse.json(queue.summary, {
      headers: { "Cache-Control": "no-store" },
    })
  }

  return NextResponse.json(
    {
      error:
        "Direct reviewer CSV export is disabled because it would not freeze a matching private audit seal. Use /api/admin/benchmark/reviewer-bundle instead.",
    },
    {
      status: 409,
      headers: { "Cache-Control": "no-store, private" },
    }
  )
}
