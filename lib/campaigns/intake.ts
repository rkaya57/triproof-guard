import { parseApiWalletRows } from "@/lib/api/analysis-wallet-input"
import { CAMPAIGN_LIFECYCLES, type CampaignLifecycle } from "@/lib/campaigns/model"
import { isEnrichableChain } from "@/lib/onchain/enrichment-types"
import {
  analysisModes,
  campaignTypes,
  parseCampaignContracts,
  riskPolicies,
  supportedChains,
} from "@/lib/validators/wallet"
import type { AnalysisMode, CampaignType, Chain, ParsedWallet, RiskPolicy } from "@/types"

export const CAMPAIGN_INTAKE_SCHEMA_VERSION = "tri-proof-campaign-intake-v2" as const
export const API_V2_MAX_CAMPAIGN_NAME = 120
export const API_V2_MAX_CAMPAIGN_NOTES = 2000
export const API_V2_MAX_METADATA_KEYS = 50

export type CampaignCreateInput = {
  name: string
  campaignType: CampaignType
  chain: Chain
  riskPolicy: RiskPolicy
  lifecycle: CampaignLifecycle
  notes: string
  campaignContracts: string[]
  startsAt: Date | null
  endsAt: Date | null
  rewardPoolUsd: number | null
  metadata: Record<string, unknown> | null
}

export type CampaignRunInput = {
  analysisMode: AnalysisMode
  wallets: ParsedWallet[]
  issues: string[]
  requestedRiskPolicy: RiskPolicy | null
}

export type CampaignRunContext = {
  id: string
  chain: string
  lifecycle: CampaignLifecycle
  riskPolicy: RiskPolicy
}

export type IntakeResult<T> =
  | { value: T; error: null; code: null }
  | { value: null; error: string; code: string }

function ok<T>(value: T): IntakeResult<T> {
  return { value, error: null, code: null }
}

function fail<T>(error: string, code: string): IntakeResult<T> {
  return { value: null, error, code }
}

function normalizeCampaignType(value: unknown): CampaignType {
  return campaignTypes.includes(value as CampaignType) ? (value as CampaignType) : "Airdrop"
}

function normalizeChain(value: unknown): Chain | null {
  return supportedChains.includes(value as Chain) ? (value as Chain) : null
}

function normalizeRiskPolicy(value: unknown): RiskPolicy {
  return riskPolicies.includes(value as RiskPolicy) ? (value as RiskPolicy) : "balanced"
}

function normalizeOptionalRiskPolicy(value: unknown): RiskPolicy | null {
  if (value === null || value === undefined || value === "") return null
  return riskPolicies.includes(value as RiskPolicy) ? (value as RiskPolicy) : null
}

function normalizeAnalysisMode(value: unknown): AnalysisMode {
  return analysisModes.includes(value as (typeof analysisModes)[number])
    ? (value as AnalysisMode)
    : "onchain"
}

function normalizeLifecycle(value: unknown): CampaignLifecycle {
  return CAMPAIGN_LIFECYCLES.includes(value as CampaignLifecycle)
    ? (value as CampaignLifecycle)
    : "draft"
}

function normalizeDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const parsed = new Date(String(value))
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function normalizeRewardPoolUsd(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000_000_000) return Number.NaN
  return Math.round(parsed * 1_000_000) / 1_000_000
}

function normalizeMetadata(value: unknown): Record<string, unknown> | null | "invalid" {
  if (value === null || value === undefined) return null
  if (!value || typeof value !== "object" || Array.isArray(value)) return "invalid"
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length > API_V2_MAX_METADATA_KEYS) return "invalid"
  return Object.fromEntries(entries.map(([key, nested]) => [key.slice(0, 80), nested]))
}

export function normalizeCampaignCreateInput(input: Record<string, unknown>): IntakeResult<CampaignCreateInput> {
  const name = String(input.name ?? input.projectName ?? "").trim()
  if (name.length < 2 || name.length > API_V2_MAX_CAMPAIGN_NAME) {
    return fail(`name must contain 2-${API_V2_MAX_CAMPAIGN_NAME} characters`, "INVALID_CAMPAIGN_NAME")
  }

  const chain = normalizeChain(input.chain)
  if (!chain || !isEnrichableChain(chain)) {
    return fail(
      "Unsupported campaign chain. Use Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, or Solana.",
      "UNSUPPORTED_CHAIN",
    )
  }

  const notes = typeof input.notes === "string" ? input.notes.trim() : ""
  if (notes.length > API_V2_MAX_CAMPAIGN_NOTES) {
    return fail(`notes must be ${API_V2_MAX_CAMPAIGN_NOTES} characters or fewer`, "INVALID_NOTES")
  }

  const contractsInput = Array.isArray(input.campaignContracts)
    ? input.campaignContracts.join("\n")
    : typeof input.campaignContracts === "string"
      ? input.campaignContracts
      : ""
  const campaignContracts = parseCampaignContracts(contractsInput)

  const startsAt = normalizeDate(input.startsAt)
  if (input.startsAt && !startsAt) return fail("startsAt must be a valid date", "INVALID_DATE_WINDOW")
  const endsAt = normalizeDate(input.endsAt)
  if (input.endsAt && !endsAt) return fail("endsAt must be a valid date", "INVALID_DATE_WINDOW")
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    return fail("endsAt must be later than startsAt", "INVALID_DATE_WINDOW")
  }

  const rewardPoolUsd = normalizeRewardPoolUsd(input.rewardPoolUsd)
  if (Number.isNaN(rewardPoolUsd)) {
    return fail("rewardPoolUsd must be between 0 and 1,000,000,000,000", "INVALID_REWARD_POOL")
  }

  const metadata = normalizeMetadata(input.metadata)
  if (metadata === "invalid") {
    return fail(`metadata must be an object with at most ${API_V2_MAX_METADATA_KEYS} top-level keys`, "INVALID_METADATA")
  }

  return ok({
    name,
    campaignType: normalizeCampaignType(input.campaignType),
    chain,
    riskPolicy: normalizeRiskPolicy(input.riskPolicy),
    lifecycle: normalizeLifecycle(input.lifecycle),
    notes,
    campaignContracts,
    startsAt,
    endsAt,
    rewardPoolUsd,
    metadata,
  })
}

export function campaignProjectNotes(input: Pick<CampaignCreateInput, "notes" | "riskPolicy" | "campaignContracts">) {
  return [
    input.notes,
    "TRIPROOF_API_SOURCE=v2-campaign",
    `TRIPROOF_RISK_POLICY=${input.riskPolicy}`,
    input.campaignContracts.length
      ? `TRIPROOF_CAMPAIGN_CONTRACTS=${input.campaignContracts.join(",")}`
      : "",
  ].filter(Boolean).join("\n")
}

export function normalizeCampaignRunInput(
  input: Record<string, unknown>,
  campaign: CampaignRunContext,
  walletLimit: number,
): IntakeResult<CampaignRunInput> {
  if (campaign.lifecycle === "paused") {
    return fail("Campaign is paused. Resume it before starting another analysis run.", "CAMPAIGN_PAUSED")
  }
  if (campaign.lifecycle === "completed" || campaign.lifecycle === "archived") {
    return fail(`Campaign lifecycle ${campaign.lifecycle} does not accept new analysis runs.`, "CAMPAIGN_CLOSED")
  }

  const chain = normalizeChain(campaign.chain)
  if (!chain || !isEnrichableChain(chain)) {
    return fail("Campaign chain is not available for real on-chain analysis.", "UNSUPPORTED_CHAIN")
  }

  const requestedRiskPolicy = normalizeOptionalRiskPolicy(input.riskPolicy)
  if (input.riskPolicy !== undefined && input.riskPolicy !== null && input.riskPolicy !== "" && !requestedRiskPolicy) {
    return fail("riskPolicy must be conservative, balanced, or strict", "INVALID_RISK_POLICY")
  }
  if (requestedRiskPolicy && requestedRiskPolicy !== campaign.riskPolicy) {
    return fail(
      `Campaign policy is ${campaign.riskPolicy}. Create a versioned campaign policy change before using ${requestedRiskPolicy}.`,
      "CAMPAIGN_POLICY_MISMATCH",
    )
  }

  const { wallets, issues } = parseApiWalletRows(input.wallets, chain)
  if (!wallets.length) return fail("No valid wallets supplied", "NO_VALID_WALLETS")
  if (wallets.length > walletLimit) {
    return fail(`Wallet upload exceeds the ${walletLimit.toLocaleString()} wallet limit`, "WALLET_LIMIT_EXCEEDED")
  }

  return ok({
    analysisMode: normalizeAnalysisMode(input.analysisMode),
    wallets,
    issues,
    requestedRiskPolicy,
  })
}
