import { z } from "zod"

import type { CampaignType, Chain, RiskPolicy } from "@/types"

export const campaignTypes: CampaignType[] = [
  "Airdrop",
  "Testnet",
  "Whitelist",
  "Quest",
  "Points Program",
  "Community Reward",
  "Other",
]

export const supportedChains: Chain[] = [
  "Ethereum",
  "Base",
  "Arbitrum",
  "Optimism",
  "Polygon",
  "BNB Chain",
  "Solana",
  "Other",
]

export const analysisModes = ["onchain", "hybrid"] as const
export const riskPolicies: RiskPolicy[] = ["conservative", "balanced", "strict"]

export const newAnalysisSchema = z.object({
  projectName: z.preprocess(
    (value) => (value == null ? "" : value),
    z
      .string()
      .trim()
      .max(120)
      .refine(
        (value) => value.length === 0 || value.length >= 2,
        "Project name must be at least 2 characters"
      )
  ),
  campaignType: z.enum(campaignTypes as [CampaignType, ...CampaignType[]]),
  chain: z.enum(supportedChains as [Chain, ...Chain[]]),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  analysisMode: z.preprocess(
    (value) => (value == null || value === "" || value === "csv_only" ? "onchain" : value),
    z.enum(analysisModes)
  ),
  riskPolicy: z.preprocess(
    (value) => (value == null || value === "" ? "balanced" : value),
    z.enum(riskPolicies as [RiskPolicy, ...RiskPolicy[]])
  ),
  campaignContracts: z.string().trim().max(5000).optional().or(z.literal("")),
  deepHistory: z.preprocess(
    (value) => value === "true" || value === "on",
    z.boolean()
  ),
})

const evmWalletRegex = /^0x[a-fA-F0-9]{40}$/
const solanaWalletRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
const base58Values = new Map(
  Array.from(base58Alphabet, (character, index) => [character, BigInt(index)])
)

export function isValidSolanaAddress(address: string) {
  const value = address.trim()
  if (!solanaWalletRegex.test(value)) return false

  let decoded = 0n
  for (const character of value) {
    const digit = base58Values.get(character)
    if (digit === undefined) return false
    decoded = decoded * 58n + digit
  }

  let decodedBytes = 0
  for (let cursor = decoded; cursor > 0n; cursor >>= 8n) {
    decodedBytes += 1
  }

  let leadingZeroBytes = 0
  while (
    leadingZeroBytes < value.length &&
    value[leadingZeroBytes] === "1"
  ) {
    leadingZeroBytes += 1
  }

  return leadingZeroBytes + decodedBytes === 32
}

/** Parse campaign addresses/program IDs supplied by the user. */
export function parseCampaignContracts(input: string | null | undefined): string[] {
  if (!input) return []
  return Array.from(
    new Set(
      input
        .split(/[\n,;\s]+/)
        .map((value) => value.trim())
        .filter((value) => evmWalletRegex.test(value) || isValidSolanaAddress(value))
    )
  )
}

export const authSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
})

export const registerSchema = authSchema.extend({
  name: z.string().trim().min(2).max(80),
})

export function isValidWalletAddress(address: string, chain: string) {
  const value = address.trim()

  if (chain === "Solana") {
    return isValidSolanaAddress(value)
  }

  if (chain === "Other") {
    return evmWalletRegex.test(value) || isValidSolanaAddress(value)
  }

  return evmWalletRegex.test(value)
}

export function normalizeWalletAddress(address: string, chain: string) {
  const trimmed = address.trim()
  return chain === "Solana" ? trimmed : trimmed.toLowerCase()
}

export function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/\s+/g, "_")
}
