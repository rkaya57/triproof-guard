import { analyzeWallets } from "@/lib/risk-engine"
import type {
  AnalysisResult,
  ParsedWallet,
  RiskPolicy,
  WalletRiskResult,
  WalletStatus,
} from "@/types"

export const ADVERSARIAL_SUITE_VERSION = "adversarial-sybil-v1.0.0" as const

export type AdversarialScenario = {
  id: string
  title: string
  threatModel: string
  chain: string
  riskPolicy?: RiskPolicy
  wallets: ParsedWallet[]
  maliciousAddresses: string[]
  organicControlAddresses?: string[]
  expected: {
    minClusters?: number
    maxClusters?: number
    requireAllMaliciousContained?: boolean
    requireOrganicNotRejected?: boolean
    exactStatusByAddress?: Record<string, WalletStatus>
    requireReasonFragments?: Array<{
      address: string
      anyOf: string[]
    }>
  }
}

export type AdversarialScenarioResult = {
  id: string
  title: string
  threatModel: string
  chain: string
  passed: boolean
  failures: string[]
  walletCount: number
  maliciousWallets: number
  organicControls: number
  clusters: number
  approved: number
  manualReview: number
  rejected: number
  maliciousAutoApprovals: number
  organicFalseRejects: number
}

export type AdversarialSuiteReport = {
  suiteVersion: typeof ADVERSARIAL_SUITE_VERSION
  generatedAt: string
  passed: boolean
  totalScenarios: number
  passedScenarios: number
  totalWallets: number
  maliciousWallets: number
  organicControls: number
  maliciousContained: number
  maliciousAutoApprovals: number
  organicFalseRejects: number
  attackContainmentRate: number
  organicControlFalseRejectRate: number
  scenarioPassRate: number
  results: AdversarialScenarioResult[]
}

function evmAddress(index: number) {
  return `0x${index.toString(16).padStart(40, "0")}`
}

const SOLANA_ADDRESSES = [
  "7YxK9mQ2vP4cR6tU8wA3dF5hJ7nS9xB2eG4kM6pT8zV1",
  "8ZyL2nR3wQ5dS7uV9xB4eG6jK8pT1yC3fH5mN7qW9aX2",
  "9AxM3pS4xR6eT8vW1yC5fH7kL9qU2zD4gJ6nP8rX1bY3",
  "6WxJ8kP1uN3bQ5sT7vZ2cE4gH6mR8yA1dF3jL5pV7xC9",
  "5VwH7jN9tM2aP4rS6uY1bD3fG5kQ7xZ9cE2hJ4nT6vB8",
  "4UtG6hM8sL1zN3qR5tX9aC2eF4jP6wY8bD1gK3mS5uA7",
  "3TsF5gL7rK9yM2pQ4sW8zB1dE3hN5vX7aC9fJ2kR4tZ6",
  "2SrE4fK6qJ8xL1nP3rV7yA9cD2gM4uW6zB8eH1jQ3sY5",
]

function baseWallet(
  walletAddress: string,
  chain = "Base",
  overrides: Partial<ParsedWallet> = {}
): ParsedWallet {
  return {
    walletAddress,
    chain,
    txCount: 140,
    walletAgeDays: 540,
    fundingSource: evmAddress(90_000),
    firstFundingAt: "2025-01-01T08:00:00.000Z",
    firstFundingAmount: 0.35,
    historyTruncated: false,
    firstSeen: "2025-01-01T00:00:00.000Z",
    lastSeen: "2026-08-01T00:00:00.000Z",
    totalVolume: 3200,
    contractsCount: 22,
    campaignActionsCount: 2,
    nativeBalance: 1.5,
    tokenCount: 14,
    uniqueCounterparties: 82,
    lastActiveDaysAgo: 2,
    isContract: false,
    accountType: "system_user_wallet",
    behaviorFingerprint: ["swap", "lp", "bridge", "stake"],
    campaignQualityScore: 92,
    campaignOnlyRatio: 0.05,
    behaviorDiversityScore: 90,
    botScriptScore: 4,
    policyAction: null,
    reputationLabel: null,
    policyReason: null,
    customerLabel: null,
    enrichmentProvider: "adversarial-fixture",
    enrichmentStatus: "completed",
    ...overrides,
  }
}

function makeTightFundingBehaviorCluster(): AdversarialScenario {
  const funder = evmAddress(91_001)
  const wallets = Array.from({ length: 4 }, (_, index) =>
    baseWallet(evmAddress(10_100 + index), "Base", {
      fundingSource: funder,
      firstFundingAt: `2026-07-20T10:0${index}:00.000Z`,
      txCount: 24,
      walletAgeDays: 70,
      contractsCount: 6,
      tokenCount: 4,
      uniqueCounterparties: 9,
      behaviorFingerprint: ["swap", "claim", "stake"],
      campaignActionsCount: 5,
      campaignQualityScore: 48,
    })
  )
  return {
    id: "tight-funding-behavior-cluster",
    title: "Tight unknown-funder plus behavior cohort",
    threatModel:
      "Operator funds several wallets from one unknown source in minutes and replays the same activity template.",
    chain: "Base",
    wallets,
    maliciousAddresses: wallets.map((wallet) => wallet.walletAddress),
    expected: {
      minClusters: 1,
      requireAllMaliciousContained: true,
    },
  }
}

function makeLowAndSlowCluster(): AdversarialScenario {
  const funder = evmAddress(91_002)
  const fundingDates = ["01", "03", "05", "07", "09", "11"]
  const wallets = Array.from({ length: 6 }, (_, index) =>
    baseWallet(evmAddress(10_200 + index), "Base", {
      fundingSource: funder,
      firstFundingAt: `2026-06-${fundingDates[index]}T09:00:00.000Z`,
      txCount: 35 + index,
      walletAgeDays: 110 + index,
      contractsCount: 8,
      tokenCount: 6,
      uniqueCounterparties: 14,
      behaviorFingerprint: ["swap", "stake", "claim", "bridge"],
      campaignActionsCount: 6,
      campaignQualityScore: 58,
      campaignOnlyRatio: 0.42,
      behaviorDiversityScore: 56,
    })
  )
  return {
    id: "low-and-slow-shared-funder",
    title: "Low-and-slow coordinated funding",
    threatModel:
      "Operator spreads funding over multiple days to evade a narrow timing window while keeping a common unknown funder and repeated behavior.",
    chain: "Base",
    wallets,
    maliciousAddresses: wallets.map((wallet) => wallet.walletAddress),
    expected: {
      minClusters: 1,
      requireAllMaliciousContained: true,
    },
  }
}

function makeOrganicCamouflageCluster(): AdversarialScenario {
  const funder = evmAddress(91_003)
  const wallets = Array.from({ length: 5 }, (_, index) =>
    baseWallet(evmAddress(10_300 + index), "Ethereum", {
      fundingSource: funder,
      firstFundingAt: `2026-05-10T12:${String(index * 3).padStart(2, "0")}:00.000Z`,
      txCount: 220 + index * 17,
      walletAgeDays: 600 + index * 20,
      totalVolume: 6000 + index * 900,
      contractsCount: 35 + index,
      tokenCount: 20 + index,
      uniqueCounterparties: 100 + index * 5,
      behaviorFingerprint: ["swap", "lp", "stake", "bridge", "claim"],
      campaignActionsCount: 2,
      campaignQualityScore: 90,
      campaignOnlyRatio: 0.08,
      behaviorDiversityScore: 88,
      botScriptScore: 8,
    })
  )
  return {
    id: "organic-camouflage-cluster",
    title: "Organic-history camouflage",
    threatModel:
      "Sybil wallets manufacture mature-looking histories, but preserve a common unknown funding origin and synchronized funding event.",
    chain: "Ethereum",
    wallets,
    maliciousAddresses: wallets.map((wallet) => wallet.walletAddress),
    expected: {
      minClusters: 1,
      requireAllMaliciousContained: true,
    },
  }
}

function makeReferralCampaignCoordination(): AdversarialScenario {
  const referrer = evmAddress(92_000)
  const wallets = Array.from({ length: 8 }, (_, index) =>
    baseWallet(evmAddress(10_400 + index), "Base", {
      fundingSource: evmAddress(92_100 + index),
      firstFundingAt: `2026-04-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
      referrerAddress: referrer,
      referralTimestamp: `2026-07-30T10:${String(index).padStart(2, "0")}:00.000Z`,
      campaignEventAt: `2026-07-30T11:${String(index).padStart(2, "0")}:00.000Z`,
      campaignEventType: "quest-claim",
      campaignPoints: 25,
      txCount: 75 + index,
      walletAgeDays: 210 + index,
      behaviorFingerprint: [`organic-${index}`, "quest"],
    })
  )
  return {
    id: "referral-campaign-coordination",
    title: "Unique funders with referral and campaign coordination",
    threatModel:
      "Operator avoids shared funding by using unique funders while coordinating referral and campaign actions in a tight window.",
    chain: "Base",
    wallets,
    maliciousAddresses: wallets.map((wallet) => wallet.walletAddress),
    expected: {
      minClusters: 1,
      requireAllMaliciousContained: true,
    },
  }
}

function makeCircularFundingAttack(): AdversarialScenario {
  const addresses = [evmAddress(10_500), evmAddress(10_501), evmAddress(10_502)]
  const wallets = addresses.map((walletAddress, index) =>
    baseWallet(walletAddress, "Base", {
      fundingSource: addresses[(index + addresses.length - 1) % addresses.length],
      firstFundingAt: `2026-07-15T09:0${index}:00.000Z`,
      txCount: 55,
      walletAgeDays: 160,
      behaviorFingerprint: ["swap", "transfer", "claim"],
      campaignActionsCount: 4,
    })
  )
  return {
    id: "circular-funding-ring",
    title: "Circular funding ring",
    threatModel:
      "Three participant wallets rotate funding among themselves to hide a single external origin.",
    chain: "Base",
    wallets,
    maliciousAddresses: addresses,
    expected: {
      requireAllMaliciousContained: true,
      requireReasonFragments: addresses.map((address) => ({
        address,
        anyOf: ["circular", "cycle", "graph"],
      })),
    },
  }
}

function makeSelfReferralCamouflage(): AdversarialScenario {
  const address = evmAddress(10_600)
  const wallet = baseWallet(address, "Base", {
    txCount: 850,
    walletAgeDays: 900,
    totalVolume: 18_000,
    contractsCount: 65,
    tokenCount: 32,
    uniqueCounterparties: 260,
    behaviorFingerprint: ["swap", "lp", "bridge", "stake", "nft", "lend"],
    campaignQualityScore: 98,
    behaviorDiversityScore: 96,
    botScriptScore: 1,
    referrerAddress: address,
    referralTimestamp: "2026-07-21T12:00:00.000Z",
  })
  return {
    id: "self-referral-organic-camouflage",
    title: "Self-referral hidden behind mature history",
    threatModel:
      "A mature-looking wallet attempts to bypass detection with a strong organic history while containing an explicit self-referral edge.",
    chain: "Base",
    wallets: [wallet],
    maliciousAddresses: [address],
    expected: {
      requireAllMaliciousContained: true,
      requireReasonFragments: [
        { address, anyOf: ["self-referral", "self referral"] },
      ],
    },
  }
}

function makeBotCamouflageAttack(): AdversarialScenario {
  const wallets = Array.from({ length: 3 }, (_, index) =>
    baseWallet(evmAddress(10_700 + index), "Base", {
      fundingSource: evmAddress(93_000 + index),
      txCount: 180 + index * 10,
      walletAgeDays: 330 + index * 5,
      totalVolume: 2800 + index * 200,
      contractsCount: 20,
      uniqueCounterparties: 45,
      campaignActionsCount: 18,
      campaignOnlyRatio: 0.82,
      campaignQualityScore: 28,
      behaviorDiversityScore: 24,
      botScriptScore: 96,
      behaviorFingerprint: ["claim", "swap", "claim", "claim"],
    })
  )
  return {
    id: "bot-camouflage-high-history",
    title: "Bot behavior hidden behind transaction history",
    threatModel:
      "Automated participants accumulate non-trivial transaction history but remain highly campaign-focused with a very high bot signature.",
    chain: "Base",
    wallets,
    maliciousAddresses: wallets.map((wallet) => wallet.walletAddress),
    expected: {
      requireAllMaliciousContained: true,
      requireReasonFragments: wallets.map((wallet) => ({
        address: wallet.walletAddress,
        anyOf: ["bot-script", "campaign-only", "campaign-only behavior"],
      })),
    },
  }
}

function makeSolanaCamouflageCluster(): AdversarialScenario {
  const funder = "FndR7mQ9vP2cS4tW6yA8dG1hJ3kN5rT7xV9zB2eM4pQ6"
  const wallets = SOLANA_ADDRESSES.slice(0, 4).map((walletAddress, index) =>
    baseWallet(walletAddress, "Solana", {
      fundingSource: funder,
      firstFundingAt: `2026-07-18T14:0${index}:00.000Z`,
      txCount: 95 + index,
      walletAgeDays: 260 + index,
      totalVolume: 1800 + index * 100,
      contractsCount: 12,
      tokenCount: 9,
      uniqueCounterparties: 35,
      behaviorFingerprint: ["swap", "stake", "claim"],
      campaignActionsCount: 5,
      campaignOnlyRatio: 0.35,
      behaviorDiversityScore: 62,
    })
  )
  return {
    id: "solana-camouflage-cluster",
    title: "Solana coordinated funding cluster",
    threatModel:
      "Solana wallets retain respectable activity while sharing a case-sensitive unknown funder and tight funding window.",
    chain: "Solana",
    wallets,
    maliciousAddresses: wallets.map((wallet) => wallet.walletAddress),
    expected: {
      minClusters: 1,
      requireAllMaliciousContained: true,
    },
  }
}

function makeHiddenClusterInOrganicPopulation(): AdversarialScenario {
  const suspiciousFunder = evmAddress(94_000)
  const sybils = Array.from({ length: 4 }, (_, index) =>
    baseWallet(evmAddress(10_800 + index), "Base", {
      fundingSource: suspiciousFunder,
      firstFundingAt: `2026-07-25T16:0${index}:00.000Z`,
      txCount: 40,
      walletAgeDays: 120,
      contractsCount: 8,
      tokenCount: 6,
      uniqueCounterparties: 15,
      behaviorFingerprint: ["swap", "claim", "stake"],
      campaignActionsCount: 5,
    })
  )
  const organic = Array.from({ length: 12 }, (_, index) =>
    baseWallet(evmAddress(10_900 + index), "Base", {
      fundingSource: evmAddress(95_000 + index),
      firstFundingAt: `2025-${String((index % 9) + 1).padStart(2, "0")}-12T08:00:00.000Z`,
      txCount: 120 + index * 13,
      walletAgeDays: 400 + index * 17,
      behaviorFingerprint: ["swap", `organic-${index}`, "stake"],
      campaignOnlyRatio: 0.04,
      behaviorDiversityScore: 88,
      botScriptScore: 3,
    })
  )
  return {
    id: "hidden-small-cluster-in-organic-population",
    title: "Small Sybil cluster hidden inside an organic population",
    threatModel:
      "A four-wallet coordinated cell is embedded in a larger set of unrelated legitimate participants.",
    chain: "Base",
    wallets: [...organic, ...sybils],
    maliciousAddresses: sybils.map((wallet) => wallet.walletAddress),
    organicControlAddresses: organic.map((wallet) => wallet.walletAddress),
    expected: {
      minClusters: 1,
      requireAllMaliciousContained: true,
      requireOrganicNotRejected: true,
    },
  }
}

function makeExchangeFundingNegativeControl(): AdversarialScenario {
  const binanceHotWallet = "0x28c6c06298d514db089934071355e5743bf21d60"
  const wallets = Array.from({ length: 8 }, (_, index) =>
    baseWallet(evmAddress(11_000 + index), "Ethereum", {
      fundingSource: binanceHotWallet,
      firstFundingAt: `2026-07-28T10:0${index}:00.000Z`,
      txCount: 80 + index * 15,
      walletAgeDays: 240 + index * 30,
      behaviorFingerprint: ["swap", `independent-${index}`, "stake"],
    })
  )
  return {
    id: "known-exchange-fanout-negative-control",
    title: "Known exchange fan-out must not become Sybil evidence",
    threatModel:
      "Independent users withdraw from the same known exchange in a similar time window, a common source of false positives.",
    chain: "Ethereum",
    wallets,
    maliciousAddresses: [],
    organicControlAddresses: wallets.map((wallet) => wallet.walletAddress),
    expected: {
      maxClusters: 0,
      requireOrganicNotRejected: true,
      exactStatusByAddress: Object.fromEntries(
        wallets.map((wallet) => [wallet.walletAddress, "approved" as const])
      ),
    },
  }
}

function makeSharedFundingOnlyNegativeControl(): AdversarialScenario {
  const commonFunder = evmAddress(96_000)
  const dates = ["01", "08", "15", "22"]
  const wallets = Array.from({ length: 4 }, (_, index) =>
    baseWallet(evmAddress(11_100 + index), "Base", {
      fundingSource: commonFunder,
      firstFundingAt: `2025-0${index + 1}-${dates[index]}T08:00:00.000Z`,
      txCount: 100 + index * 27,
      walletAgeDays: 400 + index * 60,
      behaviorFingerprint: [`independent-${index}`, "swap", `app-${index}`],
      campaignActionsCount: index % 2,
      campaignOnlyRatio: 0.03 + index * 0.01,
      behaviorDiversityScore: 85 - index,
    })
  )
  return {
    id: "shared-funder-only-negative-control",
    title: "Shared unknown funding alone remains non-conclusive",
    threatModel:
      "Legitimate participants share an unrecognized source but have unrelated timing and behavior; hardening must not overfit this into a Sybil cluster.",
    chain: "Base",
    wallets,
    maliciousAddresses: [],
    organicControlAddresses: wallets.map((wallet) => wallet.walletAddress),
    expected: {
      maxClusters: 0,
      requireOrganicNotRejected: true,
      exactStatusByAddress: Object.fromEntries(
        wallets.map((wallet) => [wallet.walletAddress, "approved" as const])
      ),
    },
  }
}

function makeProviderFailureNegativeControl(): AdversarialScenario {
  const wallets = Array.from({ length: 3 }, (_, index) =>
    baseWallet(evmAddress(11_200 + index), "Base", {
      txCount: null,
      walletAgeDays: null,
      fundingSource: null,
      firstFundingAt: null,
      firstFundingAmount: null,
      firstSeen: null,
      lastSeen: null,
      totalVolume: null,
      contractsCount: null,
      campaignActionsCount: null,
      nativeBalance: null,
      tokenCount: null,
      uniqueCounterparties: null,
      lastActiveDaysAgo: null,
      isContract: null,
      accountType: null,
      behaviorFingerprint: null,
      campaignQualityScore: null,
      campaignOnlyRatio: null,
      behaviorDiversityScore: null,
      botScriptScore: null,
      enrichmentProvider: index % 2 === 0 ? "alchemy" : "helius",
      enrichmentStatus: "failed",
    })
  )
  return {
    id: "provider-failure-negative-control",
    title: "Provider outage cannot become malicious risk",
    threatModel:
      "Infrastructure failure removes evidence; the engine must fail safely into review instead of fabricating wallet risk.",
    chain: "Base",
    wallets,
    maliciousAddresses: [],
    organicControlAddresses: wallets.map((wallet) => wallet.walletAddress),
    expected: {
      maxClusters: 0,
      requireOrganicNotRejected: true,
      exactStatusByAddress: Object.fromEntries(
        wallets.map((wallet) => [wallet.walletAddress, "manual_review" as const])
      ),
    },
  }
}

function makeTrustedOverrideHardSignalAttack(): AdversarialScenario {
  const address = evmAddress(11_300)
  const wallet = baseWallet(address, "Base", {
    policyAction: "approve",
    reputationLabel: "legacy-allowlist",
    policyReason: "Imported trusted participant",
    referrerAddress: address,
    referralTimestamp: "2026-07-31T13:00:00.000Z",
  })
  return {
    id: "trusted-policy-hard-signal-conflict",
    title: "Trusted policy cannot erase current hard Sybil evidence",
    threatModel:
      "An imported allowlist label conflicts with an explicit self-referral discovered in the current campaign.",
    chain: "Base",
    wallets: [wallet],
    maliciousAddresses: [address],
    expected: {
      requireAllMaliciousContained: true,
      requireReasonFragments: [
        {
          address,
          anyOf: ["self-referral", "context retained without overriding"],
        },
      ],
    },
  }
}

export function adversarialScenarios(): AdversarialScenario[] {
  return [
    makeTightFundingBehaviorCluster(),
    makeLowAndSlowCluster(),
    makeOrganicCamouflageCluster(),
    makeReferralCampaignCoordination(),
    makeCircularFundingAttack(),
    makeSelfReferralCamouflage(),
    makeBotCamouflageAttack(),
    makeSolanaCamouflageCluster(),
    makeHiddenClusterInOrganicPopulation(),
    makeExchangeFundingNegativeControl(),
    makeSharedFundingOnlyNegativeControl(),
    makeProviderFailureNegativeControl(),
    makeTrustedOverrideHardSignalAttack(),
  ]
}

function resultByAddress(result: AnalysisResult, address: string) {
  const normalized = address.startsWith("0x") ? address.toLowerCase() : address
  return result.wallets.find((wallet) => {
    const candidate = wallet.walletAddress.startsWith("0x")
      ? wallet.walletAddress.toLowerCase()
      : wallet.walletAddress
    return candidate === normalized
  })
}

function evaluateReasonRequirement(
  wallet: WalletRiskResult | undefined,
  fragments: string[]
) {
  if (!wallet) return false
  const text = `${wallet.statusExplanation} ${wallet.reasons.join(" ")}`.toLowerCase()
  return fragments.some((fragment) => text.includes(fragment.toLowerCase()))
}

function evaluateScenario(scenario: AdversarialScenario): AdversarialScenarioResult {
  const result = analyzeWallets(
    scenario.wallets,
    null,
    scenario.riskPolicy ?? "balanced"
  )
  const failures: string[] = []
  const malicious = scenario.maliciousAddresses
    .map((address) => resultByAddress(result, address))
    .filter((wallet): wallet is WalletRiskResult => Boolean(wallet))
  const organic = (scenario.organicControlAddresses ?? [])
    .map((address) => resultByAddress(result, address))
    .filter((wallet): wallet is WalletRiskResult => Boolean(wallet))

  if (malicious.length !== scenario.maliciousAddresses.length) {
    failures.push(
      `Expected ${scenario.maliciousAddresses.length} malicious wallet results, found ${malicious.length}.`
    )
  }
  if (organic.length !== (scenario.organicControlAddresses ?? []).length) {
    failures.push(
      `Expected ${(scenario.organicControlAddresses ?? []).length} organic control results, found ${organic.length}.`
    )
  }

  if (
    scenario.expected.minClusters !== undefined &&
    result.clusters.length < scenario.expected.minClusters
  ) {
    failures.push(
      `Expected at least ${scenario.expected.minClusters} suspicious cluster(s), found ${result.clusters.length}.`
    )
  }
  if (
    scenario.expected.maxClusters !== undefined &&
    result.clusters.length > scenario.expected.maxClusters
  ) {
    failures.push(
      `Expected at most ${scenario.expected.maxClusters} suspicious cluster(s), found ${result.clusters.length}.`
    )
  }

  if (scenario.expected.requireAllMaliciousContained ?? true) {
    const approved = malicious.filter((wallet) => wallet.status === "approved")
    if (approved.length > 0) {
      failures.push(
        `${approved.length} malicious wallet(s) were auto-approved: ${approved
          .map((wallet) => wallet.walletAddress)
          .join(", ")}.`
      )
    }
  }

  if (scenario.expected.requireOrganicNotRejected) {
    const rejected = organic.filter((wallet) => wallet.status === "rejected")
    if (rejected.length > 0) {
      failures.push(
        `${rejected.length} organic control wallet(s) were rejected: ${rejected
          .map((wallet) => wallet.walletAddress)
          .join(", ")}.`
      )
    }
  }

  Object.entries(scenario.expected.exactStatusByAddress ?? {}).forEach(
    ([address, expectedStatus]) => {
      const wallet = resultByAddress(result, address)
      if (!wallet) {
        failures.push(`Missing result for exact-status wallet ${address}.`)
        return
      }
      if (wallet.status !== expectedStatus) {
        failures.push(
          `${address} expected ${expectedStatus}, observed ${wallet.status} (risk ${wallet.riskScore}).`
        )
      }
    }
  )

  ;(scenario.expected.requireReasonFragments ?? []).forEach((requirement) => {
    const wallet = resultByAddress(result, requirement.address)
    if (!evaluateReasonRequirement(wallet, requirement.anyOf)) {
      failures.push(
        `${requirement.address} did not expose any required evidence fragment: ${requirement.anyOf.join(", ")}.`
      )
    }
  })

  return {
    id: scenario.id,
    title: scenario.title,
    threatModel: scenario.threatModel,
    chain: scenario.chain,
    passed: failures.length === 0,
    failures,
    walletCount: result.totalWallets,
    maliciousWallets: malicious.length,
    organicControls: organic.length,
    clusters: result.clusters.length,
    approved: result.approvedCount,
    manualReview: result.manualReviewCount,
    rejected: result.rejectedCount,
    maliciousAutoApprovals: malicious.filter(
      (wallet) => wallet.status === "approved"
    ).length,
    organicFalseRejects: organic.filter(
      (wallet) => wallet.status === "rejected"
    ).length,
  }
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator
}

export function runAdversarialSuite(): AdversarialSuiteReport {
  const scenarios = adversarialScenarios()
  const results = scenarios.map(evaluateScenario)
  const maliciousWallets = results.reduce(
    (sum, result) => sum + result.maliciousWallets,
    0
  )
  const organicControls = results.reduce(
    (sum, result) => sum + result.organicControls,
    0
  )
  const maliciousAutoApprovals = results.reduce(
    (sum, result) => sum + result.maliciousAutoApprovals,
    0
  )
  const organicFalseRejects = results.reduce(
    (sum, result) => sum + result.organicFalseRejects,
    0
  )
  const passedScenarios = results.filter((result) => result.passed).length
  const report: AdversarialSuiteReport = {
    suiteVersion: ADVERSARIAL_SUITE_VERSION,
    generatedAt: new Date().toISOString(),
    passed:
      results.every((result) => result.passed) &&
      maliciousAutoApprovals === 0 &&
      ratio(organicFalseRejects, organicControls) <= 0.03,
    totalScenarios: results.length,
    passedScenarios,
    totalWallets: results.reduce((sum, result) => sum + result.walletCount, 0),
    maliciousWallets,
    organicControls,
    maliciousContained: maliciousWallets - maliciousAutoApprovals,
    maliciousAutoApprovals,
    organicFalseRejects,
    attackContainmentRate:
      maliciousWallets === 0
        ? 1
        : ratio(maliciousWallets - maliciousAutoApprovals, maliciousWallets),
    organicControlFalseRejectRate: ratio(organicFalseRejects, organicControls),
    scenarioPassRate: ratio(passedScenarios, results.length),
    results,
  }
  return report
}

export function formatAdversarialReport(report: AdversarialSuiteReport) {
  const percent = (value: number) => `${(value * 100).toFixed(2)}%`
  const lines = [
    `# Tri-Proof Adversarial Sybil Suite — ${report.suiteVersion}`,
    "",
    `Generated: ${report.generatedAt}`,
    `Gate: ${report.passed ? "PASS" : "FAIL"}`,
    `Scenarios: ${report.passedScenarios}/${report.totalScenarios} passed`,
    `Wallets exercised: ${report.totalWallets}`,
    `Malicious/adversarial wallets: ${report.maliciousWallets}`,
    `Organic/control wallets: ${report.organicControls}`,
    `Attack containment: ${percent(report.attackContainmentRate)}`,
    `Malicious auto-approvals: ${report.maliciousAutoApprovals}`,
    `Organic control false-reject rate: ${percent(report.organicControlFalseRejectRate)}`,
    "",
    "## Scenario results",
    "",
  ]

  report.results.forEach((result) => {
    lines.push(
      `- ${result.passed ? "PASS" : "FAIL"} — ${result.id}: ${result.title} (${result.chain}); clusters=${result.clusters}, approved=${result.approved}, review=${result.manualReview}, rejected=${result.rejected}`
    )
    result.failures.forEach((failure) => lines.push(`  - ${failure}`))
  })

  return `${lines.join("\n")}\n`
}
