import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { runAiSidecarBenchmarkLive } from "@/lib/benchmark/ai-sidecar-live"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const CONFIRMATION = "RUN_AI_BENCHMARK_V1"
const COOLDOWN_MINUTES = 5

type RequestBody = {
  confirm?: unknown
}

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return NextResponse.json({ error: "Valid JSON body required" }, { status: 400 })
  }

  if (body.confirm !== CONFIRMATION) {
    return NextResponse.json(
      { error: `Explicit confirmation required: ${CONFIRMATION}` },
      { status: 400 }
    )
  }

  const recent = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS "count"
    FROM "AiEvidenceAudit"
    WHERE "context" = 'internal_benchmark'
      AND "stage" = 'benchmark'
      AND "createdAt" >= NOW() - INTERVAL '5 minutes'
  `)
  const recentEvents = Number(recent[0]?.count ?? 0n)
  if (recentEvents > 0) {
    return NextResponse.json(
      {
        error: `AI benchmark cooldown active. Wait ${COOLDOWN_MINUTES} minutes before another live run.`,
      },
      { status: 429 }
    )
  }

  try {
    const result = await runAiSidecarBenchmarkLive()
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    console.error("AI sidecar benchmark failed", error)
    return NextResponse.json(
      { error: "AI sidecar benchmark failed safely; deterministic engine was not modified." },
      { status: 500 }
    )
  }
}
