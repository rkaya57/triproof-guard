import type { ScamGuardV2HoldoutChain, ScamGuardV2HoldoutSurface } from "./holdout-dataset-contract"

export type ScamGuardV2HoldoutContextPlan = {
  id: string
  name: string
  primaryChain: Exclude<ScamGuardV2HoldoutChain, "unknown">
  officialDomain: string
  targetCases: number
  surfaceTargets: Record<ScamGuardV2HoldoutSurface, number>
  benignTarget: number
  maliciousTarget: number
}

const surfaceTargets = {
  url: 5,
  token: 5,
  transaction: 9,
  wallet: 6,
} as const

export const scamGuardV2HoldoutContextPlan: ScamGuardV2HoldoutContextPlan[] = [
  { id: "phantom", name: "Phantom", primaryChain: "solana", officialDomain: "phantom.com", targetCases: 25, surfaceTargets: { ...surfaceTargets }, benignTarget: 13, maliciousTarget: 12 },
  { id: "solflare", name: "Solflare", primaryChain: "solana", officialDomain: "solflare.com", targetCases: 25, surfaceTargets: { ...surfaceTargets }, benignTarget: 12, maliciousTarget: 13 },
  { id: "jupiter", name: "Jupiter", primaryChain: "solana", officialDomain: "jup.ag", targetCases: 25, surfaceTargets: { ...surfaceTargets }, benignTarget: 13, maliciousTarget: 12 },
  { id: "raydium", name: "Raydium", primaryChain: "solana", officialDomain: "raydium.io", targetCases: 25, surfaceTargets: { ...surfaceTargets }, benignTarget: 12, maliciousTarget: 13 },
  { id: "uniswap", name: "Uniswap", primaryChain: "evm", officialDomain: "uniswap.org", targetCases: 25, surfaceTargets: { ...surfaceTargets }, benignTarget: 13, maliciousTarget: 12 },
  { id: "metamask", name: "MetaMask", primaryChain: "evm", officialDomain: "metamask.io", targetCases: 25, surfaceTargets: { ...surfaceTargets }, benignTarget: 12, maliciousTarget: 13 },
]

export const scamGuardV2HoldoutGroundTruthPolicy = {
  minimumIndependentSourcesForMalicious: 2,
  minimumIndependentSourcesForBenign: 1,
  allowV2OutputAsGroundTruthEvidence: false,
  allowTriProofPriorAdjudicationAsGroundTruthEvidence: false,
  preferredMaliciousEvidence: [
    "official project warning or takedown notice",
    "reputable phishing/blocklist entry",
    "explorer-verified malicious transaction or drainer behavior",
    "multiple independent threat-intelligence sources",
  ],
  preferredBenignEvidence: [
    "official project domain/documentation",
    "canonical token mint/contract from official source",
    "verified protocol router/contract documentation",
    "normal transaction generated from official application flow",
  ],
} as const

export function summarizeHoldoutCollectionPlan() {
  const totals = scamGuardV2HoldoutContextPlan.reduce(
    (acc, item) => {
      acc.total += item.targetCases
      acc.benign += item.benignTarget
      acc.malicious += item.maliciousTarget
      for (const surface of Object.keys(item.surfaceTargets) as ScamGuardV2HoldoutSurface[]) {
        acc.surfaces[surface] += item.surfaceTargets[surface]
      }
      acc.chains.add(item.primaryChain)
      return acc
    },
    {
      total: 0,
      benign: 0,
      malicious: 0,
      surfaces: { url: 0, token: 0, transaction: 0, wallet: 0 } as Record<ScamGuardV2HoldoutSurface, number>,
      chains: new Set<Exclude<ScamGuardV2HoldoutChain, "unknown">>(),
    },
  )

  return {
    total: totals.total,
    benign: totals.benign,
    malicious: totals.malicious,
    surfaces: totals.surfaces,
    chains: [...totals.chains].sort(),
    contexts: scamGuardV2HoldoutContextPlan.length,
  }
}
