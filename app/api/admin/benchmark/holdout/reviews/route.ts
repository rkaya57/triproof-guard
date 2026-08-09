import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { getActiveHoldoutRun } from "@/lib/benchmark/holdout-store"
import {
  getHoldoutReviewState,
  importHoldoutReviewCsv,
  sealHoldoutGroundTruth,
} from "@/lib/benchmark/holdout-review-import"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

async function activeRunOrResponse() {
  const admin = await getAdminUser()
  if (!admin) {
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) }
  }
  const run = await getActiveHoldoutRun()
  if (!run) {
    return {
      error: NextResponse.json({ error: "No active Independent Holdout Validation v1 run" }, { status: 409 }),
    }
  }
  return { run }
}

export async function GET() {
  try {
    const active = await activeRunOrResponse()
    if (active.error) return active.error
    return NextResponse.json(await getHoldoutReviewState(active.run), {
      headers: {
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Holdout review state failed" },
      { status: 400 }
    )
  }
}

export async function POST(request: Request) {
  const active = await activeRunOrResponse()
  if (active.error) return active.error

  try {
    const formData = await request.formData()
    const role = formData.get("role")
    const file = formData.get("reviewCsv")
    if (role !== "reviewer_a" && role !== "reviewer_b" && role !== "adjudicator") {
      return NextResponse.json({ error: "role must be reviewer_a, reviewer_b, or adjudicator" }, { status: 400 })
    }
    if (!(file instanceof File) || file.size <= 0 || file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: "A completed reviewCsv file up to 4 MB is required" }, { status: 400 })
    }

    const imported = await importHoldoutReviewCsv({
      run: active.run,
      role,
      completedCsv: await file.text(),
    })

    let groundTruth = null
    let groundTruthError: string | null = null
    if (imported.state.readyForGroundTruth && !imported.state.groundTruthSealed) {
      try {
        groundTruth = await sealHoldoutGroundTruth(active.run)
      } catch (error) {
        groundTruthError = error instanceof Error ? error.message : "Ground-truth seal failed"
      }
    }

    return NextResponse.json(
      {
        created: imported.created,
        artifactHash: imported.artifactHash,
        state: await getHoldoutReviewState(active.run),
        groundTruth,
        groundTruthError,
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
          "X-Content-Type-Options": "nosniff",
        },
      }
    )
  } catch (error) {
    console.error("Holdout review import failed", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Holdout review import failed" },
      { status: 400 }
    )
  }
}
