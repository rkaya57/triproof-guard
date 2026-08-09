import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { getActiveHoldoutRun } from "@/lib/benchmark/holdout-store"
import {
  previewHoldoutReviewerBundle,
  sealHoldoutReviewerBundle,
} from "@/lib/benchmark/holdout-reviewer-bundle"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const HOLDOUT_CASES_PER_PROJECT = 20

async function authorizedActiveRun() {
  const admin = await getAdminUser()
  if (!admin) {
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) }
  }
  const run = await getActiveHoldoutRun()
  if (!run) {
    return {
      error: NextResponse.json(
        {
          error:
            "No active Independent Holdout Validation v1 run exists. Complete and deploy the holdout tooling before creating the freeze.",
        },
        { status: 409 }
      ),
    }
  }
  return { run }
}

export async function GET() {
  try {
    const state = await authorizedActiveRun()
    if (state.error) return state.error
    const preview = await previewHoldoutReviewerBundle(
      state.run,
      HOLDOUT_CASES_PER_PROJECT
    )
    return NextResponse.json(
      { ...preview, casesPerProject: HOLDOUT_CASES_PER_PROJECT },
      {
        headers: {
          "Cache-Control": "no-store, private",
          "X-Content-Type-Options": "nosniff",
        },
      }
    )
  } catch (error) {
    console.error("Holdout reviewer-bundle preview failed", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Holdout bundle preview failed" },
      { status: 400 }
    )
  }
}

export async function POST() {
  try {
    const state = await authorizedActiveRun()
    if (state.error) return state.error
    const result = await sealHoldoutReviewerBundle(
      state.run,
      HOLDOUT_CASES_PER_PROJECT
    )
    return NextResponse.json(
      {
        created: result.created,
        bundle: result.bundle,
        casesPerProject: HOLDOUT_CASES_PER_PROJECT,
        privateSealStoredServerSide: true,
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
          "X-Content-Type-Options": "nosniff",
        },
      }
    )
  } catch (error) {
    console.error("Holdout reviewer-bundle seal failed", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Holdout bundle seal failed" },
      { status: 400 }
    )
  }
}
