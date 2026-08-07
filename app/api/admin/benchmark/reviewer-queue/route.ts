import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import {
  buildRepresentativeReviewerQueue,
  reviewerRowsToCsv,
} from "@/lib/benchmark/reviewer-export"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const admin = await getAdminUser()
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const url = new URL(request.url)
  const format = url.searchParams.get("format") ?? "csv"
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

  const csv = `\uFEFF${reviewerRowsToCsv(queue.rows)}\n`
  const date = new Date().toISOString().slice(0, 10)
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tri-proof-blind-review-${date}.csv"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
