import { NextResponse } from "next/server"

import { getAdminProviderUsage } from "@/lib/admin/provider-usage"
import { getAdminUser } from "@/lib/auth/admin"

export const runtime = "nodejs"

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const providers = await getAdminProviderUsage()
  return NextResponse.json({ providers })
}
