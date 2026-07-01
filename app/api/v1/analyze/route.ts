import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"

import { getV1ApiUser, apiError } from "@/lib/api/v1-auth"
import { getAccessPassForUser } from "@/lib/billing/access-pass"
import { createAnalysisBatches } from "@/lib/analysis/batch-worker"
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

async function getUsedWalletCount(userId: string) {
  const result = await db.analysis.aggregate({
    _sum: { totalWallets: true },
    where: { project: { userId } },
  })
  return result._sum.totalWallets ?? 0
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

  try {
    const usedWallets = await getUsedWalletCount(auth.user.id)
    const remainingWallets = Math.max(freeTrialWalletLimit - usedWallets, 0)
    const accessPass = await getAccessPassForUser(auth.user.id)
    const paidAccessCoversUpload = accessPass !== null && accessPass.walletCredits >= wallets.length

    if (wallets.length > remainingWallets && !paidAccessCoversUpload) {
      return NextResponse.json(
        {
          code: "PAYMENT_REQUIRED",
          error: "Wallet credit limit reached. Upgrade with USDC checkout before running this API analysis.",
          freeTrialWalletLimit,
          usedWallets,
          remainingWallets,
          requiredWallets: wallets.length,
          checkoutUrl: `/checkout?requiredWallets=${wallets.length}&reason=api_wallet_limit`,
        },
        { status: 402 }
      )
    }
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    return apiError("Database is required for API usage", 503)
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
      const project = await tx.project.create({
        data: {
          userId: auth.user.id,
          name: projectName || `${chain} ${campaignType} API Wallet Audit`,
          campaignType,
          chain,
          notes: notes || null,
        },
      })

      return tx.analysis.create({
        data: {
          projectId: project.id,
          status: "processing",
          totalWallets: wallets.length,
          csvFileName: "api-v1-json-upload.json",
          analysisMode,
          enrichmentStatus: "pending",
        },
      })
    })

    const batchCount = await createAnalysisBatches(created.id, wallets, config.batchSize)

    return NextResponse.json({
      analysisId: created.id,
      status: "processing",
      walletCount: wallets.length,
      batchCount,
      chain,
      campaignType,
      analysisMode,
      riskPolicy,
      provider: selection.provider.id,
      issues,
      statusUrl: `/api/v1/analysis/${created.id}`,
      dashboardUrl: `/dashboard/analysis/${created.id}`,
      exports: {
        approved: `/api/analysis/${created.id}/export?type=approved`,
        grayZone: `/api/analysis/${created.id}/export?type=manual_review`,
        rejectedNotEligible: `/api/analysis/${created.id}/export?type=rejected`,
        fullCsv: `/api/analysis/${created.id}/export?type=full`,
        pdf: `/api/analysis/${created.id}/export?type=pdf`,
      },
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return apiError("Database is required for API usage", 503)
    }
    throw error
  }
}
