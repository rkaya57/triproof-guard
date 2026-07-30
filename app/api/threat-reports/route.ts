import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import {
  CommunityThreatReportError,
  communityThreatReportSchema,
  createCommunityThreatReport,
  isValidCommunityThreatTarget,
  listPublishedCommunityThreatReports,
} from "@/lib/scamguard/community-reports"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ reports: await listPublishedCommunityThreatReports() }, { headers: { "Cache-Control": "public, max-age=60" } })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Sign in to submit a community threat report.", code: "AUTH_REQUIRED" }, { status: 401 })

  const parsed = communityThreatReportSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid threat report.", details: parsed.error.flatten() }, { status: 400 })
  if (!isValidCommunityThreatTarget(parsed.data.targetKind, parsed.data.target)) {
    return NextResponse.json({ error: "The target does not match the selected target type." }, { status: 400 })
  }

  try {
    const report = await createCommunityThreatReport(parsed.data, user.id)
    return NextResponse.json({ report, message: "Report submitted for admin review. It will not be public until approved." }, { status: 201 })
  } catch (error) {
    if (error instanceof CommunityThreatReportError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "RATE_LIMITED" ? 429 : 409 })
    throw error
  }
}
