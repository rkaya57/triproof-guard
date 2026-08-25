import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { loadCampaignPolicySimulation } from "@/lib/campaign-policy/server"
import type { CampaignPolicySimulationScenarioInput } from "@/lib/campaign-policy/simulator"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import type { RiskPolicy } from "@/types"

export const runtime = "nodejs"

function preset(value: unknown): RiskPolicy | undefined {
  if (value === "conservative" || value === "balanced" || value === "strict") return value
  return undefined
}

function optionalFiniteNumber(value: unknown) {
  if (value == null || value === "") return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const body = (await request.json().catch(() => null)) as {
    preset?: unknown
    corroboratedRejectScore?: unknown
    corroboratedFamilyCount?: unknown
  } | null

  if (body?.preset != null && !preset(body.preset)) {
    return NextResponse.json(
      { error: "preset must be conservative, balanced, or strict" },
      { status: 400 },
    )
  }

  const rejectScore = optionalFiniteNumber(body?.corroboratedRejectScore)
  const familyCount = optionalFiniteNumber(body?.corroboratedFamilyCount)
  if (rejectScore === null || familyCount === null) {
    return NextResponse.json(
      { error: "Simulation thresholds must be finite numbers" },
      { status: 400 },
    )
  }

  const scenario: CampaignPolicySimulationScenarioInput = {
    preset: preset(body?.preset),
    corroboratedRejectScore: rejectScore,
    corroboratedFamilyCount: familyCount,
  }

  try {
    const result = await loadCampaignPolicySimulation(id, user.id, scenario)
    if (!result) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    if (!result.simulation) {
      return NextResponse.json(
        { error: "Campaign analysis is required", campaignId: result.campaignId },
        { status: 409 },
      )
    }

    return NextResponse.json({ simulation: result.simulation })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json(
        { error: "Policy simulation is temporarily unavailable" },
        { status: 503 },
      )
    }
    console.error("Campaign policy simulation failed", error)
    return NextResponse.json({ error: "Policy simulation could not be completed" }, { status: 500 })
  }
}
