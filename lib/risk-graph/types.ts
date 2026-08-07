export const SHARED_RISK_GRAPH_SCHEMA_VERSION = "tri-proof-risk-graph-v1" as const

export type SharedRiskGraphSource =
  | "campaign"
  | "wallet_graph"
  | "sybil_engine"
  | "scamguard"
  | "scam_dna"
  | "telegram_guardian"
  | "community_report"
  | "team_review"

export type SharedRiskGraphNodeKind =
  | "campaign"
  | "analysis"
  | "wallet"
  | "funder"
  | "referrer"
  | "referral_code"
  | "service"
  | "deployer"
  | "factory"
  | "implementation"
  | "sybil_cluster"
  | "domain"
  | "url"
  | "token"
  | "contract"
  | "program"
  | "telegram_group"
  | "telegram_message"
  | "threat_campaign"
  | "scam_dna"
  | "intel_record"

export type SharedRiskGraphEdgeKind =
  | "PARTICIPATED_IN"
  | "ANALYZED_IN"
  | "FUNDED_BY"
  | "REFERRED_BY"
  | "USES_REFERRAL_CODE"
  | "DEPLOYED_BY"
  | "CREATED_BY_FACTORY"
  | "USES_IMPLEMENTATION"
  | "BELONGS_TO_CLUSTER"
  | "SHARED_IN"
  | "OBSERVED_IN"
  | "HOSTED_ON"
  | "REDIRECTS_TO"
  | "TARGETS"
  | "INTERACTED_WITH"
  | "MATCHES_SCAM_DNA"
  | "CLASSIFIED_AS"
  | "REVIEWED_AS"

export type SharedRiskGraphRiskLevel =
  | "unknown"
  | "safe"
  | "caution"
  | "high"
  | "critical"

export type SharedRiskGraphVerdict =
  | "unknown"
  | "trusted"
  | "suspicious"
  | "known_bad"

export type SharedRiskGraphNode = {
  key: string
  kind: SharedRiskGraphNodeKind
  label: string
  value: string | null
  chain: string | null
  riskLevel: SharedRiskGraphRiskLevel
  riskScore: number | null
  verdict: SharedRiskGraphVerdict
  sources: SharedRiskGraphSource[]
  metadata: Record<string, unknown>
}

export type SharedRiskGraphEdge = {
  key: string
  source: string
  target: string
  kind: SharedRiskGraphEdgeKind
  confidence: number
  riskBearing: boolean
  observedAt: string | null
  sources: SharedRiskGraphSource[]
  evidence: string[]
  metadata: Record<string, unknown>
}

export type SharedRiskGraphCoverage = {
  campaign: boolean
  walletGraph: boolean
  scamGuard: boolean
  scamDna: boolean
  telegramGuardian: boolean
  telegramOnchain: boolean
}

export type SharedRiskGraphSummary = {
  nodeCount: number
  edgeCount: number
  walletCount: number
  domainCount: number
  telegramObservationCount: number
  riskBearingEdgeCount: number
  highRiskNodeCount: number
  sourceCount: number
}

export type SharedRiskGraph = {
  schemaVersion: typeof SHARED_RISK_GRAPH_SCHEMA_VERSION
  campaignId: string
  analysisId: string | null
  generatedAt: string
  coverage: SharedRiskGraphCoverage
  summary: SharedRiskGraphSummary
  nodes: SharedRiskGraphNode[]
  edges: SharedRiskGraphEdge[]
}

export type SharedRiskGraphCampaignContext = {
  id: string
  name: string
  chain: string
  campaignType: string
  analysisId?: string | null
}

export type SharedRiskGraphTelegramEntityObservation = {
  kind: "url" | "domain" | "wallet" | "token" | "contract" | "program"
  value: string
  chain: string | null
  confidence: number
  evidence: string
  parentUrl: string | null
}

export type SharedRiskGraphTelegramObservation = {
  id: string
  groupId: string | null
  groupTitle: string | null
  messageId: number
  target: string
  domain: string | null
  scanType: string
  chain: string
  riskLevel: string
  score: number
  confidence: string
  summary: string
  createdAt: string
  extractedEntities?: SharedRiskGraphTelegramEntityObservation[]
}

export type SharedRiskGraphIntelObservation = {
  id: string
  kind: string
  normalized: string
  chain: string
  verdict: string
  label: string
  source: string
}

export type SharedRiskGraphScamDnaObservation = {
  id: string
  clusterKey: string
  verdict: string
  label: string | null
  domains: string[]
  strongestRisk: string
  lastSeenAt: string
}
