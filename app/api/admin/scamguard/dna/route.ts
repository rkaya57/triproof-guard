import type { ScamDnaVerdict } from "@prisma/client"
import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { listScamDnaAdmin, updateScamDnaCampaign } from "@/lib/scamguard/scam-dna"

export const runtime = "nodejs"

const verdicts = new Set<ScamDnaVerdict>(["UNKNOWN", "SUSPICIOUS", "KNOWN_BAD"])

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  return NextResponse.json(await listScamDnaAdmin(), {
    headers: { "Cache-Control": "no-store" },
  })
}

export async function PATCH(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const body = (await request.json().catch(() => null)) as {
    id?: string
    verdict?: ScamDnaVerdict
    label?: string | null
    notes?: string | null
  } | null
  if (!body?.id) return NextResponse.json({ error: "campaign id is required" }, { status: 400 })
  if (!body.verdict || !verdicts.has(body.verdict)) {
    return NextResponse.json({ error: "Invalid Scam DNA verdict" }, { status: 400 })
  }

  const campaign = await updateScamDnaCampaign({
    id: body.id,
    verdict: body.verdict,
    label: body.label,
    notes: body.notes,
  })
  return NextResponse.json({ campaign }, { headers: { "Cache-Control": "no-store" } })
}
