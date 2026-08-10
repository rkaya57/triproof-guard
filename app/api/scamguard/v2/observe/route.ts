import { NextResponse } from "next/server"

import type { ScamGuardChain, ScamGuardScanType } from "@/lib/scamguard/engine"
import { getExtensionSession } from "@/lib/extension/session"
import { scanAccess } from "@/lib/scamguard/scan-access"
import { observeScamGuardV2 } from "@/lib/scamguard/v2/evidence-fusion"
import { compareShadowDecision } from "@/lib/scamguard/v2/shadow-decision"
import { buildShadowTelemetryRecord } from "@/lib/scamguard/v2/shadow-telemetry"

export const runtime = "nodejs"

const scanTypes = new Set<ScamGuardScanType>(["url", "wallet", "token", "transaction"])
const chains = new Set<ScamGuardChain>(["solana", "evm", "unknown"])

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    type?: ScamGuardScanType
    value?: string
    walletAddress?: string
    chain?: ScamGuardChain
    sourceUrl?: string
    claimedAsset?: string
    deepScan?: boolean
  } | null

  const type = body?.type
  const value = body?.value?.trim()
  if (!type || !scanTypes.has(type)) {
    return NextResponse.json({ error: "type must be url, wallet, token, or transaction" }, { status: 400 })
  }
  if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 })
  if (body?.chain && !chains.has(body.chain)) {
    return NextResponse.json({ error: "chain must be solana, evm, or unknown" }, { status: 400 })
  }

  const extensionSession = await getExtensionSession(request)
  const access = await scanAccess(Boolean(body.deepScan), extensionSession?.user)
  if (access.error) return access.error

  const observation = await observeScamGuardV2({
    type,
    value,
    walletAddress: body.walletAddress?.trim() || undefined,
    chain: body.chain,
    sourceUrl: body.sourceUrl?.trim() || undefined,
    claimedAsset: type === "token" ? body.claimedAsset?.trim().slice(0, 160) || undefined : undefined,
    deepScan: access.deepScan,
  })
  const shadowDecision = compareShadowDecision(observation.base.riskLevel, observation.proposedAssessment)
  const shadowTelemetry = buildShadowTelemetryRecord({
    scanType: type,
    chain: observation.base.metadata.chain,
    shadow: shadowDecision,
    providerCount: observation.summary.providerCount,
    availableProviders: observation.summary.availableProviders,
    proposedSignalCount: observation.summary.proposedSignalCount,
  })

  return NextResponse.json({ ...observation, shadowDecision, shadowTelemetry }, {
    headers: {
      "Cache-Control": "no-store",
      "X-ScamGuard-V2-Mode": "observe-only",
      "X-ScamGuard-V2-Shadow": shadowDecision.relation,
      "X-ScamGuard-Plan": access.plan.name,
      "X-ScamGuard-Daily-Limit": String(access.plan.dailyScanLimit),
      "X-ScamGuard-Scans-Used": String(access.scanCount),
    },
  })
}
