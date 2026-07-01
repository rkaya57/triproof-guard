import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { parseWalletCsv } from "@/lib/csv/parser"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { newAnalysisSchema, parseCampaignContracts } from "@/lib/validators/wallet"
import { getOnChainConfig, isEnrichableChain } from "@/lib/onchain/enrichment-types"
import { getOnChainProvider } from "@/lib/onchain/provider-router"
import { createAnalysisBatches } from "@/lib/analysis/batch-worker"
import { getAccessPassForUser } from "@/lib/billing/access-pass"
import type { AnalysisMode } from "@/types"
import type { Prisma } from "@prisma/client"

export const runtime = "nodejs"

const freeTrialWalletLimit = Number.parseInt(
  process.env.FREE_TRIAL_WALLET_LIMIT ?? "100",
  10
)

async function getUsedWalletCount(userId: string) {
  const result = await db.analysis.aggregate({
    _sum: { totalWallets: true },
    where: { project: { userId } },
  })

  return result._sum.totalWallets ?? 0
}

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
    message.includes("migration")
  )
}

export async function POST(request: Request) {
  try {
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
      analysisMode: formData.get("analysisMode") ?? "onchain",
      riskPolicy: formData.get("riskPolicy") ?? "balanced",
      campaignContracts: formData.get("campaignContracts") ?? "",
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

    try {
      const usedWallets = await getUsedWalletCount(user.id)
      const remainingWallets = Math.max(freeTrialWalletLimit - usedWallets, 0)
      const accessPass = await getAccessPassForUser(user.id)
      const paidAccessCoversUpload =
        accessPass !== null && accessPass.walletCredits >= parsedCsv.wallets.length

      if (parsedCsv.wallets.length > remainingWallets && !paidAccessCoversUpload) {
        return NextResponse.json(
          {
            code: "PAYMENT_REQUIRED",
            error: `Free trial includes ${freeTrialWalletLimit.toLocaleString()} wallets. This upload has ${parsedCsv.wallets.length.toLocaleString()} valid wallets, but you have ${remainingWallets.toLocaleString()} free wallets remaining. Please choose a paid USDC plan to continue.`,
            freeTrialWalletLimit,
            usedWallets,
            remainingWallets,
            requiredWallets: parsedCsv.wallets.length,
            checkoutUrl: checkoutUrl(parsedCsv.wallets.length, remainingWallets),
          },
          { status: 402 }
        )
      }
    } catch (error) {
      if (!isDatabaseConnectionError(error)) {
        throw error
      }
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

    if (parsedCsv.mode === "basic") {
      warnings.push(
        "Address-only CSV detected. Real on-chain enrichment will be used; CSV-only/basic scoring is disabled."
      )
    }

    if (campaignContracts.length) {
      warnings.push(`${campaignContracts.length.toLocaleString()} campaign address/program IDs will be used for campaign-action scoring.`)
    }

    warnings.push(`Risk policy preset: ${parsedForm.data.riskPolicy}.`)

    const projectName =
      parsedForm.data.projectName ||
      `${parsedForm.data.chain} ${parsedForm.data.campaignType} Wallet Audit`
    const notes = [
      parsedForm.data.notes || "",
      `TRIPROOF_RISK_POLICY=${parsedForm.data.riskPolicy}`,
      campaignContracts.length ? `TRIPROOF_CAMPAIGN_CONTRACTS=${campaignContracts.join(",")}` : "",
      parsedCsv.mode === "basic"
        ? "Address-only CSV detected. Real on-chain enrichment required; no synthetic CSV-only data will be generated."
        : "Enriched CSV uploaded. Hybrid/On-chain mode will use real provider data where needed.",
    ]
      .filter(Boolean)
      .join("\n")

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

    let batchCount = 0
    try {
      batchCount = await createAnalysisBatches(
        created.id,
        parsedCsv.wallets,
        config.batchSize
      )
    } catch (error) {
      const message = errorMessage(error)
      console.error("Analysis batch creation failed", error)
      return NextResponse.json(
        {
          error: isSchemaOrMigrationError(error)
            ? "Analysis was created, but the background queue table is not ready. Run Prisma migrations in Vercel/Postgres, then retry the analysis."
            : `Analysis was created, but queue creation failed: ${message}`,
          code: isSchemaOrMigrationError(error) ? "MIGRATION_REQUIRED" : "QUEUE_CREATE_FAILED",
          analysisId: created.id,
          details: message.slice(0, 500),
          migrationCommand: "npx prisma generate && npx prisma migrate deploy",
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      analysisId: created.id,
      status: "processing",
      batchCount,
      parseSummary: {
        mode: parsedCsv.mode,
        analysisMode: mode,
        riskPolicy: parsedForm.data.riskPolicy,
        validWallets: parsedCsv.wallets.length,
        issues: parsedCsv.issues,
        duplicates: parsedCsv.duplicates,
        warnings,
        note: `Real on-chain analysis queued in ${batchCount.toLocaleString()} batches using ${selection.provider.id}. Risk policy: ${parsedForm.data.riskPolicy}. No CSV-only or mock wallet history will be used.`,
      },
    })
  } catch (error) {
    const message = errorMessage(error)
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
