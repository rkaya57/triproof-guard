import type { AnalysisDetail, ParsedWallet } from "@/types"
import { analyzeWallets } from "@/lib/risk-engine"

function evmAddress(seed: number) {
  return `0x${seed.toString(16).padStart(40, "0")}`
}

function demoWallets(): ParsedWallet[] {
  const wallets: ParsedWallet[] = []

  for (let index = 1; index <= 500; index += 1) {
    const isLargeCluster = index <= 46
    const isMediumCluster = index > 46 && index <= 72
    const healthy = index > 180
    const fundingSource = isLargeCluster
      ? evmAddress(900001)
      : isMediumCluster
        ? evmAddress(900002)
        : index % 53 === 0
          ? evmAddress(900003)
          : evmAddress(700000 + index)

    wallets.push({
      walletAddress: evmAddress(index),
      chain: "Ethereum",
      txCount: healthy ? 24 + (index % 90) : isLargeCluster ? 2 + (index % 4) : 4 + (index % 18),
      walletAgeDays: healthy ? 130 + (index % 720) : isLargeCluster ? 3 + (index % 18) : 20 + (index % 88),
      fundingSource,
      firstSeen: null,
      lastSeen: null,
      totalVolume: healthy ? 95 + index * 1.7 : isLargeCluster ? 1 + (index % 8) : 8 + index * 0.3,
      contractsCount: healthy ? 8 + (index % 18) : isLargeCluster ? index % 2 : 2 + (index % 6),
      campaignActionsCount: healthy ? 1 + (index % 4) : 5 + (index % 8),
    })
  }

  return wallets
}

export function getDemoAnalysis(): AnalysisDetail {
  const result = analyzeWallets(demoWallets())

  return {
    id: "demo",
    status: "completed",
    totalWallets: result.totalWallets,
    approvedCount: result.approvedCount,
    manualReviewCount: result.manualReviewCount,
    rejectedCount: result.rejectedCount,
    averageRiskScore: result.averageRiskScore,
    suspiciousClustersCount: result.clusters.length,
    csvFileName: "demo-wallets.csv",
    createdAt: new Date("2026-02-14T10:30:00.000Z").toISOString(),
    completedAt: new Date("2026-02-14T10:31:20.000Z").toISOString(),
    project: {
      id: "demo-project",
      name: "Sample Ethereum Airdrop Audit",
      campaignType: "Airdrop",
      chain: "Ethereum",
      notes: "Demo report with a large shared funding source cluster.",
    },
    wallets: result.wallets,
    clusters: result.clusters.slice(0, 8),
  }
}
