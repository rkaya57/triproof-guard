import { NextResponse } from "next/server"

import { isAdminEmail } from "@/lib/auth/admin"
import { getCurrentUser } from "@/lib/auth/session"
import { parseWalletCsv } from "@/lib/csv/parser"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { newAnalysisSchema, parseCampaignContracts } from "@/lib/validators/wallet"
import { getOnChainConfig, isEnrichableChain } from "@/lib/onchain/enrichment-types"
import { getOnChainProvider } from "@/lib/onchain/provider-router"
import { createAnalysisBatches } from "@/lib/analysis/batch-worker"
import { dispatchAnalysisWorker } from "@/lib/analysis/worker-dispatch"
import {
  analysisWalletBatchSize,
  highVolumeCapacityReport,
} from "@/lib/analysis/high-volume"
import {
  commitAnalysisCreditDebit,
  isBillingCreditError,
  prepareAnalysisBillingGate,
} from "@/lib/billing/credits"
import type { AnalysisMode } from "@/types"
import type { Prisma } from "@prisma/client"

export const runtime = "nodejs"

const freeTrialWalletLimit = Number.parseInt(
  process.env.FREE_TRIAL_WALLET_LIMIT ?? "100",
  10
)

function checkoutUrl(walletCount: number, remainingWallets: number) {
  const params = new URLSearchParams({
    requiredWallets: String(walletCount),
    remainingWallets: String(Math.max(remainingWallets, 0)),
    reason: "free_trial_limit",
  })

  return `/checkout?${params.toString()}`
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : null
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown analysis creation error"
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

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const isAdmin = isAdminEmail(user.email)

    const formData = await request.formData()
    const parsedForm = newAnalysisSchema.safeParse({
      projectName: formData.get("projectName"),
      campaignType: formData.get("campaignType"),
      chain: formData.get("chain"),
      notes: formData.get("notes") ?? "",
      analysisMode: formData.get("analysisMode") ?? "onchain",
      riskPolicy: formData.get("riskPolicy") ?? "balanced",
      campaignContracts: formData.get("campaignContracts") ?? "",
      deepHistory: formData.get("deepHistory") ?? false,
    })

    if (!parsedForm.success) {
      return NextResponse.json(
        { error: "Invalid analysis details", details: parsedForm.error.flatten() },
        { status: 400 }
      )
    }

    const campaignContracts = parseCampaignContracts(
      [parsedForm.data.campaignContracts, parsedForm.data.notes].filter(Boolean).join("\n")
    )
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
    const chainEnrichable = isEnrichableChain(parsedForm.data.chain)
    const warnings: string[] = []

    if (!config.enabled) {
      return NextResponse.json(
        { error: "Real on-chain analysis is disabled. Set ONCHAIN_ENRICHMENT_ENABLED=true in Vercel." },
        { status: 400 }
      )
    }

    if (!chainEnrichable) {
      return NextResponse.json(
        { error: `Real on-chain analysis is not available for ${parsedForm.data.chain}. Select Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, or Solana.` },
        { status: 400 }
      )
    }

    const selection = getOnChainProvider(parsedForm.data.chain)
    if (selection.usedMockFallback || selection.provider.id === "mock") {
      return NextResponse.json(
        {
          error:
            `No real on-chain provider is configured for ${parsedForm.data.chain}. Add HELIUS_API_KEY/SOLANA_RPC_URL for Solana or ETHERSCAN_API_KEY/ALCHEMY_API_KEY for EVM chains in Vercel before running analysis.`,
        },
        { status: 400 }
      )
    }

    const capacity = highVolumeCapacityReport({
      chain: parsedForm.data.chain,
      walletCount: parsedCsv.wallets.length,
      deepHistory: parsedForm.data.deepHistory,
    })
    const walletBatchSize = analysisWalletBatchSize({
      chain: parsedForm.data.chain,
      walletCount: parsedCsv.wallets.length,
      fallback: config.batchSize,
      deepHistory: parsedForm.data.deepHistory,
    })

    if (parsedCsv.mode === "basic") {
      warnings.push(
        "Address-only CSV detected. Real on-chain enrichment will be used; CSV-only/basic scoring is disabled."
      )
    }

    if (campaignContracts.length) {
      warnings.push(`${campaignContracts.length.toLocaleString()} campaign address/program IDs will be used for campaign-action scoring.`)
    }

    if (parsedForm.data.deepHistory) {
      warnings.push(
        "Deep Solana history is enabled. It is a final-audit mode: batches are intentionally smaller because each wallet may require paginated history."
      )
    }

    if (capacity.estimatedProviderMinutes !== null) {
      warnings.push(
        `Screening profile: ${capacity.profile}. Estimated provider time before cache hits: about ${capacity.estimatedProviderMinutes} minute(s).`
      )
    }

    warnings.push(`Risk policy preset: ${parsedForm.data.riskPolicy}.`)

    const projectName =
      parsedForm.data.projectName ||
      `${parsedForm.data.chain} ${parsedForm.data.campaignType} Wallet Audit`
    const notes = [
      parsedForm.data.notes || "",
      `TRIPROOF_RISK_POLICY=${parsedForm.data.riskPolicy}`,
      campaignContracts.length ? `TRIPROOF_CAMPAIGN_CONTRACTS=${campaignContracts.join(",")}` : "",
      parsedForm.data.deepHistory ? "TRIPROOF_DEEP_HISTORY=true" : "",
      `TRIPROOF_ANALYSIS_BATCH_SIZE=${walletBatchSize}`,
      `TRIPROOF_CAPACITY_PROFILE=${capacity.profile}`,
      parsedCsv.mode === "basic"
        ? "Address-only CSV detected. Real on-chain enrichment required; no synthetic CSV-only data will be generated."
        : "Enriched CSV uploaded. Hybrid/On-chain mode will use real provider data where needed.",
    ]
      .filter(Boolean)
      .join("\n")

    const created = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const billingGate = await prepareAnalysisBillingGate(tx, {
        userId: user.id,
        walletCount: parsedCsv.wallets.length,
        freeTrialWalletLimit,
        isAdmin,
      })

      const project = await tx.project.create({
        data: {
          userId: user.id,
          name: projectName,
          campaignType: parsedForm.data.campaignType,
          chain: parsedForm.data.chain,
          notes: notes || null,
        },
      })

      const analysis = await tx.analysis.create({
        data: {
          projectId: project.id,
          status: "processing",
          totalWallets: parsedCsv.wallets.length,
          csvFileName: file.name,
          analysisMode: mode,
          enrichmentStatus: "pending",
        },
      })

      await commitAnalysisCreditDebit(tx, {
        gate: billingGate,
        analysisId: analysis.id,
        metadata: {
          source: isAdmin ? "admin_dashboard_analysis" : "dashboard_analysis",
          walletCount: parsedCsv.wallets.length,
          fileName: file.name,
          chain: parsedForm.data.chain,
          campaignType: parsedForm.data.campaignType,
          capacity,
          walletBatchSize,
          freeTrialWalletLimit,
          remainingFreeWallets: billingGate.remainingFreeWallets,
        },
      })

      const batchCount = await createAnalysisBatches(
        analysis.id,
        parsedCsv.wallets,
        walletBatchSize,
        tx
      )

      return { analysis, batchCount, billingGate }
    })

    dispatchAnalysisWorker({ analysisId: created.analysis.id, reason: "dashboard-upload" })

    return NextResponse.json({
      analysisId: created.analysis.id,
      status: "processing",
      batchCount: created.batchCount,
      walletBatchSize,
      capacity,
      billing: {
        source: created.billingGate.source,
        creditsDeducted: created.billingGate.creditsToDeduct,
        creditBalance: created.billingGate.balanceAfter,
        remainingFreeWallets: created.billingGate.remainingFreeWallets,
      },
      parseSummary: {
        mode: parsedCsv.mode,
        analysisMode: mode,
        riskPolicy: parsedForm.data.riskPolicy,
        validWallets: parsedCsv.wallets.length,
        issues: parsedCsv.issues,
        duplicates: parsedCsv.duplicates,
        warnings,
        note: `Real on-chain analysis queued in ${created.batchCount.toLocaleString()} batches using ${capacity.provider ?? selection.provider.id}. Risk policy: ${parsedForm.data.riskPolicy}. No CSV-only or mock wallet history will be used.`,
      },
    })
  } catch (error) {
    const message = errorMessage(error)

    if (isBillingCreditError(error)) {
      return NextResponse.json(
        {
          code: error.code,
          error: `Free trial includes ${freeTrialWalletLimit.toLocaleString()} wallets. This upload needs ${error.requiredCredits.toLocaleString()} wallet capacity, but your available paid capacity is ${error.availableCredits.toLocaleString()}. Choose or renew a paid USDC or SOL plan to continue.`,
          freeTrialWalletLimit,
          remainingWallets: error.remainingFreeWallets,
          requiredWallets: error.walletCount,
          requiredCredits: error.requiredCredits,
          availableCredits: error.availableCredits,
          checkoutUrl: checkoutUrl(error.walletCount, error.remainingFreeWallets),
        },
        { status: 402 }
      )
    }

    console.error("Analysis creation failed", error)

    if (isDatabaseConnectionError(error) || isSchemaOrMigrationError(error)) {
      return NextResponse.json(
        {
          error: "Database schema is not ready for analysis creation. Run Prisma migrations, then redeploy.",
          code: "MIGRATION_REQUIRED",
          details: message.slice(0, 500),
          migrationCommand: "npx prisma generate && npx prisma migrate deploy",
        },
        { status: 503 }
      )
    }

    return NextResponse.json(
      {
        error: `Analysis could not be created: ${message.slice(0, 300)}`,
        code: "ANALYSIS_CREATE_FAILED",
      },
      { status: 500 }
    )
  }
}
