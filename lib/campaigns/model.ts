export const CAMPAIGN_LIFECYCLES = [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
] as const

export type CampaignLifecycle = (typeof CAMPAIGN_LIFECYCLES)[number]

export type CampaignAnalysisRunSummary = {
  id: string
  status: string
  totalWallets: number
  approvedCount: number
  manualReviewCount: number
  rejectedCount: number
  averageRiskScore: number
  suspiciousClustersCount: number
  modelVersion: string | null
  policyVersion: string | null
  inputHash: string | null
  createdAt: string
  completedAt: string | null
}

export type CampaignRecord = {
  id: string
  name: string
  campaignType: string
  /** Legacy compatibility field. New campaign code should prefer `networks`. */
  chain: string
  networks: string[]
  lifecycle: CampaignLifecycle
  notes: string | null
  startsAt: string | null
  endsAt: string | null
  rewardPoolUsd: number | null
  metadata: unknown | null
  analysisRunCount: number
  latestAnalysisId: string | null
  createdAt: string
  updatedAt: string
  analyses: CampaignAnalysisRunSummary[]
}

type LegacyCampaignProject = {
  id: string
  name: string
  campaignType: string
  chain: string
  notes: string | null
  createdAt: Date
  updatedAt: Date
  analyses: Array<{
    id: string
    status: unknown
    totalWallets: number
    approvedCount: number
    manualReviewCount: number
    rejectedCount: number
    averageRiskScore: number
    suspiciousClustersCount: number
    createdAt: Date
    completedAt: Date | null
  }>
}

type AnalysisRunMetadata = {
  modelVersion: string
  policyVersion: string | null
  inputHash: string | null
}

const NETWORK_ALIASES: Record<string, string> = {
  sol: "solana",
  solana: "solana",
  eth: "ethereum",
  ethereum: "ethereum",
  evm: "evm",
  base: "base",
  arbitrum: "arbitrum",
  arb: "arbitrum",
  optimism: "optimism",
  op: "optimism",
  polygon: "polygon",
  matic: "polygon",
  bsc: "bnb-chain",
  bnb: "bnb-chain",
  "bnb chain": "bnb-chain",
}

function normalizeNetworkName(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")
  if (!normalized) return null
  return NETWORK_ALIASES[normalized] ?? normalized.replace(/\s+/g, "-")
}

/** Converts legacy single-chain strings such as `Solana + EVM` into campaign-native network scope. */
export function normalizeCampaignNetworks(chain: string, explicitNetworks: readonly string[] = []) {
  const candidates = explicitNetworks.length > 0
    ? explicitNetworks
    : chain.split(/\s*(?:\+|,|\/|\||&)\s*/g)

  const unique = new Set<string>()

  for (const candidate of candidates) {
    const normalized = normalizeNetworkName(candidate)
    if (normalized) unique.add(normalized)
  }

  return [...unique]
}

/**
 * Transitional adapter: `Project` remains the legacy persistence model while
 * new campaign-native state is layered on top without a destructive rename.
 */
export function buildCampaignRecord(
  project: LegacyCampaignProject,
  options: {
    lifecycle?: CampaignLifecycle
    networks?: readonly string[]
    startsAt?: Date | null
    endsAt?: Date | null
    rewardPoolUsd?: number | null
    metadata?: unknown | null
    analysisRunCount?: number
    analysisRunMetadata?: Readonly<Record<string, AnalysisRunMetadata>>
  } = {},
): CampaignRecord {
  const analyses = project.analyses.map((analysis) => {
    const metadata = options.analysisRunMetadata?.[analysis.id]
    return {
      ...analysis,
      status: String(analysis.status),
      modelVersion: metadata?.modelVersion ?? null,
      policyVersion: metadata?.policyVersion ?? null,
      inputHash: metadata?.inputHash ?? null,
      createdAt: analysis.createdAt.toISOString(),
      completedAt: analysis.completedAt?.toISOString() ?? null,
    }
  })

  return {
    id: project.id,
    name: project.name,
    campaignType: project.campaignType,
    chain: project.chain,
    networks: normalizeCampaignNetworks(project.chain, options.networks),
    lifecycle: options.lifecycle ?? "active",
    notes: project.notes,
    startsAt: options.startsAt?.toISOString() ?? null,
    endsAt: options.endsAt?.toISOString() ?? null,
    rewardPoolUsd: options.rewardPoolUsd ?? null,
    metadata: options.metadata ?? null,
    analysisRunCount: options.analysisRunCount ?? analyses.length,
    latestAnalysisId: analyses[0]?.id ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    analyses,
  }
}
