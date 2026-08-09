import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { getHoldoutArtifact } from "@/lib/benchmark/holdout-artifacts"
import {
  evaluateIndependentHoldoutOnce,
  type HoldoutEvaluationPayload,
} from "@/lib/benchmark/holdout-evaluation"
import { getActiveHoldoutRun, getLatestHoldoutRun } from "@/lib/benchmark/holdout-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

async function adminOrResponse() {
  const admin = await getAdminUser()
  if (!admin) {
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) }
  }
  return { admin }
}

export async function GET() {
  const auth = await adminOrResponse()
  if (auth.error) return auth.error
  try {
    const run = (await getActiveHoldoutRun()) ?? (await getLatestHoldoutRun())
    if (!run) {
      return NextResponse.json({ run: null, evaluation: null }, { headers: { "Cache-Control": "no-store, private" } })
    }
    const evaluation = await getHoldoutArtifact<HoldoutEvaluationPayload>(run.id, "evaluation")
    return NextResponse.json(
      { run, evaluation: evaluation?.payload ?? null },
      {
        headers: {
          "Cache-Control": "no-store, private",
          "X-Content-Type-Options": "nosniff",
        },
      }
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Holdout evaluation state failed" },
      { status: 400 }
    )
  }
}

export async function POST() {
  const auth = await adminOrResponse()
  if (auth.error) return auth.error
  try {
    const run = await getActiveHoldoutRun()
    if (!run) {
      return NextResponse.json({ error: "No active holdout run is ready to evaluate" }, { status: 409 })
    }
    const result = await evaluateIndependentHoldoutOnce(run)
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    console.error("Independent holdout one-shot evaluation failed", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Holdout evaluation failed" },
      { status: 400 }
    )
  }
}
