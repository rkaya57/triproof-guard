import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"

export const runtime = "nodejs"

export async function POST() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  return NextResponse.json({
    error: "Batch liveness attestation is disabled in Tri-Proof Liveness V2.4",
    reasonCodes: ["V2_4_SERVER_CHAIN_REQUIRED"],
    next: "/api/humanity/v2/liveness/chain/start",
    rawFramesStored: false,
    captureMetadataStored: false,
  }, { status: 410 })
}
