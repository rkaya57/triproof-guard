import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"

import { parseApiWalletRows } from "@/lib/api/analysis-wallet-input"
import { getV1ApiUser, apiError } from "@/lib/api/v1-auth"
import { isAdminEmail } from "@/lib/auth/admin"
import { createAnalysisBatches } from "@/lib/analysis/batch-worker"
import { dispatchAnalysisWorker } from "@/lib/analysis/worker-dispatch"
import {
  commitAnalysisCreditDebit,
  isBillingCreditError,
  prepareAnalysisBillingGate,
} from "@/lib/billing/credits"
import { decisionLegendForApi } from "@/lib/decision-labels"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { getOnChainConfig, isEnrichableChain } from "@/lib/onchain/enrichment-types"
import { getOnChainProvider } from "@/lib/onchain/provider-router"
import {
  campaignTypes,
  parseCampaignContracts,
  supportedChains,
  riskPolicies,
} from "@/lib/validators/wallet"
import type { AnalysisMode, CampaignType, Chain, RiskPolicy } from "@/types"

export const runtime = "nodejs"

const freeTrialWalletLimit = Number.parseInt(process.env.FREE_TRIAL_WALLET_LIMIT ?? "100", 10)
const apiWalletLimit = Number.parseInt(process.env.TRIPROOF_API_MAX_WALLETS ?? "50000", 10)

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : null
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown API analysis error"
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
    message.includes("paymenttransaction") ||
    message.includes("creditledger") ||
    message.includes("migration")
  )
}

function normalizeCampaignType(value: unknown): CampaignType {
  return campaignTypes.includes(value as CampaignType) ? (value as CampaignType) : "Airdrop"
}

function normalizeChain(value: unknown): Chain | null {
  return supportedChains.includes(value as Chain) ? (value as Chain) : null
}

function normalizeAnalysisMode(value: unknown): AnalysisMode {
  return value === "hybrid" ? "hybrid" : "onchain"
}

function normalizeRiskPolicy(value: unknown): RiskPolicy {
  return riskPolicies.includes(value as RiskPolicy) ? (value as RiskPolicy) : "balanced"
}

export async function POST(request: Request) {
  const auth = await getV1ApiUser(request)
  if (auth.error) return auth.error

  const isAdmin = isAdminEmail(auth.user.email)

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return apiError("Invalid JSON body", 400)
  }

  const chain = normalizeChain(body.chain)
  if (!chain || !isEnrichableChain(chain)) {
    return apiError("Unsupported chain. Use Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, or Solana.", 400)
  }

  const campaignType = normalizeCampaignType(body.campaignType)
  const analysisMode = normalizeAnalysisMode(body.analysisMode)
  const riskPolicy = normalizeRiskPolicy(body.riskPolicy)
  const { wallets, issues } = parseApiWalletRows(body.wallets, chain)

  if (!wallets.length) {
    return apiError("No valid wallets supplied", 400, { issues })
  }

  if (wallets.length > apiWalletLimit) {
    return apiError(`API upload exceeds the ${apiWalletLimit.toLocaleString()} wallet limit`, 413)
  }

  const config = getOnChainConfig()
  if (!config.enabled) {
    return apiError("Real on-chain analysis is disabled", 400)
  }

  const selection = getOnChainProvider(chain)
  if (selection.usedMockFallback || selection.provider.id === "mock") {
    return apiError(`No real on-chain provider is configured for ${chain}`, 400)
  }

  const projectName = String(body.projectName ?? `${chain} ${campaignType} API Wallet Audit`).trim().slice(0, 120)
  const notesInput = typeof body.notes === "string" ? body.notes : ""
  const campaignContractsInput = Array.isArray(body.campaignContracts) ? body.campaignContracts.join("\n") : typeof body.campaignContracts === "string" ? body.campaignContracts : ""
  const campaignContracts = parseCampaignContracts([campaignContractsInput, notesInput].filter(Boolean).join("\n"))
  const notes = [
    notesInput,
    "TRIPROOF_API_SOURCE=v1",
    `TRIPROOF_RISK_POLICY=${riskPolicy}`,
    campaignContracts.length ? `TRIPROOF_CAMPAIGN_CONTRACTS=${campaignContracts.join(",")}` : "",
  ].filter(Boolean).join("\n")

  try {
    const created = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const billingGate = await prepareAnalysisBillingGate(tx, {
        userId: auth.user.id,
        walletCount: wallets.length,
        freeTrialWalletLimit,
        isAdmin,
      })

      const project = await tx.project.create({
        data: {
          userId: auth.user.id,
          name: projectName || `${chain} ${campaignType} API Wallet Audit`,
          campaignType,
          chain,
          notes: notes || null,
        },
      })

      const analysis = await tx.analysis.create({
        data: {
          projectId: project.id,
          status: "processing",
          totalWallets: wallets.length,
          csvFileName: "api-v1-json-upload.json",
          analysisMode,
          enrichmentStatus: "pending",
        },
      })

      await commitAnalysisCreditDebit(tx, {
        gate: billingGate,
        analysisId: analysis.id,
        metadata: {
          source: isAdmin ? "admin_api_v1_analysis" : "api_v1_analysis",
          walletCount: wallets.length,
          chain,
          campaignType,
          riskPolicy,
          freeTrialWalletLimit,
          remainingFreeWallets: billingGate.remainingFreeWallets,
        },
      })

      const batchCount = await createAnalysisBatches(
        analysis.id,
        wallets,
        config.batchSize,
        tx
      )

      return { analysis, batchCount, billingGate }
    })

    dispatchAnalysisWorker({ analysisId: created.analysis.id, reason: "api-v1-analyze" })

    return NextResponse.json({
      analysisId: created.analysis.id,
      status: "processing",
      walletCount: wallets.length,
      batchCount: created.batchCount,
      billing: {
        source: created.billingGate.source,
        creditsDeducted: created.billingGate.creditsToDeduct,
        creditBalance: created.billingGate.balanceAfter,
        remainingFreeWallets: created.billingGate.remainingFreeWallets,
      },
      chain,
      campaignType,
      analysisMode,
      riskPolicy,
      provider: selection.provider.id,
      issues,
      decisionLegend: decisionLegendForApi(),
      statusUrl: `/api/v1/analysis/${created.analysis.id}`,
      dashboardUrl: `/dashboard/analysis/${created.analysis.id}`,
      exports: {
        approved: `/api/analysis/${created.analysis.id}/export?type=approved`,
        grayZone: `/api/analysis/${created.analysis.id}/export?type=manual_review`,
        rejectedNotEligible: `/api/analysis/${created.analysis.id}/export?type=rejected`,
        fullCsv: `/api/analysis/${created.analysis.id}/export?type=full`,
        pdf: `/api/analysis/${created.analysis.id}/export?type=pdf`,
      },
    })
  } catch (error) {
    if (isBillingCreditError(error)) {
      const params = new URLSearchParams({
        requiredWallets: String(error.walletCount),
        remainingWallets: String(Math.max(error.remainingFreeWallets, 0)),
        reason: "api_wallet_limit",
      })

      return NextResponse.json(
        {
          code: error.code,
          error: "Analysis capacity reached. Choose or renew a paid USDC or SOL plan before running this API analysis.",
          freeTrialWalletLimit,
          remainingWallets: error.remainingFreeWallets,
          requiredWallets: error.walletCount,
          requiredCredits: error.requiredCredits,
          availableCredits: error.availableCredits,
          checkoutUrl: `/checkout?${params.toString()}`,
        },
        { status: 402 }
      )
    }

    if (isDatabaseConnectionError(error) || isSchemaOrMigrationError(error)) {
      return NextResponse.json(
        {
          error: "Database schema is not ready for API analysis creation. Run Prisma migrations, then redeploy.",
          code: "MIGRATION_REQUIRED",
          details: errorMessage(error).slice(0, 500),
          migrationCommand: "npx prisma generate && npx prisma migrate deploy",
        },
        { status: 503 }
      )
    }
    throw error
  }
}
