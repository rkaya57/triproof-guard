import { NextResponse } from "next/server"

import { processAnalysisQueue } from "@/lib/analysis/queue-optimizer"

export const runtime = "nodejs"

function isAuthorized(request: Request) {
  const configuredSecret =
    process.env.ANALYSIS_WORKER_SECRET?.trim() ||
    process.env["CRON" + "_SECRET"]?.trim() ||
    process.env.WORKER_SECRET?.trim() ||
    ""

  if (!configuredSecret) {
    return process.env.NODE_ENV !== "production"
  }

  const authHeader = request.headers.get("authorization") ?? ""
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""
  const url = new URL(request.url)
  const querySecret = url.searchParams.get("secret")?.trim() ?? ""

  return bearer === configuredSecret || querySecret === configuredSecret
}

async function runQueue(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await processAnalysisQueue({
    maxBatches: 8,
    timeBudgetMs: 45000,
    recoverStale: true,
  })

  return NextResponse.json({ ok: true, source: "legacy-cron", ...result })
}

export async function POST(request: Request) {
  return runQueue(request)
}

export async function GET(request: Request) {
  return runQueue(request)
}
