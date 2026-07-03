import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"

import { getV1ApiUser, apiError } from "@/lib/api/v1-auth"
import { createAnalysisBatches } from "@/lib/analysis/batch-worker"
import { dispatchAnalysisWorker } from "@/lib/analysis/worker-dispatch"
import {
  commitAnalysisCreditDebit,
  isBillingCreditError,
  prepareAnalysisBillingGate,
} from "@/lib/billing/credits"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { getOnChainConfig, isEnrichableChain } from "@/lib/onchain/enrichment-types"
import { getOnChainProvider } from "@/lib/onchain/provider-router"
import {
  campaignTypes,
  isValidWalletAddress,
  normalizeWalletAddress,
  parseCampaignContracts,
  supportedChains,
  riskPolicies,
} from "@/lib/validators/wallet"
import type { AnalysisMode, CampaignType, Chain, ParsedWallet, RiskPolicy } from "@/types"

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

function walletRows(input: unknown, chain: Chain): { wallets: ParsedWallet[]; issues: string[] } {
  const values = Array.isArray(input) ? input : []
  const seen = new Set<string>()
  const wallets: ParsedWallet[] = []
  const issues: string[] = []

  values.forEach((item, index) => {
    const rawAddress = typeof item === "string" ? item : typeof item === "object" && item !== null ? String((item as { wallet?: unknown; walletAddress?: unknown; address?: unknown }).wallet ?? (item as { walletAddress?: unknown }).walletAddress ?? (item as { address?: unknown }).address ?? "") : ""
    const policyAction = typeof item === "object" && item !== null ? String((item as { policyAction?: unknown; policy_action?: unknown }).policyAction ?? (item as { policy_action?: unknown }).policy_action ?? "") : ""
    const reputationLabel = typeof item === "object" && item !== null ? String((item as { reputationLabel?: unknown; reputation_label?: unknown }).reputationLabel ?? (item as { reputation_label?: unknown }).reputation_label ?? "") : ""
    const policyReason = typeof item === "object" && item !== null ? String((item as { policyReason?: unknown; policy_reason?: unknown }).policyReason ?? (item as { policy_reason?: unknown }).policy_reason ?? "") : ""

    if (!rawAddress.trim()) {
      issues.push(`wallets[${index}] is missing an address`)
      return
    }

    if (!isValidWalletAddress(rawAddress, chain)) {
      issues.push(`wallets[${index}] is not a valid ${chain} address`)
      return
    }

    const normalized = normalizeWalletAddress(rawAddress, chain)
    const key = `${chain}:${normalized}`
    if (seen.has(key)) return
    seen.add(key)

    wallets.push({
      walletAddress: normalized,
      chain,
      txCount: null,
      walletAgeDays: null,
      fundingSource: null,
      firstSeen: null,
      lastSeen: null,
      totalVolume: null,
      contractsCount: null,
      campaignActionsCount: null,
      policyAction: policyAction === "approve" || policyAction === "manual_review" || policyAction === "reject" ? policyAction : null,
      reputationLabel: reputationLabel.trim() || null,
      policyReason: policyReason.trim() || null,
      customerLabel: reputationLabel.trim() || null,
      sourceRow: index + 1,
    })
  })

  return { wallets, issues }
}

export async function POST(request: Request) {
  const auth = await getV1ApiUser(request)
  if (auth.error) return auth.error

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
  const { wallets, issues } = walletRows(body.wallets, chain)

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
          source: "api_v1_analysis",
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
          error: "Wallet credit limit reached. Add persistent USDC wallet credits before running this API analysis.",
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
