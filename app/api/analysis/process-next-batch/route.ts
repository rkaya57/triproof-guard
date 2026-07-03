import { NextResponse } from "next/server"

import { processAnalysisQueue } from "@/lib/analysis/queue-optimizer"
import { isWorkerAuthorized, workerUnauthorized } from "@/lib/worker/auth"

export const runtime = "nodejs"

async function runQueue(request: Request) {
  if (!isWorkerAuthorized(request)) return workerUnauthorized()

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
