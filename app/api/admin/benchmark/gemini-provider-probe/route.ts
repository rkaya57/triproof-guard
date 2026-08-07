import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { runGeminiProviderProbe } from "@/lib/ai/gemini-provider-probe"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const CONFIRMATION = "RUN_GEMINI_PROVIDER_PROBE_V1"

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

  try {
    const result = await runGeminiProviderProbe()
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    console.error("Gemini provider probe failed", error)
    return NextResponse.json(
      { error: "Gemini provider probe failed safely." },
      { status: 500 }
    )
  }
}
