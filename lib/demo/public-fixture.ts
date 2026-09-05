import { createHash } from "node:crypto"

import type { ParsedWallet } from "@/types"

export const PUBLIC_DEMO_VERSION = "campaign-evidence-demo-v1"
export const PUBLIC_DEMO_AS_OF = "2026-09-05T00:00:00.000Z"

// Generated identifiers and invented observations, never fetched from a provider.
function address(seed: number) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
  const bytes = createHash("sha256").update(`triproof-public-demo:${seed}`).digest()
  let value = BigInt(`0x${bytes.toString("hex")}`)
  let encoded = ""
  while (value > 0n) {
    encoded = alphabet[Number(value % 58n)] + encoded
    value /= 58n
  }
  for (const byte of bytes) {
    if (byte !== 0) break
    encoded = "1" + encoded
  }
  return encoded
}

export function publicDemoInputs(): ParsedWallet[] {
  return Array.from({ length: 12 }, (_, index): ParsedWallet => {
    const common: ParsedWallet = {
      walletAddress: address(index),
      chain: "Solana",
      txCount: 150 + index,
      walletAgeDays: 365,
      fundingSource: address(100 + index),
      firstSeen: null,
      lastSeen: null,
      totalVolume: 500,
      contractsCount: 15,
      campaignActionsCount: 2,
    }
    if (index < 4) return {
      ...common,
      txCount: 4,
      walletAgeDays: 7,
      fundingSource: address(200),
      firstFundingAt: `2026-09-01T10:00:0${index}.000Z`,
      firstFundingAmount: 0.02,
      totalVolume: 0.1,
      contractsCount: 1,
      campaignActionsCount: 4,
      referrerAddress: address(200),
      referralCode: "DEMO-COHORT",
      referralTimestamp: `2026-09-01T10:01:0${index}.000Z`,
      behaviorFingerprint: ["demo-claim", "demo-transfer"],
    }
    if (index === 9) return {
      ...common,
      txCount: 5,
      walletAgeDays: 8,
      fundingSource: null,
      totalVolume: 2,
      contractsCount: 1,
      campaignActionsCount: 2,
    }
    if (index === 10) return {
      ...common,
      txCount: null,
      walletAgeDays: null,
      fundingSource: null,
      totalVolume: null,
      contractsCount: null,
      campaignActionsCount: null,
      enrichmentStatus: "failed",
    }
    if (index === 11) return {
      ...common,
      knownEntityLabel: "Illustrative protocol account",
      knownEntityType: "protocol",
      accountType: "known_protocol_or_program",
    }
    return common
  })
}
