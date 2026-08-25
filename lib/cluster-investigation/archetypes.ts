import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"

export const CLUSTER_ARCHETYPE_SCHEMA_VERSION = "tri-proof-cluster-archetype-v1" as const

export type ClusterArchetypeId =
  | "funding_farm"
  | "coordinated_claim_group"
  | "behavioral_clone_group"
  | "transfer_ring"
  | "bridge_coordinated_group"
  | "possible_shared_operator"
  | "unclassified"

export type ClusterArchetypeConfidence = "low" | "medium" | "high"

export type ClusterArchetypeCandidate = {
  id: ClusterArchetypeId
  label: string
  confidence: ClusterArchetypeConfidence
  score: number
  reasons: string[]
  caveats: string[]
}

export type ClusterArchetypeAssessment = {
  schemaVersion: typeof CLUSTER_ARCHETYPE_SCHEMA_VERSION
  clusterLabel: string
  primary: ClusterArchetypeCandidate
  candidates: ClusterArchetypeCandidate[]
  boundaries: string[]
}

const labels: Record<ClusterArchetypeId, string> = {
  funding_farm: "Funding Farm",
  coordinated_claim_group: "Coordinated Claim Group",
  behavioral_clone_group: "Behavioral Clone Group",
  transfer_ring: "Transfer Ring",
  bridge_coordinated_group: "Bridge-Coordinated Group",
  possible_shared_operator: "Possible Shared Operator",
  unclassified: "Unclassified Pattern",
}

const tiePriority: Record<ClusterArchetypeId, number> = {
  transfer_ring: 7,
  possible_shared_operator: 6,
  funding_farm: 5,
  coordinated_claim_group: 4,
  behavioral_clone_group: 3,
  bridge_coordinated_group: 2,
  unclassified: 1,
}

function confidence(score: number): ClusterArchetypeConfidence {
  if (score >= 7) return "high"
  if (score >= 4) return "medium"
  return "low"
}

function candidate(
  id: ClusterArchetypeId,
  score: number,
  reasons: string[],
  caveats: string[] = [],
): ClusterArchetypeCandidate {
  return {
    id,
    label: labels[id],
    confidence: confidence(score),
    score,
    reasons,
    caveats,
  }
}

function groupingFamilies(report: ClusterInvestigationReport) {
  return new Set(report.grouping.families.map((item) => item.family))
}

function memberEvidenceCodes(report: ClusterInvestigationReport) {
  return new Set(report.members.flatMap((member) => member.decisionEvidenceCodes))
}

function textCorpus(report: ClusterInvestigationReport) {
  const values = [
    ...report.cluster.storedReasons,
    ...report.grouping.families.map((item) => item.storedReason),
    ...report.members.flatMap((member) => member.reasons),
    ...report.provenance.graph.edges.flatMap((edge) => edge.evidence),
    ...report.provenance.funding.relationships.map((relationship) => relationship.suppressionReason ?? ""),
  ]
  return values.join(" ").toLowerCase()
}

function fundingFarm(report: ClusterInvestigationReport, families: Set<string>) {
  let score = 0
  const reasons: string[] = []
  if (families.has("funding")) {
    score += 2
    reasons.push("Stored grouping includes an independent funding family.")
  }
  if (families.has("temporal")) {
    score += 2
    reasons.push("Stored grouping includes temporal coordination.")
  }
  if (families.has("behavior")) {
    score += 1
    reasons.push("Stored grouping also includes behavior similarity.")
  }
  if (report.provenance.funding.riskBearingCount > 0) {
    score += 3
    reasons.push(`${report.provenance.funding.riskBearingCount} canonical funding relationship(s) are stored as risk-bearing.`)
  }
  const shared = report.provenance.funding.relationships.some(
    (item) => item.kind === "SAME_FUNDER" || item.kind === "SAME_FUNDING_LINEAGE",
  )
  if (shared) {
    score += 1
    reasons.push("Canonical provenance includes shared-funder or shared-lineage context.")
  }
  if (!families.has("funding") || score < 4) return null
  return candidate("funding_farm", score, reasons, [
    "Funding reuse alone is never sufficient to infer common control.",
    "Known exchange, bridge, protocol, or trusted-distributor fan-out remains neutralized context.",
  ])
}

function coordinatedClaimGroup(report: ClusterInvestigationReport, families: Set<string>) {
  let score = 0
  const reasons: string[] = []
  if (families.has("campaign_event")) {
    score += 3
    reasons.push("Stored grouping includes campaign-event coordination.")
  }
  if (families.has("temporal")) {
    score += 2
    reasons.push("Campaign activity is corroborated by a temporal grouping family.")
  }
  if (families.has("referral")) {
    score += 2
    reasons.push("Campaign activity is corroborated by referral relationships.")
  }
  if (families.has("behavior")) {
    score += 1
    reasons.push("Behavior similarity provides additional campaign-context corroboration.")
  }
  if (!families.has("campaign_event") || score < 5) return null
  return candidate("coordinated_claim_group", score, reasons, [
    "This label describes coordinated campaign participation; it does not prove that claims were fraudulent.",
  ])
}

function behavioralCloneGroup(report: ClusterInvestigationReport, families: Set<string>) {
  let score = 0
  const reasons: string[] = []
  if (families.has("behavior")) {
    score += 3
    reasons.push("Stored grouping includes behavior similarity.")
  }
  if (families.has("temporal")) {
    score += 2
    reasons.push("Behavior similarity overlaps with temporal coordination.")
  }
  if (families.has("participant")) {
    score += 2
    reasons.push("A participant-fingerprint family corroborates the behavior pattern.")
  }
  if (report.cluster.behaviorSimilarityScore >= 80) {
    score += 1
    reasons.push(`Stored behavior similarity score is ${report.cluster.behaviorSimilarityScore}.`)
  }
  if (!families.has("behavior") || score < 4) return null
  return candidate("behavioral_clone_group", score, reasons, [
    "Similar behavior can arise organically; this archetype requires independent corroboration before operational use.",
  ])
}

function transferRing(report: ClusterInvestigationReport, codes: Set<string>, corpus: string) {
  let score = 0
  const reasons: string[] = []
  if (codes.has("CIRCULAR_PATH")) {
    score += 6
    reasons.push("Wallet-level Decision Evidence contains the deterministic CIRCULAR_PATH code.")
  }
  if (corpus.includes("circular") || corpus.includes("transfer ring")) {
    score += 2
    reasons.push("Stored evidence text contains circular-transfer context.")
  }
  if (score < 6) return null
  return candidate("transfer_ring", score, reasons, [
    "A circular transfer topology is an investigation pattern, not proof of beneficial ownership or intent.",
  ])
}

function bridgeCoordinatedGroup(report: ClusterInvestigationReport, families: Set<string>, corpus: string) {
  const bridgeContext = corpus.includes("bridge")
  if (!bridgeContext) return null

  let score = 1
  const reasons = ["Canonical or stored evidence includes bridge-related context."]
  if (families.has("temporal")) {
    score += 2
    reasons.push("Bridge context overlaps with temporal coordination.")
  }
  if (families.has("behavior")) {
    score += 2
    reasons.push("Bridge context overlaps with behavior similarity.")
  }
  if (families.has("campaign_event")) {
    score += 2
    reasons.push("Bridge context overlaps with coordinated campaign activity.")
  }
  if (score < 5) return null
  return candidate("bridge_coordinated_group", score, reasons, [
    "Bridge usage itself is not a risk signal and known bridge fan-out remains neutral context.",
    "The archetype is retained only because independent non-bridge grouping families also exist.",
  ])
}

function possibleSharedOperator(report: ClusterInvestigationReport, families: Set<string>) {
  let score = 0
  const reasons: string[] = []
  if (families.size >= 3) {
    score += 3
    reasons.push(`${families.size} independent stored grouping families overlap.`)
  }
  if (report.provenance.funding.riskBearingCount > 0) {
    score += 2
    reasons.push("Risk-bearing canonical funding provenance is present.")
  }
  if (report.provenance.graph.riskBearingEdgeCount > 0) {
    score += 2
    reasons.push("Risk-bearing graph context is present.")
  }
  const highConfidenceMembers = report.members.filter((member) => member.evidenceConfidence === "high").length
  if (highConfidenceMembers >= Math.max(2, Math.ceil(report.members.length / 2))) {
    score += 1
    reasons.push("A substantial share of members have high wallet-level evidence confidence.")
  }
  if (score < 7) return null
  return candidate("possible_shared_operator", score, reasons, [
    "Possible Shared Operator is deliberately probabilistic wording and is never a common-control finding.",
    "Operator attribution requires evidence outside this inferred archetype layer.",
  ])
}

export function assessClusterArchetypes(report: ClusterInvestigationReport): ClusterArchetypeAssessment {
  const families = groupingFamilies(report)
  const codes = memberEvidenceCodes(report)
  const corpus = textCorpus(report)
  const candidates = [
    transferRing(report, codes, corpus),
    possibleSharedOperator(report, families),
    fundingFarm(report, families),
    coordinatedClaimGroup(report, families),
    behavioralCloneGroup(report, families),
    bridgeCoordinatedGroup(report, families, corpus),
  ].filter((item): item is ClusterArchetypeCandidate => Boolean(item))
    .sort((left, right) => right.score - left.score || tiePriority[right.id] - tiePriority[left.id] || left.id.localeCompare(right.id))

  const primary = candidates[0] ?? candidate("unclassified", 0, [
    "The stored evidence does not satisfy a deterministic archetype rule without inventing additional facts.",
  ], [
    "Unclassified does not mean low risk; it means no supported forensic archetype was assigned.",
  ])

  return {
    schemaVersion: CLUSTER_ARCHETYPE_SCHEMA_VERSION,
    clusterLabel: report.cluster.clusterLabel,
    primary,
    candidates: candidates.slice(0, 4),
    boundaries: [
      "Archetypes are inferred forensic labels and do not change risk scores, wallet decisions, cluster membership, or campaign policy.",
      "No archetype is proof that one person or entity controls every wallet in the cluster.",
      "Neutral infrastructure context cannot become malicious evidence merely because it appears in an archetype explanation.",
    ],
  }
}
