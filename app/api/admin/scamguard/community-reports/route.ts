import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdminUser } from "@/lib/auth/admin"
import { CommunityThreatReportError, listCommunityThreatReportsForAdmin, reviewCommunityThreatReport } from "@/lib/scamguard/community-reports"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const reviewSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["PUBLISHED", "REJECTED"]),
  reviewerNote: z.string().trim().max(1_000).optional(),
  promoteToIntel: z.boolean().optional(),
})

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  return NextResponse.json({ reports: await listCommunityThreatReportsForAdmin() }, { headers: { "Cache-Control": "no-store" } })
}

export async function PATCH(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid report review." }, { status: 400 })
  try {
    const report = await reviewCommunityThreatReport({ ...parsed.data, reviewerId: admin.id })
    return NextResponse.json({ report })
  } catch (error) {
    if (error instanceof CommunityThreatReportError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "NOT_FOUND" ? 404 : 409 })
    throw error
  }
}
