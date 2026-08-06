import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { loadCampaignPolicyReport } from "@/lib/campaign-policy/server"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import type { RiskPolicy } from "@/types"

export const runtime = "nodejs"

function policyPreset(value: string | null): RiskPolicy | undefined {
  if (value === "conservative" || value === "balanced" || value === "strict") return value
  return undefined
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const preset = policyPreset(new URL(request.url).searchParams.get("preset"))

  try {
    const result = await loadCampaignPolicyReport(id, user.id, preset)
    if (!result) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    if (!result.report) {
      return NextResponse.json(
        { error: "Campaign analysis is required", campaignId: result.campaignId },
        { status: 409 }
      )
    }
    return NextResponse.json({ report: result.report })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json(
        { error: "Campaign policy is temporarily unavailable" },
        { status: 503 }
      )
    }
    console.error("Campaign policy load failed", error)
    return NextResponse.json({ error: "Campaign policy could not be loaded" }, { status: 500 })
  }
}
