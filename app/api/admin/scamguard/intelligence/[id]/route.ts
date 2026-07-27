import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { deleteScamGuardIntelEntry } from "@/lib/scamguard/intelligence"

export const runtime = "nodejs"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const { id } = await params
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

  await deleteScamGuardIntelEntry(id)
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
}
