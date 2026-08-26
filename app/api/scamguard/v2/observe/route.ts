import type { ScamGuardIntelKind } from "@prisma/client"
import { NextResponse } from "next/server"

import type { ScamGuardChain, ScamGuardScanType } from "@/lib/scamguard/engine"
import { getExtensionSession } from "@/lib/extension/session"
import { inspectInternalEntityAttribution, isActionableInfrastructureAttribution } from "@/lib/scamguard/providers/internal-entity-attribution"
import { inspectReviewedCommunityThreatContext } from "@/lib/scamguard/providers/reviewed-community-threat-context"
import { scanAccess } from "@/lib/scamguard/scan-access"
import { proposeV2ActivationPolicy } from "@/lib/scamguard/v2/activation-policy"
import { assessV2ActivationReadiness } from "@/lib/scamguard/v2/activation-readiness"
import { buildV2ContextTelemetry } from "@/lib/scamguard/v2/context-telemetry"
import { buildEntityContextHint } from "@/lib/scamguard/v2/entity-context-hint"
import { observeScamGuardV2 } from "@/lib/scamguard/v2/evidence-fusion"
import { compareShadowDecision } from "@/lib/scamguard/v2/shadow-decision"
import { buildShadowTelemetryRecord } from "@/lib/scamguard/v2/shadow-telemetry"

export const runtime = "nodejs"

const scanTypes = new Set<ScamGuardScanType>(["url", "wallet", "token", "transaction"])
const chains = new Set<ScamGuardChain>(["solana", "evm", "unknown"])

function communityContextTarget(type: ScamGuardScanType, value: string, chain?: ScamGuardChain): { kind: ScamGuardIntelKind; target: string } | null {
  if (type === "url") return { kind: "DOMAIN", target: value }
  if (type === "token") return { kind: "TOKEN", target: value }
  if (type === "wallet") {
    if (chain === "evm") return { kind: "EVM_ADDRESS", target: value }
    if (chain === "solana") return { kind: "SOLANA_ADDRESS", target: value }
    return { kind: "WALLET", target: value }
  }
  return null
}

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

  const walletTarget = type === "wallet" ? value : body?.walletAddress?.trim() || undefined
  const communityTarget = communityContextTarget(type, value, body?.chain)

  const [observation, entityAttribution, reviewedCommunityThreats] = await Promise.all([
    observeScamGuardV2({
      type,
      value,
      walletAddress: body.walletAddress?.trim() || undefined,
      chain: body.chain,
      sourceUrl: body.sourceUrl?.trim() || undefined,
      claimedAsset: type === "token" ? body.claimedAsset?.trim().slice(0, 160) || undefined : undefined,
      deepScan: access.deepScan,
    }),
    walletTarget
      ? inspectInternalEntityAttribution(walletTarget, body?.chain)
      : Promise.resolve(undefined),
    communityTarget
      ? inspectReviewedCommunityThreatContext({ kind: communityTarget.kind, target: communityTarget.target, chain: body?.chain })
      : Promise.resolve(undefined),
  ])

  const infrastructureContext = isActionableInfrastructureAttribution(entityAttribution)
  const entityAttributionContext = entityAttribution
    ? {
        ...entityAttribution,
        infrastructureContext,
        affectsRiskScore: false,
        affectsActivation: false,
        canDowngradeDecision: false,
      }
    : undefined

  const entityContextHint = buildEntityContextHint({
    infrastructureContext,
    entityLabel: entityAttribution?.label,
    entityType: entityAttribution?.entityType,
    assessment: observation.proposedAssessment,
  })

  const communityThreatContext = reviewedCommunityThreats
    ? {
        ...reviewedCommunityThreats,
        affectsRiskScore: false,
        affectsActivation: false,
        independentSourceForCorroboration: false,
        note: reviewedCommunityThreats.promotedReports > 0
          ? "One or more reviewed reports were already promoted into V1 ScamGuard intelligence; V2 does not count them again."
          : "Reviewed community reports are explanation-only context until separately validated.",
      }
    : undefined

  const contextTelemetry = buildV2ContextTelemetry({
    entityAttribution: entityAttribution
      ? {
          attributionConfidence: entityAttribution.attributionConfidence,
          independentProviderCount: entityAttribution.independentProviderCount,
        }
      : undefined,
    entityHintStatus: entityContextHint.status,
    reviewedCommunityThreats: reviewedCommunityThreats
      ? {
          publishedReports: reviewedCommunityThreats.publishedReports,
          promotedReports: reviewedCommunityThreats.promotedReports,
        }
      : undefined,
  })

  const shadowDecision = compareShadowDecision(observation.base.riskLevel, observation.proposedAssessment)
  const shadowTelemetry = buildShadowTelemetryRecord({
    scanType: type,
    chain: observation.base.metadata.chain,
    shadow: shadowDecision,
    providerCount: observation.summary.providerCount,
    availableProviders: observation.summary.availableProviders,
    activationEligibleSources: observation.summary.activationEligibleSources,
    degradedOrUnavailableSources: observation.providerQuality.filter((item) => !item.activationEligible).length,
    proposedSignalCount: observation.summary.proposedSignalCount,
  })
  const activationPolicy = proposeV2ActivationPolicy(shadowDecision)
  const activationReadiness = assessV2ActivationReadiness(shadowDecision, activationPolicy)

  return NextResponse.json({
    ...observation,
    transactionImpact: observation.evidence.transactionImpact,
    entityAttributionContext,
    entityContextHint,
    communityThreatContext,
    contextTelemetry,
    shadowDecision,
    shadowTelemetry,
    activationPolicy,
    activationReadiness,
  }, {
    headers: {
      "Cache-Control": "no-store",
      "X-ScamGuard-V2-Mode": "observe-only",
      "X-ScamGuard-V2-Shadow": shadowDecision.relation,
      "X-ScamGuard-V2-Candidate": activationPolicy.candidateAction,
      "X-ScamGuard-V2-Readiness": activationReadiness.stage,
      "X-ScamGuard-Plan": access.plan.name,
      "X-ScamGuard-Daily-Limit": String(access.plan.dailyScanLimit),
      "X-ScamGuard-Scans-Used": String(access.scanCount),
    },
  })
}
