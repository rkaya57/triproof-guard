import { NextResponse } from "next/server"

import { parseWalletCsv } from "@/lib/csv/parser"
import { decisionLegendForApi } from "@/lib/decision-labels"
import { getCurrentUser } from "@/lib/auth/session"
import { analyzeWallets } from "@/lib/risk-engine"
import { enrichWallets } from "@/lib/onchain/enrich-wallet"
import { getOnChainConfig, isEnrichableChain } from "@/lib/onchain/enrichment-types"
import type { EnrichmentSummary } from "@/lib/onchain/enrichment-types"
import { mergeEnrichment } from "@/lib/onchain/merge"
import { getOnChainProvider } from "@/lib/onchain/provider-router"
import { campaignTypes, supportedChains } from "@/lib/validators/wallet"
import type { AnalysisMode, CampaignType, Chain, EnrichmentMeta, ParsedWallet, RiskPolicy } from "@/types"

export const runtime = "nodejs"

const defaultWalletLimit = 25

type MiniAuditRequest = {
  walletInput?: unknown
  chain?: unknown
  campaignType?: unknown
  riskPolicy?: unknown
}

function miniAuditWalletLimit() {
  const parsed = Number(process.env.MINI_AUDIT_MAX_WALLETS ?? defaultWalletLimit)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(100, Math.floor(parsed)) : defaultWalletLimit
}

function normalizeChain(value: unknown): Chain {
  return supportedChains.includes(value as Chain) ? (value as Chain) : "Ethereum"
}

function normalizeCampaignType(value: unknown): CampaignType {
  return campaignTypes.includes(value as CampaignType) ? (value as CampaignType) : "Airdrop"
}

function normalizePolicy(value: unknown): RiskPolicy {
  if (value === "conservative" || value === "balanced" || value === "strict") return value
  return "strict"
}

function looksLikeCsvHeader(firstLine: string) {
  return /(^|[,;\t])\s*(wallet_address|wallet|address)\s*([,;\t]|$)/i.test(firstLine)
}

function parseWalletTokens(value: string) {
  return value
    .split(/[\n,;\t ]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function inputToCsv(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return "wallet_address\n"

  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? ""
  if (looksLikeCsvHeader(firstLine)) return trimmed

  return ["wallet_address", ...parseWalletTokens(trimmed)].join("\n")
}

function toEnrichmentMeta(summary: EnrichmentSummary, mode: AnalysisMode): EnrichmentMeta {
  return {
    mode,
    provider: summary.provider,
    enrichedCount: summary.enrichedCount,
    failedCount: summary.failedCount,
    skippedCount: summary.skippedCount,
    cacheHits: summary.cacheHits,
    usedMockFallback: summary.usedMockFallback,
    warnings: summary.warnings,
  }
}

function engineOnlyMeta(wallets: ParsedWallet[], warnings: string[]): EnrichmentMeta {
  return {
    mode: "csv_only",
    provider: "engine-only",
    enrichedCount: 0,
    failedCount: 0,
    skippedCount: wallets.length,
    cacheHits: 0,
    usedMockFallback: false,
    warnings,
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Login is required to run a Sybil audit." }, { status: 401 })

  let body: MiniAuditRequest

  try {
    body = (await request.json()) as MiniAuditRequest
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const chain = normalizeChain(body.chain)
  const campaignType = normalizeCampaignType(body.campaignType)
  const riskPolicy = normalizePolicy(body.riskPolicy)
  const walletInput = typeof body.walletInput === "string" ? body.walletInput : ""
  const limit = miniAuditWalletLimit()
  const parsedCsv = parseWalletCsv(inputToCsv(walletInput), chain)

  if (!parsedCsv.wallets.length) {
    return NextResponse.json(
      {
        error: "No valid wallets found",
        chain,
        campaignType,
        riskPolicy,
        parseSummary: {
          validWallets: 0,
          issues: parsedCsv.issues,
          duplicates: parsedCsv.duplicates,
          mode: parsedCsv.mode,
        },
      },
      { status: 400 }
    )
  }

  if (parsedCsv.wallets.length > limit) {
    return NextResponse.json(
      {
        error: `Mini audit accepts up to ${limit.toLocaleString()} valid wallets per run.`,
        limit,
        validWallets: parsedCsv.wallets.length,
      },
      { status: 413 }
    )
  }

  let walletsForEngine = parsedCsv.wallets
  let enrichment: EnrichmentMeta
  let engineMode: AnalysisMode = parsedCsv.mode === "enriched" ? "hybrid" : "csv_only"
  const warnings: string[] = []
  const config = getOnChainConfig()
  const canEnrich = config.enabled && isEnrichableChain(chain)
  const selection = canEnrich ? getOnChainProvider(chain) : null

  if (canEnrich && selection && !selection.usedMockFallback && selection.provider.id !== "mock") {
    try {
      const enriched = await enrichWallets({
        addresses: parsedCsv.wallets.map((wallet) => wallet.walletAddress),
        chain,
        mode: "onchain",
      })

      walletsForEngine = mergeEnrichment(parsedCsv.wallets, enriched.results, "onchain")
      enrichment = toEnrichmentMeta(enriched.summary, "onchain")
      engineMode = "onchain"
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `On-chain enrichment could not complete: ${error.message}`
          : "On-chain enrichment could not complete."
      )
      enrichment = engineOnlyMeta(parsedCsv.wallets, warnings)
    }
  } else {
    warnings.push(
      canEnrich
        ? `No configured on-chain provider was available for ${chain}; the public mini audit used the Guard decision engine without enrichment.`
        : `On-chain enrichment is not enabled or not supported for ${chain}; the public mini audit used the Guard decision engine without enrichment.`
    )
    enrichment = engineOnlyMeta(parsedCsv.wallets, warnings)
  }

  const result = analyzeWallets(walletsForEngine, enrichment, riskPolicy)

  return NextResponse.json({
    status: "completed",
    source: "tri-proof-risk-engine",
    chain,
    campaignType,
    riskPolicy,
    engineMode,
    limit,
    decisionLegend: decisionLegendForApi(),
    parseSummary: {
      mode: parsedCsv.mode,
      validWallets: parsedCsv.wallets.length,
      issues: parsedCsv.issues,
      duplicates: parsedCsv.duplicates,
    },
    result,
  })
}
