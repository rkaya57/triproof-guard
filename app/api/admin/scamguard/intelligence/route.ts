import { NextResponse } from "next/server"
import type { ScamGuardIntelKind, ScamGuardIntelVerdict } from "@prisma/client"

import { getAdminUser } from "@/lib/auth/admin"
import { listScamGuardIntelEntries, upsertScamGuardIntelEntry } from "@/lib/scamguard/intelligence"

export const runtime = "nodejs"

const kinds = new Set<ScamGuardIntelKind>(["DOMAIN", "WALLET", "EVM_ADDRESS", "SOLANA_ADDRESS", "TOKEN", "CONTRACT"])
const verdicts = new Set<ScamGuardIntelVerdict>(["TRUSTED", "SUSPICIOUS", "KNOWN_BAD"])

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const entries = await listScamGuardIntelEntries()
  return NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const body = (await request.json().catch(() => null)) as {
    kind?: ScamGuardIntelKind
    value?: string
    chain?: string | null
    verdict?: ScamGuardIntelVerdict
    label?: string
    source?: string
    notes?: string | null
    active?: boolean
  } | null

  const kind = body?.kind
  const verdict = body?.verdict
  const value = body?.value?.trim()
  const label = body?.label?.trim()

  if (!kind || !kinds.has(kind)) return NextResponse.json({ error: "Invalid intelligence kind" }, { status: 400 })
  if (!verdict || !verdicts.has(verdict)) return NextResponse.json({ error: "Invalid intelligence verdict" }, { status: 400 })
  if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 })
  if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 })

  const entry = await upsertScamGuardIntelEntry({
    kind,
    value,
    chain: body?.chain,
    verdict,
    label,
    source: body?.source,
    notes: body?.notes,
    active: body?.active ?? true,
    createdById: admin.id,
  })

  return NextResponse.json({ entry }, { headers: { "Cache-Control": "no-store" } })
}
