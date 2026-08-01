import type {
  AnalysisResult,
  ClusterResult,
  EnrichmentMeta,
  EntityType,
  ParsedWallet,
  RiskLevel,
  RiskPolicy,
  SuggestedAction,
  WalletRiskResult,
  WalletStatus,
} from "@/types"
import {
  buildWalletGraphIntelligence,
  graphSignalForWallet,
  isNeutralServiceAddress,
  normalizeGraphAddress,
  type WalletGraphContext,
} from "@/lib/graph-intelligence"
import { detectKnownEntity } from "@/lib/risk-engine/known-entities"
import type { CrossCampaignContext } from "@/lib/risk-engine/index"

const ENGINE_VERSION = "2.1.0-scalable"
const RULESET_VERSION = "2026-08-01-high-volume"

type EvidenceFamily =
  | "funding"
  | "temporal"
  | "behavior"
  | "referral"
  | "campaign_event"
  | "participant"

type ClusterDraft = {
  label: string
  indexes: number[]
  families: EvidenceFamily[]
  sharedFundingSource: string | null
  behaviorSimilarityScore: number
  reasons: string[]
}

type DecisionPolicy = {
  approveMax: number
  rejectMin: number
  hardRejectMin: number
  severeClusterSize: number
  multiplier: number
  label: string
}

const POLICIES: Record<RiskPolicy, DecisionPolicy> = {
  conservative: {
    approveMax: 35,
    rejectMin: 90,
    hardRejectMin: 85,
    severeClusterSize: 14,
    multiplier: 0.9,
    label: "Conservative",
  },
  balanced: {
    approveMax: 35,
    rejectMin: 80,
    hardRejectMin: 70,
    severeClusterSize: 10,
    multiplier: 1,
    label: "Balanced",
  },
  strict: {
    approveMax: 25,
    rejectMin: 70,
    hardRejectMin: 55,
    severeClusterSize: 6,
    multiplier: 1.15,
    label: "Strict",
  },
}

const FAMILY_REASON: Record<EvidenceFamily, string> = {
  funding: "Funding evidence: shared first observed funding source",
  temporal: "Temporal evidence: aligned first funding or first activity window",
  behavior: "Behavior evidence: matching sampled program and activity fingerprint",
  referral: "Referral evidence: shared referrer wallet or referral code",
  campaign_event: "Campaign evidence: matching task, points band, and completion window",
  participant: "Campaign evidence: matching privacy-preserving participant fingerprint",
}

function riskLevel(score: number): RiskLevel {
  if (score <= 30) return "low"
  if (score <= 60) return "medium"
  if (score <= 85) return "high"
  return "critical"
}

function timeBucket(value: string | null | undefined, hours: number) {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  return Math.floor(timestamp / (hours * 3_600_000))
}

function numericBucket(value: number | null | undefined, width: number) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "unknown"
  return String(Math.round(value / width) * width)
}

function userLike(wallet: ParsedWallet) {
  return (
    !wallet.accountType ||
    wallet.accountType === "system_user_wallet" ||
    wallet.accountType === "historical_unresolved_account"
  )
}

function evidenceAvailable(wallet: ParsedWallet, entityType: EntityType) {
  if (wallet.accountType === "missing_or_closed_account") return false
  return (
    entityType !== "user" ||
    wallet.txCount !== null ||
    wallet.walletAgeDays !== null ||
    wallet.fundingSource !== null ||
    wallet.totalVolume !== null ||
    wallet.contractsCount !== null ||
    wallet.campaignActionsCount !== null ||
    wallet.uniqueCounterparties !== null ||
    wallet.isContract !== null ||
    wallet.accountType !== null ||
    wallet.enrichmentStatus === "completed"
  )
}

function isNonUser(wallet: ParsedWallet, entityType: EntityType) {
  if (entityType !== "user") return true
  return Boolean(
    wallet.accountType &&
      wallet.accountType !== "system_user_wallet" &&
      wallet.accountType !== "historical_unresolved_account"
  )
}

function behaviorKey(wallet: ParsedWallet) {
  const fingerprint = (wallet.behaviorFingerprint ?? []).slice(0, 8).join("|")
  if (!fingerprint) return null
  return [
    wallet.chain,
    numericBucket(wallet.walletAgeDays, 14),
    numericBucket(wallet.txCount, 5),
    numericBucket(wallet.contractsCount, 3),
    fingerprint,
  ].join(":")
}

function familyMemberships(
  wallet: ParsedWallet,
  graphContext: WalletGraphContext | null
) {
  const memberships = new Map<EvidenceFamily, string>()
  if (!userLike(wallet)) return memberships

  if (
    wallet.fundingSource &&
    !isNeutralServiceAddress(wallet.fundingSource, wallet.chain, graphContext)
  ) {
    memberships.set(
      "funding",
      `${wallet.chain}:${normalizeGraphAddress(wallet.fundingSource, wallet.chain)}`
    )
  }

  const observedAt = wallet.firstFundingAt ?? (!wallet.historyTruncated ? wallet.firstSeen : null)
  const observedBucket = timeBucket(observedAt, 6)
  if (observedBucket !== null) {
    memberships.set(
      "temporal",
      [
        wallet.chain,
        observedBucket,
        numericBucket(wallet.firstFundingAmount, 0.05),
      ].join(":")
    )
  }

  const behavior = behaviorKey(wallet)
  if (behavior) memberships.set("behavior", behavior)

  const referrer = wallet.referrerAddress ?? wallet.referralCode
  if (referrer) {
    memberships.set(
      "referral",
      `${wallet.chain}:${referrer.trim().toLowerCase()}`
    )
  }

  const eventBucket = timeBucket(wallet.campaignEventAt, 1)
  if (eventBucket !== null && wallet.campaignEventType) {
    memberships.set(
      "campaign_event",
      [
        wallet.chain,
        wallet.campaignEventType.trim().toLowerCase(),
        eventBucket,
        numericBucket(wallet.campaignPoints, 10),
      ].join(":")
    )
  }

  if (wallet.participantFingerprint) {
    memberships.set(
      "participant",
      `${wallet.chain}:${wallet.participantFingerprint}`
    )
  }

  return memberships
}

function strongFamilies(families: Set<EvidenceFamily>) {
  if (families.size >= 3) return true
  if (
    families.has("funding") &&
    (families.has("temporal") ||
      families.has("behavior") ||
      families.has("referral") ||
      families.has("participant"))
  ) {
    return true
  }
  return families.has("participant") && families.has("behavior")
}

function buildClusters(
  wallets: ParsedWallet[],
  graphContext: WalletGraphContext | null
) {
  type PairCandidate = {
    indexes: number[]
    families: Set<EvidenceFamily>
    fundingSource: string | null
  }

  const pairGroups = new Map<string, number[]>()
  const pairFamilies = new Map<string, [EvidenceFamily, EvidenceFamily]>()
  const membershipsByWallet = wallets.map((wallet) =>
    familyMemberships(wallet, graphContext)
  )

  membershipsByWallet.forEach((memberships, walletIndex) => {
    const entries = Array.from(memberships.entries()).sort(([left], [right]) =>
      left.localeCompare(right)
    )
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const first = entries[left]
        const second = entries[right]
        if (!first || !second) continue
        const key = `${first[0]}=${first[1]}||${second[0]}=${second[1]}`
        const indexes = pairGroups.get(key)
        if (indexes) indexes.push(walletIndex)
        else pairGroups.set(key, [walletIndex])
        if (!pairFamilies.has(key)) pairFamilies.set(key, [first[0], second[0]])
      }
    }
  })

  const candidatesByMembers = new Map<string, PairCandidate>()
  pairGroups.forEach((indexes, key) => {
    if (indexes.length < 3) return
    const unique = Array.from(new Set(indexes)).sort((a, b) => a - b)
    if (unique.length < 3) return
    const memberKey = unique.join(":")
    const families = pairFamilies.get(key)
    if (!families) return
    const current = candidatesByMembers.get(memberKey) ?? {
      indexes: unique,
      families: new Set<EvidenceFamily>(),
      fundingSource: null,
    }
    current.families.add(families[0])
    current.families.add(families[1])
    if (!current.fundingSource && current.families.has("funding")) {
      const fundingMembership = membershipsByWallet[unique[0]]?.get("funding") ?? null
      current.fundingSource = fundingMembership?.split(":").slice(1).join(":") ?? null
    }
    candidatesByMembers.set(memberKey, current)
  })

  const assigned = new Map<number, string>()
  const drafts: ClusterDraft[] = []
  Array.from(candidatesByMembers.values())
    .sort(
      (left, right) =>
        right.families.size - left.families.size ||
        right.indexes.length - left.indexes.length
    )
    .forEach((candidate) => {
      const available = candidate.indexes.filter((index) => !assigned.has(index))
      if (available.length < 3) return
      const families = Array.from(candidate.families).sort()
      const label = `CL-${String(drafts.length + 1).padStart(3, "0")}`
      available.forEach((index) => assigned.set(index, label))
      drafts.push({
        label,
        indexes: available,
        families,
        sharedFundingSource: candidate.fundingSource,
        behaviorSimilarityScore: Math.min(
          96,
          48 + families.length * 14 + available.length * 3
        ),
        reasons: [
          "High-volume corroborated cohort: at least two independent relationship signals overlap",
          ...families.map((family) => FAMILY_REASON[family]),
          "No single funding, timing, referral, behavior, campaign-event, or participant signal is conclusive by itself.",
        ],
      })
    })

  const draftByLabel = new Map(drafts.map((draft) => [draft.label, draft]))
  return { drafts, draftByLabel, assigned }
}

function scoreWallet({
  wallet,
  entityType,
  graphRisk,
  graphReasons,
  cluster,
  crossCampaign,
  policy,
}: {
  wallet: ParsedWallet
  entityType: EntityType
  graphRisk: number
  graphReasons: string[]
  cluster: ClusterDraft | null
  crossCampaign: {
    priorAnalyses: number
    confirmedRiskCount: number
    reviewedRejectionCount: number
    trustedUserCount: number
  } | null
  policy: DecisionPolicy
}) {
  const reasons: string[] = [
    `High-volume risk policy: ${policy.label}`,
    `Engine version: ${ENGINE_VERSION}`,
    `Ruleset version: ${RULESET_VERSION}`,
  ]
  let maturity = 0
  let behavior = 0
  let network = Math.min(70, Math.max(0, graphRisk))

  if (wallet.enrichmentStatus === "completed" && wallet.enrichmentProvider) {
    reasons.push(`On-chain verified via ${wallet.enrichmentProvider}`)
  }
  if (wallet.historyTruncated) {
    reasons.push(
      "High-volume screening used bounded real transaction samples; omitted history is not treated as negative evidence."
    )
  }

  if (wallet.walletAgeDays !== null && !wallet.historyTruncated) {
    if (wallet.walletAgeDays < 7) maturity += 25
    else if (wallet.walletAgeDays <= 30) maturity += 15
    else if (wallet.walletAgeDays <= 90) maturity += 8
  }
  if (wallet.txCount !== null) {
    if (wallet.txCount <= 2) maturity += 20
    else if (wallet.txCount <= 5) maturity += 12
    else if (wallet.txCount <= 15) maturity += 5
  }

  if (wallet.campaignOnlyRatio !== null && wallet.campaignOnlyRatio !== undefined) {
    if (wallet.campaignOnlyRatio >= 0.8) behavior += 30
    else if (wallet.campaignOnlyRatio >= 0.5) behavior += 18
    else if (wallet.campaignOnlyRatio >= 0.25) behavior += 8
  }
  if (
    wallet.behaviorDiversityScore !== null &&
    wallet.behaviorDiversityScore !== undefined
  ) {
    if (wallet.behaviorDiversityScore < 25) behavior += 18
    else if (wallet.behaviorDiversityScore < 45) behavior += 8
  }
  if (wallet.botScriptScore !== null && wallet.botScriptScore !== undefined) {
    if (wallet.botScriptScore >= 80) behavior += 35
    else if (wallet.botScriptScore >= 60) behavior += 22
    else if (wallet.botScriptScore >= 40) behavior += 10
  }
  if (
    wallet.campaignQualityScore !== null &&
    wallet.campaignQualityScore !== undefined
  ) {
    if (wallet.campaignQualityScore < 30) behavior += 25
    else if (wallet.campaignQualityScore < 50) behavior += 15
    else if (wallet.campaignQualityScore < 70) behavior += 7
  }

  if (cluster) {
    const familySet = new Set(cluster.families)
    const strong = strongFamilies(familySet)
    network += strong
      ? cluster.indexes.length >= 10
        ? 30
        : cluster.indexes.length >= 6
          ? 20
          : 10
      : 5
    reasons.push(...cluster.reasons)
  }
  if (graphReasons.length) reasons.push(...graphReasons)

  if (crossCampaign) {
    const riskHistory =
      crossCampaign.confirmedRiskCount + crossCampaign.reviewedRejectionCount
    if (riskHistory > 0) {
      network += Math.min(15, riskHistory * 5)
      reasons.push(
        `Cross-campaign context: ${riskHistory} prior confirmed-risk or reviewer-rejection event(s).`
      )
    }
    if (riskHistory > 0 && crossCampaign.trustedUserCount > 0) {
      reasons.push(
        "Cross-campaign conflict: trusted-user and risk labels coexist; human review is required."
      )
    }
  }

  maturity = Math.min(35, maturity)
  behavior = Math.min(45, behavior)
  network = Math.min(70, network)
  let score = Math.round((maturity + behavior + network) * policy.multiplier)

  if (entityType !== "user") score = Math.max(score, 75)
  if (wallet.accountType && wallet.accountType !== "system_user_wallet") {
    score = Math.max(
      score,
      wallet.accountType === "historical_unresolved_account" ? 45 : 75
    )
  }
  score = Math.max(0, Math.min(100, score))
  return { score, reasons }
}

function decide({
  wallet,
  entityType,
  score,
  hardSignal,
  cluster,
  crossConflict,
  policy,
}: {
  wallet: ParsedWallet
  entityType: EntityType
  score: number
  hardSignal: boolean
  cluster: ClusterDraft | null
  crossConflict: boolean
  policy: DecisionPolicy
}): {
  status: WalletStatus
  action: SuggestedAction
  explanation: string
  category: string
} {
  if (wallet.enrichmentStatus === "failed") {
    return {
      status: "manual_review",
      action: "manual_review",
      explanation:
        "Gray Zone: provider access failed after retries. No Sybil or eligibility decision was made from partial data.",
      category: "provider_unavailable",
    }
  }

  if (!evidenceAvailable(wallet, entityType)) {
    return {
      status: "manual_review",
      action: "manual_review",
      explanation:
        "Gray Zone: insufficient reliable on-chain evidence. This wallet is not classified as Sybil.",
      category: "insufficient_data",
    }
  }

  if (wallet.accountType === "historical_unresolved_account") {
    return {
      status: "manual_review",
      action: "manual_review",
      explanation:
        "Gray Zone: historical activity exists but current account state is unresolved.",
      category: "account_state_uncertain",
    }
  }

  if (isNonUser(wallet, entityType)) {
    return {
      status: "rejected",
      action: "reject",
      explanation:
        "Not eligible: the address is a service, exchange, contract, program, token, or other non-user account. This is not counted as a Sybil finding.",
      category: "ineligible_non_user_account",
    }
  }

  const families = new Set(cluster?.families ?? [])
  const strongCluster = cluster ? strongFamilies(families) : false
  const weakOnly =
    cluster &&
    !strongCluster &&
    Array.from(families).every((family) =>
      family === "referral" || family === "campaign_event"
    )

  if (crossConflict && !hardSignal) {
    return {
      status: "manual_review",
      action: "manual_review",
      explanation:
        "Gray Zone: prior trusted-user and confirmed-risk decisions conflict. Historical labels cannot decide the current campaign automatically.",
      category: "cross_campaign_conflict",
    }
  }

  if (hardSignal && score >= policy.hardRejectMin) {
    return {
      status: "rejected",
      action: "reject",
      explanation:
        `Rejected under ${policy.label} policy: high-confidence graph evidence is supported by risk score ${score}.`,
      category: "rejected_sybil",
    }
  }

  if (
    cluster &&
    strongCluster &&
    cluster.indexes.length >= policy.severeClusterSize
  ) {
    return {
      status: "rejected",
      action: "reject",
      explanation:
        `Rejected under ${policy.label} policy: a severe ${cluster.indexes.length}-wallet cohort is supported by independent evidence families.`,
      category: "rejected_sybil",
    }
  }

  if (score >= policy.rejectMin && (hardSignal || strongCluster)) {
    return {
      status: "rejected",
      action: "reject",
      explanation:
        `Rejected under ${policy.label} policy: the automatic threshold was crossed with corroborated evidence.`,
      category: "rejected_sybil",
    }
  }

  if (score <= policy.approveMax && !cluster && !hardSignal) {
    return {
      status: "approved",
      action: "approve",
      explanation:
        `Approved under ${policy.label} policy: real on-chain evidence is available and no corroborated cluster or hard signal was found.`,
      category: "approved",
    }
  }

  return {
    status: "manual_review",
    action: "manual_review",
    explanation: weakOnly
      ? "Gray Zone: common referral and campaign timing correlations cannot trigger automatic exclusion without stronger evidence."
      : `Gray Zone under ${policy.label} policy: evidence requires human review and does not meet the automatic exclusion standard.`,
    category: weakOnly ? "weak_cluster_evidence" : "manual_review",
  }
}

export function analyzeWalletsScalable(
  wallets: ParsedWallet[],
  enrichment: EnrichmentMeta | null,
  riskPolicy: RiskPolicy,
  graphContext: WalletGraphContext | null,
  crossCampaignContext: CrossCampaignContext | null
): AnalysisResult {
  const policy = POLICIES[riskPolicy]
  const graphIntelligence = buildWalletGraphIntelligence(wallets, graphContext)
  const { drafts, draftByLabel, assigned } = buildClusters(wallets, graphContext)

  const walletResults: WalletRiskResult[] = wallets.map((wallet, index) => {
    const known = detectKnownEntity(wallet.walletAddress)
    const entityType: EntityType =
      known?.type ??
      wallet.knownEntityType ??
      (wallet.isContract ? "contract" : "user")
    const entityLabel = known?.label ?? wallet.knownEntityLabel ?? null
    const graphSignal = graphSignalForWallet(
      graphIntelligence,
      wallet.walletAddress,
      wallet.chain
    )
    const clusterId = assigned.get(index) ?? null
    const cluster = clusterId ? draftByLabel.get(clusterId) ?? null : null
    const crossKey = normalizeGraphAddress(wallet.walletAddress, wallet.chain)
    const cross = crossCampaignContext?.walletSignals[crossKey] ?? null
    const crossConflict = Boolean(
      cross &&
        cross.trustedUserCount > 0 &&
        cross.confirmedRiskCount + cross.reviewedRejectionCount > 0
    )
    const scored = scoreWallet({
      wallet,
      entityType,
      graphRisk: graphSignal.riskDelta,
      graphReasons: graphSignal.reasons,
      cluster,
      crossCampaign: cross,
      policy,
    })
    const decision = decide({
      wallet,
      entityType,
      score: scored.score,
      hardSignal: graphSignal.hardSignal,
      cluster,
      crossConflict,
      policy,
    })
    const reasons = [
      ...scored.reasons,
      `Decision category: ${decision.category}`,
      ...(wallet.policyAction || wallet.reputationLabel || wallet.customerLabel
        ? [
            `Customer-provided context retained without overriding the engine decision (${wallet.reputationLabel ?? wallet.customerLabel ?? wallet.policyAction}).`,
          ]
        : []),
    ]

    return {
      walletAddress: wallet.walletAddress,
      chain: wallet.chain,
      entityLabel,
      entityType,
      entityRiskReason: known?.reason ?? null,
      riskScore: scored.score,
      riskLevel: riskLevel(scored.score),
      status: decision.status,
      recommendedAction: decision.action,
      statusExplanation: decision.explanation,
      fundingSource: wallet.fundingSource,
      firstFundingAt: wallet.firstFundingAt ?? null,
      firstFundingAmount: wallet.firstFundingAmount ?? null,
      historyTruncated: wallet.historyTruncated ?? null,
      txCount: wallet.txCount,
      walletAgeDays: wallet.walletAgeDays,
      totalVolume: wallet.totalVolume,
      contractsCount: wallet.contractsCount,
      campaignActionsCount: wallet.campaignActionsCount,
      clusterId,
      graphComponentId: graphSignal.componentId,
      graphRiskScore: graphSignal.riskDelta,
      reasons,
      firstSeen: wallet.firstSeen,
      lastSeen: wallet.lastSeen,
      nativeBalance: wallet.nativeBalance ?? null,
      tokenCount: wallet.tokenCount ?? null,
      uniqueCounterparties: wallet.uniqueCounterparties ?? null,
      lastActiveDaysAgo: wallet.lastActiveDaysAgo ?? null,
      isContract: wallet.isContract ?? null,
      accountType: wallet.accountType ?? null,
      ownerProgram: wallet.ownerProgram ?? null,
      behaviorFingerprint: wallet.behaviorFingerprint ?? null,
      campaignQualityScore: wallet.campaignQualityScore ?? null,
      campaignOnlyRatio: wallet.campaignOnlyRatio ?? null,
      behaviorDiversityScore: wallet.behaviorDiversityScore ?? null,
      botScriptScore: wallet.botScriptScore ?? null,
      policyAction: wallet.policyAction ?? null,
      reputationLabel: wallet.reputationLabel ?? null,
      policyReason: wallet.policyReason ?? null,
      customerLabel: wallet.customerLabel ?? null,
      enrichmentProvider: wallet.enrichmentProvider ?? null,
      enrichmentStatus: wallet.enrichmentStatus ?? null,
    }
  })

  const clusters: ClusterResult[] = drafts.map((draft) => {
    const members = draft.indexes.map((index) => walletResults[index]).filter(Boolean)
    const averageRiskScore = members.length
      ? Number(
          (
            members.reduce((sum, wallet) => sum + wallet.riskScore, 0) /
            members.length
          ).toFixed(1)
        )
      : 0
    const familySet = new Set(draft.families)
    const action: SuggestedAction =
      strongFamilies(familySet) &&
      (draft.indexes.length >= policy.severeClusterSize ||
        averageRiskScore >= policy.rejectMin)
        ? "reject"
        : "manual_review"

    return {
      clusterLabel: draft.label,
      walletCount: members.length,
      averageRiskScore,
      sharedFundingSource: draft.sharedFundingSource,
      behaviorSimilarityScore: draft.behaviorSimilarityScore,
      suggestedAction: action,
      reasons: draft.reasons,
      walletAddresses: members.map((wallet) => wallet.walletAddress),
    }
  })

  const riskDistribution: Record<RiskLevel, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  }
  walletResults.forEach((wallet) => {
    riskDistribution[wallet.riskLevel] += 1
  })
  const totalWallets = walletResults.length
  const approvedCount = walletResults.filter((wallet) => wallet.status === "approved").length
  const manualReviewCount = walletResults.filter(
    (wallet) => wallet.status === "manual_review"
  ).length
  const rejectedCount = walletResults.filter((wallet) => wallet.status === "rejected").length
  const averageRiskScore = totalWallets
    ? Number(
        (
          walletResults.reduce((sum, wallet) => sum + wallet.riskScore, 0) /
          totalWallets
        ).toFixed(1)
      )
    : 0

  return {
    wallets: walletResults,
    clusters,
    graph: graphIntelligence.graph,
    totalWallets,
    approvedCount,
    manualReviewCount,
    rejectedCount,
    averageRiskScore,
    riskDistribution,
    enrichment,
  }
}
