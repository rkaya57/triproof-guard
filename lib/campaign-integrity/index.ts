import type {
  WalletGraphComponent,
  WalletGraphFinding,
  WalletGraphSeverity,
  WalletGraphSummary,
  ClusterResult,
} from "@/types"

export type CampaignIntegrityHealth = "strong" | "review" | "at_risk" | "critical" | "unavailable"

export type CampaignIntegritySignal = WalletGraphFinding & {
  affectedWalletCount: number
}

export type CampaignIntegrityCohort = Pick<
  WalletGraphComponent,
  "componentId" | "walletAddresses" | "riskScore" | "severity" | "dominantReferrer" | "reasons"
>

export type CampaignIntegritySnapshot = {
  available: boolean
  score: number | null
  health: CampaignIntegrityHealth
  label: string
  summary: string
  referralLinks: number
  affectedWalletCount: number
  priorityCohorts: CampaignIntegrityCohort[]
  campaignEvidenceCohorts: Array<
    Pick<
      ClusterResult,
      "clusterLabel" | "walletCount" | "behaviorSimilarityScore" | "sharedFundingSource" | "reasons"
    >
  >
  signals: CampaignIntegritySignal[]
  recommendations: string[]
}

const referralFindingCodes = new Set([
  "REFERRAL_FANOUT",
  "FUNDER_REFERRER_OVERLAP",
  "COORDINATED_REFERRAL_FUNDING",
  "SELF_REFERRAL",
  "CIRCULAR_WALLET_PATH",
])

const severityRank: Record<WalletGraphSeverity, number> = {
  info: 0,
  caution: 1,
  high: 2,
  critical: 3,
}

const severityPenalty: Record<WalletGraphSeverity, number> = {
  info: 0,
  caution: 7,
  high: 15,
  critical: 24,
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

function healthForScore(score: number): Exclude<CampaignIntegrityHealth, "unavailable"> {
  if (score >= 85) return "strong"
  if (score >= 65) return "review"
  if (score >= 40) return "at_risk"
  return "critical"
}

function labelForHealth(health: CampaignIntegrityHealth) {
  if (health === "strong") return "Strong"
  if (health === "review") return "Review referral patterns"
  if (health === "at_risk") return "Referral abuse risk"
  if (health === "critical") return "Immediate review required"
  return "Referral data unavailable"
}

function isReferralFinding(finding: WalletGraphFinding) {
  return referralFindingCodes.has(finding.code)
}

function isPriorityFinding(finding: WalletGraphFinding) {
  return finding.severity === "high" || finding.severity === "critical"
}

function hasCampaignCohortEvidence(cluster: ClusterResult) {
  return cluster.reasons.some((reason) =>
    /Campaign evidence:|participant fingerprint|Referral evidence:/i.test(reason)
  )
}

function describeReferralSource(value: string | null, reasons: string[]) {
  if (!value) {
    return reasons.some((reason) => /funding and referral|funder and referrer/i.test(reason))
      ? "Funding + referral overlap"
      : "Referral source recorded"
  }
  if (value.startsWith("referral-code:")) return `Code ${value.replace("referral-code:", "")}`
  const valueWithoutPrefix = value.replace(/^address:[^:]+:/, "")
  return valueWithoutPrefix.length > 16
    ? `${valueWithoutPrefix.slice(0, 7)}...${valueWithoutPrefix.slice(-5)}`
    : valueWithoutPrefix
}

export function buildCampaignIntegritySnapshot(
  graph: WalletGraphSummary | null | undefined,
  totalWallets: number,
  clusters: ClusterResult[] = []
): CampaignIntegritySnapshot {
  const campaignEvidenceCohorts = clusters
    .filter(hasCampaignCohortEvidence)
    .sort(
      (left, right) =>
        right.behaviorSimilarityScore - left.behaviorSimilarityScore ||
        right.walletCount - left.walletCount
    )
    .slice(0, 4)

  if ((!graph || graph.referralLinks === 0) && !campaignEvidenceCohorts.length) {
    return {
      available: false,
      score: null,
      health: "unavailable",
      label: labelForHealth("unavailable"),
      summary: "Add referral or campaign-event fields to evaluate campaign integrity alongside wallet and funding evidence.",
      referralLinks: graph?.referralLinks ?? 0,
      affectedWalletCount: 0,
      priorityCohorts: [],
      campaignEvidenceCohorts: [],
      signals: [],
      recommendations: [
        "Include referrer_address or referral_code in the next campaign upload.",
        "Include referral_timestamp when available so reviewers can inspect campaign timing alongside the graph.",
        "Include campaign_event_at and campaign_event_type to inspect task-timing cohorts without importing raw personal identifiers.",
      ],
    }
  }

  const signals = (graph?.findings ?? [])
    .filter(isReferralFinding)
    .map((finding) => ({
      ...finding,
      affectedWalletCount: finding.walletAddresses.length,
    }))
    .sort(
      (left, right) =>
        severityRank[right.severity] - severityRank[left.severity] ||
        right.affectedWalletCount - left.affectedWalletCount
    )

  const prioritySignals = signals.filter(isPriorityFinding)
  const affectedWallets = new Set(
    prioritySignals.flatMap((finding) => finding.walletAddresses)
  )
  const referralWallets = new Set(signals.flatMap((finding) => finding.walletAddresses))
  const priorityCohorts = (graph?.components ?? [])
    .filter((component) => component.walletAddresses.some((address) => referralWallets.has(address)))
    .sort(
      (left, right) =>
        right.riskScore - left.riskScore ||
        right.walletAddresses.length - left.walletAddresses.length
    )
    .slice(0, 4)

  const signalPenalty = Math.min(
    50,
    prioritySignals.reduce((total, finding) => total + severityPenalty[finding.severity], 0)
  )
  const impactPenalty = Math.min(
    30,
    Math.round((affectedWallets.size / Math.max(totalWallets, 1)) * 50)
  )
  const cohortPenalty = Math.min(
    16,
    priorityCohorts.filter((component) => component.riskScore >= 55).length * 4
  )
  const campaignCohortPenalty = Math.min(
    24,
    campaignEvidenceCohorts.reduce(
      (total, cohort) => total + (cohort.behaviorSimilarityScore >= 80 ? 10 : 6),
      0
    )
  )
  const score = clamp(100 - signalPenalty - impactPenalty - cohortPenalty - campaignCohortPenalty, 0, 100)
  const health = healthForScore(score)
  const recommendations: string[] = []

  if (prioritySignals.some((finding) => finding.code === "SELF_REFERRAL")) {
    recommendations.push("Hold self-referral wallets until the campaign team verifies their eligibility.")
  }
  if (prioritySignals.some((finding) => finding.code === "COORDINATED_REFERRAL_FUNDING" || finding.code === "FUNDER_REFERRER_OVERLAP")) {
    recommendations.push("Review funding and referral overlap together; shared funding alone should not trigger exclusion.")
  }
  if (prioritySignals.some((finding) => finding.code === "CIRCULAR_WALLET_PATH")) {
    recommendations.push("Escalate circular wallet paths for manual review before finalizing rewards.")
  }
  if (campaignEvidenceCohorts.some((cohort) => cohort.reasons.some((reason) => /Campaign evidence:/i.test(reason)))) {
    recommendations.push("Review matching task type, points band, and completion-time cohorts alongside on-chain funding or referral evidence.")
  }
  if (campaignEvidenceCohorts.some((cohort) => cohort.reasons.some((reason) => /participant fingerprint/i.test(reason)))) {
    recommendations.push("Validate fingerprint consent and hashing at the campaign source; never upload raw device or personal identifiers.")
  }
  if (!recommendations.length) {
    recommendations.push("Referral volume is informational unless corroborated by other campaign signals.")
    recommendations.push("Review the largest referral cohorts before finalizing reward eligibility.")
  }

  const referralSummary = prioritySignals.length
    ? `${prioritySignals.length} corroborated referral signal${prioritySignals.length === 1 ? "" : "s"} affect ${affectedWallets.size} wallet${affectedWallets.size === 1 ? "" : "s"}.`
    : "No high-severity referral abuse signal was recorded."
  const campaignSummary = campaignEvidenceCohorts.length
    ? `${campaignEvidenceCohorts.length} corroborated campaign cohort${campaignEvidenceCohorts.length === 1 ? "" : "s"} require reviewer attention.`
    : "No corroborated campaign-event cohort was recorded."

  return {
    available: true,
    score,
    health,
    label: labelForHealth(health),
    summary: `${referralSummary} ${campaignSummary} A single campaign signal never lowers integrity on its own.`,
    referralLinks: graph?.referralLinks ?? 0,
    affectedWalletCount: affectedWallets.size,
    priorityCohorts: priorityCohorts.map((component) => ({
      ...component,
      dominantReferrer: describeReferralSource(component.dominantReferrer, component.reasons),
    })),
    campaignEvidenceCohorts,
    signals: signals.slice(0, 5),
    recommendations: recommendations.slice(0, 3),
  }
}
