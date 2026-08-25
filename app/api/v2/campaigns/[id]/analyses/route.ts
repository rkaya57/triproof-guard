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
import { normalizeCampaignRunInput } from "@/lib/campaigns/intake"
import { buildCampaignInputHash, persistNewCampaignAnalysis } from "@/lib/campaigns/persistence"
import { loadCampaignRunContext } from "@/lib/campaigns/self-service"
import { parseWalletCsv } from "@/lib/csv/parser"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { getOnChainConfig } from "@/lib/onchain/enrichment-types"
import { getOnChainProvider } from "@/lib/onchain/provider-router"
import type { Chain } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 300

const freeTrialWalletLimit = Number.parseInt(process.env.FREE_TRIAL_WALLET_LIMIT ?? "100", 10)
const apiWalletLimit = Number.parseInt(process.env.TRIPROOF_API_MAX_WALLETS ?? "50000", 10)

type CampaignRunRequestInput = {
  body: Record<string, unknown>
  inputFormat: "json" | "csv"
  sourceFileName: string
  intakeIssues: string[]
  duplicateIssues: string[]
}

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

function csvIssueText(value: unknown) {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return String(value)
  const item = value as { row?: unknown; issue?: unknown }
  const row = typeof item.row === "number" ? `row ${item.row}: ` : ""
  return `${row}${String(item.issue ?? "CSV input issue")}`
}

async function parseCampaignRunRequest(request: Request, chain: Chain): Promise<CampaignRunRequestInput | null> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? ""
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData()
    const file = formData.get("csvFile")
    if (!(file instanceof File) || file.size === 0) return null

    const parsed = parseWalletCsv(await file.text(), chain)
    return {
      body: {
        wallets: parsed.wallets,
        analysisMode: formData.get("analysisMode") ?? "onchain",
        riskPolicy: formData.get("riskPolicy") ?? undefined,
      },
      inputFormat: "csv",
      sourceFileName: file.name.slice(0, 255) || "campaign-wallets.csv",
      intakeIssues: parsed.issues.map(csvIssueText),
      duplicateIssues: parsed.duplicates.map(csvIssueText),
    }
  }

  try {
    return {
      body: (await request.json()) as Record<string, unknown>,
      inputFormat: "json",
      sourceFileName: "api-v2-campaign-run.json",
      intakeIssues: [],
      duplicateIssues: [],
    }
  } catch {
    return null
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getApiUser(request)
  if (auth.error) return auth.error
  const { id } = await context.params

  const campaignContext = await loadCampaignRunContext(id, auth.user.id)
  if (!campaignContext) return apiError("Campaign not found", 404)

  const chain = campaignContext.runContext.chain as Chain
  const parsedRequest = await parseCampaignRunRequest(request, chain)
  if (!parsedRequest) {
    return apiError(
      "Invalid analysis input. Send JSON wallets or multipart/form-data with csvFile.",
      400,
      { code: "INVALID_ANALYSIS_INPUT" },
    )
  }

  const normalized = normalizeCampaignRunInput(parsedRequest.body, campaignContext.runContext, apiWalletLimit)
  if (!normalized.value) {
    return apiError(normalized.error, intakeStatus(normalized.code), {
      code: normalized.code,
      issues: parsedRequest.intakeIssues,
      duplicates: parsedRequest.duplicateIssues,
    })
  }

  const { wallets, analysisMode } = normalized.value
  const issues = [...parsedRequest.intakeIssues, ...normalized.value.issues]
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
          csvFileName: parsedRequest.sourceFileName,
          analysisMode,
          enrichmentStatus: "pending",
          enrichmentWarnings: [
            "Campaign-native API v2 run.",
            `Input format: ${parsedRequest.inputFormat}.`,
            `Campaign policy: ${riskPolicy}.`,
            `Capacity profile: ${capacity.profile}.`,
            `Analysis batch size: ${walletBatchSize}.`,
            `Estimated provider requests: ${capacity.estimatedRequests}.`,
            ...(parsedRequest.duplicateIssues.length
              ? [`CSV duplicates ignored: ${parsedRequest.duplicateIssues.length}.`]
              : []),
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
          inputFormat: parsedRequest.inputFormat,
          sourceFileName: parsedRequest.sourceFileName,
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
      inputFormat: parsedRequest.inputFormat,
      sourceFileName: parsedRequest.sourceFileName,
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
      duplicates: parsedRequest.duplicateIssues,
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
