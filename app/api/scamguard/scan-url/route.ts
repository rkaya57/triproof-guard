import { NextResponse } from "next/server"

import { scanScamGuard } from "@/lib/scamguard/engine"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { value?: string } | null
  const value = body?.value?.trim()
  if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 })

  return NextResponse.json(await scanScamGuard({ type: "url", value }), {
    headers: { "Cache-Control": "no-store" },
  })
}
