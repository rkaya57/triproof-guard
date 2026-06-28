import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { parseWalletCsv } from "@/lib/csv/parser"
import { saveDevAnalysis } from "@/lib/dev-store/store"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { analyzeWallets } from "@/lib/risk-engine"
import {
  newAnalysisSchema,
  parseCampaignContracts,
} from "@/lib/validators/wallet"
import {
  getOnChainConfig,
  isEnrichableChain,
} from "@/lib/onchain/enrichment-types"
import { enrichWallets } from "@/lib/onchain/enrich-wallet"
import { mergeEnrichment } from "@/lib/onchain/merge"
import type { AnalysisMode, EnrichmentMeta } from "@/types"
import type { Prisma } from "@prisma/client"

export const runtime = "nodejs"

function toDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export async function POST(request: Request) {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await request.formData()
  const parsedForm = newAnalysisSchema.safeParse({
    projectName: formData.get("projectName"),
    campaignType: formData.get("campaignType"),
    chain: formData.get("chain"),
    notes: formData.get("notes") ?? "",
    analysisMode: formData.get("analysisMode") ?? "csv_only",
    campaignContracts: formData.get("campaignContracts") ?? "",
  })

  if (!parsedForm.success) {
    return NextResponse.json(
      { error: "Invalid analysis details", details: parsedForm.error.flatten() },
      { status: 400 }
    )
  }

  const file = formData.get("csvFile")
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "CSV file is required" }, { status: 400 })
  }

  const parsedCsv = parseWalletCsv(await file.text(), parsedForm.data.chain)

  if (!parsedCsv.wallets.length) {
    return NextResponse.json(
      {
        error: "No valid wallets found in CSV",
        issues: parsedCsv.issues,
        duplicates: parsedCsv.duplicates,
      },
      { status: 400 }
    )
  }

  const mode = parsedForm.data.analysisMode as AnalysisMode
  const config = getOnChainConfig()
  const warnings: string[] = []

  // Decide whether on-chain enrichment runs for this request.
  const wantsEnrichment = mode === "onchain" || mode === "hybrid"
  const chainEnrichable = isEnrichableChain(parsedForm.data.chain)

  // Enforce the on-chain wallet cap (free/demo vs authenticated).
  if (wantsEnrichment && config.enabled && chainEnrichable) {
    const maxWallets = config.maxWalletsPerAnalysis
    if (parsedCsv.wallets.length > maxWallets) {
      return NextResponse.json(
        {
          error: `On-chain enrichment is limited to ${maxWallets.toLocaleString()} wallets in this MVP. Please reduce the file size or use CSV Only mode.`,
        },
        { status: 400 }
      )
    }
  }

  let walletsForAnalysis = parsedCsv.wallets
  let enrichmentMeta: EnrichmentMeta | null = null

  if (wantsEnrichment && config.enabled && chainEnrichable) {
    const campaignContracts = parseCampaignContracts(
      parsedForm.data.campaignContracts ?? ""
    )

    const { results, summary } = await enrichWallets({
      addresses: parsedCsv.wallets.map((wallet) => wallet.walletAddress),
      chain: parsedForm.data.chain,
      mode,
      options: { campaignContracts },
    })

    walletsForAnalysis = mergeEnrichment(parsedCsv.wallets, results, mode)
    enrichmentMeta = summary
    warnings.push(...summary.warnings)
  } else if (wantsEnrichment && !chainEnrichable) {
    warnings.push(
      `On-chain enrichment is not available for ${parsedForm.data.chain} yet. CSV Only analysis was used.`
    )
  } else if (wantsEnrichment && !config.enabled) {
    warnings.push("On-chain enrichment is disabled. CSV Only analysis was used.")
  }

  const result = analyzeWallets(walletsForAnalysis, enrichmentMeta)
  const projectName =
    parsedForm.data.projectName ||
    `${parsedForm.data.chain} ${parsedForm.data.campaignType} Wallet Audit`

  const notes = [
    parsedForm.data.notes || "",
    parsedCsv.mode === "basic" ? "Basic CSV used, limited analysis mode" : "",
  ]
    .filter(Boolean)
    .join("\n")

  let analysis: { id: string }

  try {
    analysis = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const project = await tx.project.create({
        data: {
          userId: user.id,
          name: projectName,
          campaignType: parsedForm.data.campaignType,
          chain: parsedForm.data.chain,
          notes: notes || null,
        },
      })

      const createdAnalysis = await tx.analysis.create({
        data: {
          projectId: project.id,
          status: "completed",
          totalWallets: result.totalWallets,
          approvedCount: result.approvedCount,
          manualReviewCount: result.manualReviewCount,
          rejectedCount: result.rejectedCount,
          averageRiskScore: result.averageRiskScore,
          suspiciousClustersCount: result.clusters.length,
          csvFileName: file.name,
          analysisMode: mode,
          enrichmentStatus: enrichmentMeta ? "completed" : null,
          enrichmentProvider: enrichmentMeta?.provider ?? null,
          enrichedWalletCount: enrichmentMeta?.enrichedCount ?? 0,
          failedEnrichmentCount: enrichmentMeta?.failedCount ?? 0,
          cacheHitCount: enrichmentMeta?.cacheHits ?? 0,
          usedMockFallback: enrichmentMeta?.usedMockFallback ?? false,
          enrichmentWarnings: enrichmentMeta?.warnings ?? [],
          enrichedAt: enrichmentMeta ? new Date() : null,
          completedAt: new Date(),
        },
      })

      await tx.walletAnalysis.createMany({
        data: result.wallets.map((wallet) => ({
          analysisId: createdAnalysis.id,
          walletAddress: wallet.walletAddress,
          chain: wallet.chain,
          entityLabel: wallet.entityLabel,
          entityType: wallet.entityType,
          entityRiskReason: wallet.entityRiskReason,
          riskScore: wallet.riskScore,
          riskLevel: wallet.riskLevel,
          status: wallet.status,
          recommendedAction: wallet.recommendedAction,
          statusExplanation: wallet.statusExplanation,
          fundingSource: wallet.fundingSource,
          txCount: wallet.txCount,
          walletAgeDays: wallet.walletAgeDays,
          totalVolume: wallet.totalVolume,
          contractsCount: wallet.contractsCount,
          campaignActionsCount: wallet.campaignActionsCount,
          clusterId: wallet.clusterId,
          reasons: wallet.reasons,
          firstSeen: toDate(wallet.firstSeen),
          lastSeen: toDate(wallet.lastSeen),
          nativeBalance: wallet.nativeBalance ?? null,
          tokenCount: wallet.tokenCount ?? null,
          uniqueCounterparties: wallet.uniqueCounterparties ?? null,
          lastActiveDaysAgo: wallet.lastActiveDaysAgo ?? null,
          isContract: wallet.isContract ?? null,
          enrichmentProvider: wallet.enrichmentProvider ?? null,
          enrichmentStatus: wallet.enrichmentStatus ?? null,
        })),
      })

      if (enrichmentMeta) {
        await tx.walletEnrichment.createMany({
          data: result.wallets.map((wallet) => ({
            analysisId: createdAnalysis.id,
            walletAddress: wallet.walletAddress,
            chain: wallet.chain,
            provider: wallet.enrichmentProvider ?? enrichmentMeta!.provider,
            txCount: wallet.txCount,
            walletAgeDays: wallet.walletAgeDays,
            firstSeen: toDate(wallet.firstSeen),
            lastSeen: toDate(wallet.lastSeen),
            totalVolume: wallet.totalVolume,
            nativeBalance: wallet.nativeBalance ?? null,
            tokenCount: wallet.tokenCount ?? null,
            contractsCount: wallet.contractsCount,
            campaignActionsCount: wallet.campaignActionsCount,
            uniqueCounterparties: wallet.uniqueCounterparties ?? null,
            fundingSource: wallet.fundingSource,
            isContract: wallet.isContract ?? null,
            knownEntityLabel: wallet.entityLabel,
            knownEntityType: wallet.entityType,
            enrichmentStatus: wallet.enrichmentStatus ?? "completed",
          })),
        })
      }

      if (result.clusters.length) {
        await tx.cluster.createMany({
          data: result.clusters.map((cluster) => ({
            analysisId: createdAnalysis.id,
            clusterLabel: cluster.clusterLabel,
            walletCount: cluster.walletCount,
            averageRiskScore: cluster.averageRiskScore,
            sharedFundingSource: cluster.sharedFundingSource,
            behaviorSimilarityScore: cluster.behaviorSimilarityScore,
            suggestedAction: cluster.suggestedAction,
            reasons: cluster.reasons,
          })),
        })
      }

      return createdAnalysis
    })
  } catch (error) {
    if (!isDatabaseConnectionError(error)) {
      throw error
    }

    analysis = await saveDevAnalysis({
      userId: user.id,
      projectName,
      campaignType: parsedForm.data.campaignType,
      chain: parsedForm.data.chain,
      notes: notes || null,
      csvFileName: file.name,
      analysisMode: mode,
      result,
    })
  }

  return NextResponse.json({
    analysisId: analysis.id,
    parseSummary: {
      mode: parsedCsv.mode,
      analysisMode: mode,
      validWallets: parsedCsv.wallets.length,
      issues: parsedCsv.issues,
      duplicates: parsedCsv.duplicates,
      enrichment: enrichmentMeta,
      warnings,
      note: enrichmentMeta
        ? `On-chain enrichment completed via ${enrichmentMeta.provider} provider`
        : parsedCsv.mode === "basic"
          ? "Basic CSV used, limited analysis mode"
          : "Enriched CSV used",
    },
  })
}
