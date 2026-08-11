export type SecondHoldoutContextPlan = {
  id: string
  chain: "solana" | "evm"
  officialDomain: string
  targetCases: number
  surfaceTargets: {
    url: number
    token: number
    transaction: number
    wallet: number
  }
  benignTarget: number
  maliciousTarget: number
}

export const secondHoldoutCollectionPlan = {
  schemaVersion: 1,
  role: "independent_final_validation_collection" as const,
  targetCases: 200,
  minimumAcceptedCases: 180,
  seenFixtureReuseAllowed: false,
  targetReuseAllowed: false,
  groundTruthMustPrecedeModelEvaluation: true,
  internalTriProofEvidenceAllowedForGroundTruth: false,
  minimumVerifiedCoverage: 0.9,
  minimumMaliciousDualSourceCoverage: 0.5,
  minimumTransactionSourceContextCoverage: 0.8,
  contexts: [
    { id: "backpack", chain: "solana", officialDomain: "backpack.app", targetCases: 25, surfaceTargets: { url: 6, token: 6, transaction: 8, wallet: 5 }, benignTarget: 13, maliciousTarget: 12 },
    { id: "kamino", chain: "solana", officialDomain: "kamino.com", targetCases: 25, surfaceTargets: { url: 6, token: 6, transaction: 8, wallet: 5 }, benignTarget: 12, maliciousTarget: 13 },
    { id: "orca", chain: "solana", officialDomain: "orca.so", targetCases: 25, surfaceTargets: { url: 6, token: 6, transaction: 8, wallet: 5 }, benignTarget: 13, maliciousTarget: 12 },
    { id: "marinade", chain: "solana", officialDomain: "marinade.finance", targetCases: 25, surfaceTargets: { url: 6, token: 6, transaction: 8, wallet: 5 }, benignTarget: 12, maliciousTarget: 13 },
    { id: "aave", chain: "evm", officialDomain: "aave.com", targetCases: 25, surfaceTargets: { url: 6, token: 6, transaction: 8, wallet: 5 }, benignTarget: 13, maliciousTarget: 12 },
    { id: "1inch", chain: "evm", officialDomain: "1inch.com", targetCases: 25, surfaceTargets: { url: 6, token: 6, transaction: 8, wallet: 5 }, benignTarget: 12, maliciousTarget: 13 },
    { id: "lido", chain: "evm", officialDomain: "lido.fi", targetCases: 25, surfaceTargets: { url: 6, token: 6, transaction: 8, wallet: 5 }, benignTarget: 13, maliciousTarget: 12 },
    { id: "safe", chain: "evm", officialDomain: "safe.global", targetCases: 25, surfaceTargets: { url: 6, token: 6, transaction: 8, wallet: 5 }, benignTarget: 12, maliciousTarget: 13 },
  ] satisfies SecondHoldoutContextPlan[],
} as const

export function summarizeSecondHoldoutCollectionPlan() {
  const surfaceTotals = { url: 0, token: 0, transaction: 0, wallet: 0 }
  let totalCases = 0
  let benignTarget = 0
  let maliciousTarget = 0
  const chains = new Set<string>()

  for (const context of secondHoldoutCollectionPlan.contexts) {
    totalCases += context.targetCases
    benignTarget += context.benignTarget
    maliciousTarget += context.maliciousTarget
    chains.add(context.chain)
    surfaceTotals.url += context.surfaceTargets.url
    surfaceTotals.token += context.surfaceTargets.token
    surfaceTotals.transaction += context.surfaceTargets.transaction
    surfaceTotals.wallet += context.surfaceTargets.wallet
  }

  return {
    totalCases,
    contexts: secondHoldoutCollectionPlan.contexts.length,
    chains: [...chains].sort(),
    surfaceTotals,
    benignTarget,
    maliciousTarget,
  }
}
