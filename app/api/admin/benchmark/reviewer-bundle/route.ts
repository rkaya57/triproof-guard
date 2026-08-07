import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { buildFrozenReviewBundle } from "@/lib/benchmark/reviewer-bundle"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  const admin = await getAdminUser()
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const url = new URL(request.url)
  const perProjectParam = Number.parseInt(url.searchParams.get("perProject") ?? "20", 10)
  const perProject = Number.isFinite(perProjectParam)
    ? Math.min(50, Math.max(1, perProjectParam))
    : 20

  const bundle = await buildFrozenReviewBundle(perProject)

  return NextResponse.json(bundle, {
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
