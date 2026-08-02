import { NextResponse } from "next/server"

import { getV1ApiUser } from "@/lib/api/v1-auth"
import { scanScamGuard, type ScamGuardChain, type ScamGuardScanType } from "@/lib/scamguard/engine"
import { enforceTeamPolicies } from "@/lib/team-policy/store"

export const runtime = "nodejs"
export const maxDuration = 20

const scanTypes = new Set<ScamGuardScanType>(["url", "wallet", "token", "transaction"])

export async function POST(request: Request) {
  const auth = await getV1ApiUser(request)
  if (auth.error) return auth.error

  const body = (await request.json().catch(() => null)) as {
    type?: ScamGuardScanType
    value?: string
    walletAddress?: string
    chain?: ScamGuardChain
    sourceUrl?: string
  } | null

  const type = body?.type
  const value = body?.value?.trim()
  if (!type || !scanTypes.has(type)) {
    return NextResponse.json({ error: "type must be url, wallet, token, or transaction" }, { status: 400 })
  }
  if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 })
  if (type === "url" && value.length > 4_096) return NextResponse.json({ error: "URL is too long" }, { status: 413 })

  const result = await scanScamGuard({
    type,
    value,
    walletAddress: body?.walletAddress,
    chain: body?.chain,
    sourceUrl: body?.sourceUrl,
    deepScan: type === "url",
  })
  const policy = await enforceTeamPolicies({ userId: auth.user.id, result, target: value, source: "api_v1" })
  return NextResponse.json(
    {
      ...result,
      teamPolicy: policy,
      account: {
        userId: auth.user.id,
        email: auth.user.email,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
