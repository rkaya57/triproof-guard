import { NextResponse } from "next/server"

import { getV1ApiUser } from "@/lib/api/v1-auth"
import { scanScamGuard, type ScamGuardScanType } from "@/lib/scamguard/engine"

export const runtime = "nodejs"

const scanTypes = new Set<ScamGuardScanType>(["url", "wallet", "token", "transaction"])

export async function POST(request: Request) {
  const auth = await getV1ApiUser(request)
  if (auth.error) return auth.error

  const body = (await request.json().catch(() => null)) as {
    type?: ScamGuardScanType
    value?: string
    walletAddress?: string
  } | null

  const type = body?.type
  const value = body?.value?.trim()
  if (!type || !scanTypes.has(type)) {
    return NextResponse.json({ error: "type must be url, wallet, token, or transaction" }, { status: 400 })
  }
  if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 })

  const result = await scanScamGuard({ type, value, walletAddress: body?.walletAddress })
  return NextResponse.json(
    {
      ...result,
      account: {
        userId: auth.user.id,
        email: auth.user.email,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
