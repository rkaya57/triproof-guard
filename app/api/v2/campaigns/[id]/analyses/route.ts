import type { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { apiError, getApiUser } from "@/lib/api/auth"
import { createAnalysisBatches } from "@/lib/analysis/batch-worker"
import {
  analysisWalletBatchSize,
  highVolumeCapacityReport,
} from "@/lib/analysis/high-volume"
import { dispatchAnalysisWorker } from "@/lib/analysis/worker-dispatch"
import { isAdminEmail } from "@/lib/auth/admin"
import {
  commitAnalysisCreditDebit,
  isBillingCreditError,
  prepareAnalysisBillingGate,
} from "@/lib/billing/credits"
import { buildCampaignInputHash, persistNewCampaignAnalysis } from "@/lib/campaigns/persistence"
import { normalizeCampaignRunInput } from "@/lib/campaigns/intake"
import { loadCampaignRunContext } from "@/lib/campaigns/self-service"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { getOnChainConfig } from "@/lib/onchain/enrichment-types"
import { getOnChainProvider } from "@/lib/onchain/provider-router"

export const runtime = "nodejs"
export const maxDuration = 300

const freeTrialWalletLimit = Number.parseInt(process.env.FREE_TRIAL_WALLET_LIMIT ?? "100", 10)
const apiWalletLimit = Number.parseInt(process.env.TRIPROOF_API_MAX_WALLETS ?? "50000", 10)

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : null
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown campaign analysis error"
}

function isSchemaOrMigrationError(error: unknown) {
  const message = errorMessage(error).toLowerCase()
  const code = errorCode(error)
  return (
    code === "P2010" ||
    code === "P2021" ||
    code === "P2022" ||
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("column") ||
    message.includes("analysisbatch") ||
    message.includes("campaignanalysisrun") ||
    message.includes("campaignpolicy") ||
    message.includes("creditledger") ||
    message.includes("migration")
  )
}

function intakeStatus(code: string | null) {
  if (code === "WALLET_LIMIT_EXCEEDED") return 413
  if (code === "CAMPAIGN_PAUSED" || code === "CAMPAIGN_CLOSED" || code === "CAMPAIGN_POLICY_MISMATCH") return 409
  return 400
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getApiUser(request)
  if (auth.error) return auth.error
  const { id } = await context.params

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return apiError("Invalid JSON body", 400)
  }

  const campaignContext = await loadCampaignRunContext(id, auth.user.id)
  if (!campaignContext) return apiError("Campaign not found", 404)

  const normalized = normalizeCampaignRunInput(body, campaignContext.runContext, apiWalletLimit)
  if (!normalized.value) {
    return apiError(normalized.error, intakeStatus(normalized.code), { code: normalized.code })
  }

  const { wallets, issues, analysisMode } = normalized.value
  const chain = campaignContext.runContext.chain
  const riskPolicy = campaignContext.runContext.riskPolicy
  const config = getOnChainConfig()
  if (!config.enabled) return apiError("Real on-chain analysis is disabled", 503)

  const selection = getOnChainProvider(chain)
  if (selection.usedMockFallback || selection.provider.id === "mock") {
    return apiError(`No real on-chain provider is configured for ${chain}`, 503)
  }

  const capacity = highVolumeCapacityReport({
    chain,
    walletCount: wallets.length,
    deepHistory: false,
  })
  if (chain === "Solana" && wallets.length >= 1_000 && !capacity.configured) {
    return apiError(
      "High-volume Solana analysis requires HELIUS_API_KEY or a Helius SOLANA_RPC_URL. Mock or public RPC data is not accepted.",
      503,
      { capacity },
    )
  }
  const walletBatchSize = analysisWalletBatchSize({
    chain,
    walletCount: wallets.length,
    fallback: config.batchSize,
    deepHistory: false,
  })
  const inputHash = buildCampaignInputHash(wallets)
  const isAdmin = isAdminEmail(auth.user.email)

  try {
    const created = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const billingGate = await prepareAnalysisBillingGate(tx, {
        userId: auth.user.id,
        walletCount: wallets.length,
        freeTrialWalletLimit,
        isAdmin,
      })

      const analysis = await tx.analysis.create({
        data: {
          projectId: campaignContext.project.id,
          status: "processing",
          totalWallets: wallets.length,
          csvFileName: "api-v2-campaign-run.json",
          analysisMode,
          enrichmentStatus: "pending",
          enrichmentWarnings: [
            "Campaign-native API v2 run.",
            `Campaign policy: ${riskPolicy}.`,
            `Capacity profile: ${capacity.profile}.`,
            `Analysis batch size: ${walletBatchSize}.`,
            `Estimated provider requests: ${capacity.estimatedRequests}.`,
          ],
        },
      })

      const persisted = await persistNewCampaignAnalysis(tx, {
        project: campaignContext.project,
        analysis: { ...analysis, inputHash },
        riskPolicy,
      })

      if (campaignContext.runContext.lifecycle === "draft") {
        await tx.campaign.update({
          where: { id: persisted.campaign.id },
          data: { lifecycle: "active" },
        })
      }

      await commitAnalysisCreditDebit(tx, {
        gate: billingGate,
        analysisId: analysis.id,
        metadata: {
          source: isAdmin ? "admin_api_v2_campaign_run" : "api_v2_campaign_run",
          campaignId: campaignContext.project.id,
          walletCount: wallets.length,
          chain,
          campaignType: campaignContext.project.campaignType,
          riskPolicy,
          policyId: persisted.policy.id,
          policyVersion: persisted.policy.version,
          inputHash,
          capacity,
          walletBatchSize,
          freeTrialWalletLimit,
          remainingFreeWallets: billingGate.remainingFreeWallets,
        },
      })

      const batchCount = await createAnalysisBatches(
        analysis.id,
        wallets,
        walletBatchSize,
        tx,
      )

      return { analysis, persisted, batchCount, billingGate }
    })

    dispatchAnalysisWorker({ analysisId: created.analysis.id, reason: "api-v2-campaign-run" })

    return NextResponse.json({
      id: created.analysis.id,
      object: "analysis_run",
      apiVersion: "v2",
      campaignId: campaignContext.project.id,
      analysisId: created.analysis.id,
      status: "processing",
      walletCount: wallets.length,
      inputHash,
      batchCount: created.batchCount,
      walletBatchSize,
      chain,
      analysisMode,
      riskPolicy,
      policyId: created.persisted.policy.id,
      policyVersion: created.persisted.policy.version,
      provider: capacity.provider ?? selection.provider.id,
      capacity,
      issues,
      billing: {
        source: created.billingGate.source,
        creditsDeducted: created.billingGate.creditsToDeduct,
        creditBalance: created.billingGate.balanceAfter,
        remainingFreeWallets: created.billingGate.remainingFreeWallets,
      },
      links: {
        self: `/api/v2/campaigns/${campaignContext.project.id}/analyses/${created.analysis.id}`,
        campaign: `/api/v2/campaigns/${campaignContext.project.id}`,
        decisions: `/api/v2/campaigns/${campaignContext.project.id}/decisions`,
        dashboard: `/dashboard/analysis/${created.analysis.id}`,
      },
    }, {
      status: 202,
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    if (isBillingCreditError(error)) {
      return apiError(
        "Analysis capacity reached. Choose or renew a paid plan before starting this campaign run.",
        402,
        {
          code: error.code,
          freeTrialWalletLimit,
          remainingWallets: error.remainingFreeWallets,
          requiredWallets: error.walletCount,
          requiredCredits: error.requiredCredits,
          availableCredits: error.availableCredits,
          checkoutUrl: `/checkout?requiredWallets=${error.walletCount}&remainingWallets=${Math.max(error.remainingFreeWallets, 0)}&reason=api_v2_campaign_run`,
        },
      )
    }
    if (isDatabaseConnectionError(error) || isSchemaOrMigrationError(error)) {
      return apiError(
        "Database schema is not ready for campaign analysis. Run Prisma migrations, then redeploy.",
        503,
        {
          code: "MIGRATION_REQUIRED",
          details: errorMessage(error).slice(0, 500),
          migrationCommand: "npx prisma generate && npx prisma migrate deploy",
        },
      )
    }
    throw error
  }
}
