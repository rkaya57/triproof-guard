import { NextResponse } from "next/server"

import { processNextAnalysisBatch } from "@/lib/analysis/batch-worker"

export const runtime = "nodejs"

function isAuthorized(request: Request) {
  const configuredSecret = process.env.ANALYSIS_WORKER_SECRET?.trim()
  if (!configuredSecret) {
    return process.env.NODE_ENV !== "production"
  }

  const authHeader = request.headers.get("authorization") ?? ""
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""
  const url = new URL(request.url)
  const querySecret = url.searchParams.get("secret")?.trim() ?? ""

  return bearer === configuredSecret || querySecret === configuredSecret
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await processNextAnalysisBatch()
  return NextResponse.json(result)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await processNextAnalysisBatch()
  return NextResponse.json(result)
}
