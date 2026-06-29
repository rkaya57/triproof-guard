import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { parseWalletCsv } from "@/lib/csv/parser"
import { saveDevAnalysis } from "@/lib/dev-store/store"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { analyzeWallets } from "@/lib/risk-engine"
import { newAnalysisSchema } from "@/lib/validators/wallet"
import { getOnChainConfig, isEnrichableChain } from "@/lib/onchain/enrichment-types"
import { createAnalysisBatches } from "@/lib/analysis/batch-worker"
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
  const wantsEnrichment = mode === "onchain" || mode === "hybrid"
  const chainEnrichable = isEnrichableChain(parsedForm.data.chain)
  const projectName =
    parsedForm.data.projectName ||
    `${parsedForm.data.chain} ${parsedForm.data.campaignType} Wallet Audit`
  const notes = [
    parsedForm.data.notes || "",
    parsedCsv.mode === "basic" ? "Basic CSV used, limited analysis mode" : "",
  ]
    .filter(Boolean)
    .join("\n")

  if (wantsEnrichment && config.enabled && chainEnrichable) {
    try {
      const created = await db.$transaction(async (tx: Prisma.TransactionClient) => {
        const project = await tx.project.create({
          data: {
            userId: user.id,
            name: projectName,
            campaignType: parsedForm.data.campaignType,
            chain: parsedForm.data.chain,
            notes: notes || null,
          },
        })

        return tx.analysis.create({
          data: {
            projectId: project.id,
            status: "processing",
            totalWallets: parsedCsv.wallets.length,
            csvFileName: file.name,
            analysisMode: mode,
            enrichmentStatus: "pending",
          },
        })
      })

      const batchCount = await createAnalysisBatches(
        created.id,
        parsedCsv.wallets,
        config.batchSize
      )

      return NextResponse.json({
        analysisId: created.id,
        status: "processing",
        batchCount,
        parseSummary: {
          mode: parsedCsv.mode,
          analysisMode: mode,
          validWallets: parsedCsv.wallets.length,
          issues: parsedCsv.issues,
          duplicates: parsedCsv.duplicates,
          warnings,
          note: `On-chain analysis queued in ${batchCount.toLocaleString()} batches. Report will update when processing completes.`,
        },
      })
    } catch (error) {
      if (isDatabaseConnectionError(error)) {
        return NextResponse.json(
          { error: "Database is required for background on-chain processing." },
          { status: 503 }
        )
      }
      throw error
    }
  }

  if (wantsEnrichment && !chainEnrichable) {
    warnings.push(
      `On-chain enrichment is not available for ${parsedForm.data.chain} yet. CSV Only analysis was used.`
    )
  } else if (wantsEnrichment && !config.enabled) {
    warnings.push("On-chain enrichment is disabled. CSV Only analysis was used.")
  }

  const enrichmentMeta: EnrichmentMeta | null = null
  const result = analyzeWallets(parsedCsv.wallets, enrichmentMeta)
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
    status: "completed",
    parseSummary: {
      mode: parsedCsv.mode,
      analysisMode: mode,
      validWallets: parsedCsv.wallets.length,
      issues: parsedCsv.issues,
      duplicates: parsedCsv.duplicates,
      warnings,
      note:
        parsedCsv.mode === "basic"
          ? "Basic CSV used, limited analysis mode"
          : "Enriched CSV used",
    },
  })
}
