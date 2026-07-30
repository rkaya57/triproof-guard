import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { listScamGuardFeedback, reviewScamGuardFeedback } from "@/lib/scamguard/feedback"

export const runtime = "nodejs"

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  return NextResponse.json({ feedback: await listScamGuardFeedback() })
}

export async function PATCH(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  const body = (await request.json().catch(() => null)) as { id?: string; status?: string } | null
  if (!body?.id || (body.status !== "DISMISSED" && body.status !== "PROMOTED")) return NextResponse.json({ error: "A feedback id and valid review status are required." }, { status: 400 })
  return NextResponse.json({ feedback: await reviewScamGuardFeedback({ id: body.id, status: body.status, reviewerId: admin.id }) })
}
