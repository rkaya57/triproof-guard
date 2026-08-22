export type TriProofRiskPolicy = "conservative" | "balanced" | "strict"
export type TriProofAnalysisMode = "onchain" | "hybrid"
export type TriProofCampaignLifecycle = "draft" | "active" | "paused" | "completed" | "archived"
export type TriProofChain = "Ethereum" | "Base" | "Arbitrum" | "Optimism" | "Polygon" | "BNB Chain" | "Solana"
export type TriProofCampaignType = "Airdrop" | "Testnet" | "Whitelist" | "Quest" | "Points Program" | "Community Reward" | "Other"
export type TriProofWebhookEvent =
  | "analysis.completed"
  | "analysis.review_required"
  | "decision_package.ready"
  | "campaign.policy_changed"
  | "campaign.lifecycle_changed"
  | "policy.blocked"
  | "policy.review"

export type WalletInput = string | {
  wallet?: string
  walletAddress?: string
  address?: string
  policyAction?: "approve" | "manual_review" | "reject"
  reputationLabel?: string
  policyReason?: string
  campaignPoints?: number
  campaignEventType?: string
  referrerAddress?: string
  referralCode?: string
}

export type CreateAnalysisInput = {
  chain: TriProofChain
  wallets: WalletInput[]
  campaignType?: TriProofCampaignType
  projectName?: string
  riskPolicy?: TriProofRiskPolicy
  analysisMode?: TriProofAnalysisMode
  campaignContracts?: string[]
  notes?: string
}

export type CreateAnalysisResponse = {
  analysisId: string
  status: string
  walletCount: number
  batchCount: number
  chain: string
  campaignType: string
  analysisMode: string
  riskPolicy: string
  provider: string
  statusUrl: string
  dashboardUrl: string
  exports: Record<string, string>
}

export type AnalysisStatusResponse = {
  analysisId: string
  status: string
  totals: {
    totalWallets: number
    approved: number
    grayZoneManualReview: number
    rejectedNotEligible: number
    averageRiskScore: number
    suspiciousClusters: number
  }
  exports: Record<string, string>
  topWallets: Array<{
    walletAddress: string
    riskScore: number
    riskLevel: string
    decision: string
    statusExplanation: string
    reasons: string[]
  }>
}

export type CreateCampaignInput = {
  name: string
  campaignType: TriProofCampaignType
  chain: TriProofChain
  riskPolicy?: TriProofRiskPolicy
  lifecycle?: "draft"
  startsAt?: string | null
  endsAt?: string | null
  rewardPoolUsd?: number | null
  campaignContracts?: string[]
  metadata?: Record<string, unknown>
  notes?: string
}

export type CampaignSummary = {
  id: string
  object: "campaign"
  apiVersion: "v2"
  name: string
  campaignType: string
  chain: string
  lifecycle: TriProofCampaignLifecycle
  riskPolicy: string
  policyVersion: number | null
  [key: string]: unknown
}

export type CampaignAnalysisRunInput = {
  analysisMode?: TriProofAnalysisMode
  riskPolicy?: TriProofRiskPolicy
  wallets: WalletInput[]
}

export type CampaignAnalysisRunResponse = {
  campaignId: string
  analysisId: string
  object?: "analysis_run"
  status: string
  walletCount: number
  inputHash?: string
  riskPolicy?: string
  policyVersion?: number | null
  [key: string]: unknown
}

export type CampaignDecisionPackage = {
  object?: string
  apiVersion?: string
  campaign?: Record<string, unknown>
  readiness?: Record<string, unknown>
  summary?: Record<string, unknown>
  wallets?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export type CampaignRunDecisionPackage = {
  object: "campaign_run_decision_package"
  apiVersion: "v2"
  schemaVersion: string
  campaignId: string
  campaignName: string
  analysisId: string
  run: {
    status: string
    modelVersion: string
    policyVersion: string | null
    inputHash: string | null
    totalWallets: number
    createdAt: string | null
    completedAt: string | null
  }
  policySnapshot: {
    id: string
    preset: string | null
    version: number
    policyHash: string | null
  } | null
  summary: {
    allow: number
    review: number
    exclude: number
    insufficient_data: number
  }
  decisions: Array<{
    walletAddress: string
    chain: string
    executionState: string
    riskScore: number
    confidence: number | null
    clusterId: string | null
    evidence: unknown
    matchedRules: unknown
    explanation: string | null
    modelVersion: string
    policyVersion: string | null
    persistedAt: string | null
  }>
  pagination: {
    limit: number
    returned: number
    hasMore: boolean
    nextCursor: string | null
  }
  boundaries: string[]
  links: Record<string, string>
}

export type CampaignClusterList = {
  object: "cluster_list"
  apiVersion: "v2"
  campaignId: string
  analysisId: string
  storedClusterCount: number
  clusters: Array<{
    clusterLabel: string
    walletCount: number
    averageRiskScore: number
    sharedFundingSource: string | null
    behaviorSimilarityScore: number
    storedSuggestedAction: string
    storedReasons: string[]
    createdAt: string | null
    links: {
      intelligence: string
      members: string
      dashboard: string
    }
  }>
  pagination: {
    limit: number
    returned: number
    hasMore: boolean
    nextCursor: string | null
  }
  boundaries: string[]
  links: Record<string, string>
}

export type CampaignClusterIntelligence = {
  id: string
  object: "cluster_intelligence"
  apiVersion: "v2"
  campaignId: string
  analysisId: string
  clusterLabel: string
  cluster: {
    walletCount: number
    averageRiskScore: number
    behaviorSimilarityScore: number
    storedSuggestedAction: string
    sharedFundingSource: string | null
    storedReasons: string[]
  }
  grouping: {
    minimumWallets: number
    minimumIndependentFamilies: number
    observedWallets: number
    observedIndependentFamilies: number
    qualifiesByStoredRule: boolean
    headline: string
    explanation: string
    families: Array<{ family: string; label: string; storedReason: string }>
    caveats: string[]
  }
  support: {
    schemaVersion: string
    clusterLabel: string
    score: number
    confidence: "low" | "medium" | "high"
    qualifiesByStoredRule: boolean
    observedIndependentFamilies: number
    familySupport: Array<Record<string, unknown>>
    factors: Array<Record<string, unknown>>
    context: Record<string, unknown>
    limitations: string[]
    boundaries: string[]
  }
  archetype: {
    schemaVersion: string
    clusterLabel: string
    primary: {
      id: string
      label: string
      confidence: "low" | "medium" | "high"
      score: number
      reasons: string[]
      caveats: string[]
    }
    candidates: Array<Record<string, unknown>>
    boundaries: string[]
  }
  memberPreview: Array<Record<string, unknown>>
  memberPreviewMeta: {
    returned: number
    total: number
    truncated: boolean
    limit: number
  }
  provenance: Record<string, unknown>
  timeline: Record<string, unknown>
  boundaries: string[]
  links: Record<string, string>
}

export type CampaignClusterMemberList = {
  object: "cluster_member_list"
  apiVersion: "v2"
  campaignId: string
  analysisId: string
  clusterLabel: string
  storedTotalMembers: number
  members: Array<{
    walletAddress: string
    chain: string
    entity: { label: string | null; type: string; riskReason: string | null }
    riskScore: number
    riskLevel: string
    storedStatus: string
    storedRecommendedAction: string
    statusExplanation: string | null
    fundingSource: string | null
    graphComponentId: string | null
    graphRiskScore: number | null
    activity: {
      txCount: number | null
      walletAgeDays: number | null
      totalVolume: number | null
      contractsCount: number | null
      campaignActionsCount: number | null
      firstSeen: string | null
      lastSeen: string | null
    }
    reasons: string[]
    teamReview: {
      finalStatus: string
      feedbackLabel: string | null
      notes: string | null
      source: string
      reviewerName: string | null
      updatedAt: string | null
    } | null
  }>
  pagination: {
    limit: number
    returned: number
    hasMore: boolean
    nextCursor: string | null
  }
  boundaries: string[]
  links: Record<string, string>
}

export type CampaignClusterEvidenceLane = "funding" | "graph"

export type CampaignClusterEvidenceList = {
  object: "cluster_evidence_list"
  apiVersion: "v2"
  campaignId: string
  analysisId: string
  clusterLabel: string
  lane: CampaignClusterEvidenceLane
  evidence: Array<Record<string, unknown> & {
    kind: string
    confidence: number
    riskBearing: boolean
  }>
  pagination: {
    limit: number
    returned: number
    hasMore: boolean
    nextCursor: string | null
    scannedRows: number
    scanLimitReached: boolean
    maxScanRowsPerRequest: number
  }
  boundaries: string[]
  links: Record<string, string>
}

export type CampaignClusterCaseExportFormat = "json" | "csv" | "markdown"

export type CampaignPolicyActivationInput = {
  preset: TriProofRiskPolicy
  rationale: string
}

export type WebhookEndpointInput = {
  url: string
  eventTypes?: TriProofWebhookEvent[]
  description?: string | null
}

export type WebhookEndpointUpdate = {
  url?: string
  eventTypes?: TriProofWebhookEvent[]
  description?: string | null
  isActive?: boolean
}

export type WebhookHealthSummary = {
  state: "healthy" | "degraded" | "failing" | "idle" | "paused"
  recentAttempts: number
  recentSuccesses: number
  recentFailures: number
  recentPending: number
  recentSuccessRate: number | null
  consecutiveFailures: number
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
}

export type WebhookDelivery = {
  id: string
  eventType: string | null
  status: string
  statusCode: number | null
  errorMessage: string | null
  responseBody?: string | null
  attemptCount: number
  analysisId?: string | null
  createdAt: string
  deliveredAt: string | null
}

export type WebhookEndpoint = {
  id: string
  object?: "webhook_endpoint"
  url: string
  eventTypes: string[]
  isActive: boolean
  description: string | null
  createdAt?: string
  updatedAt?: string
  health?: WebhookHealthSummary
  latestDeliveries?: WebhookDelivery[]
  deliveries?: WebhookDelivery[]
}

export type CreateWebhookResponse = WebhookEndpoint & {
  secret: string
  note?: string
}

export type WebhookDeliveryList = {
  object: "webhook_delivery_list"
  apiVersion: "v2"
  endpointId: string
  deliveries: WebhookDelivery[]
  nextCursor: string | null
  hasMore: boolean
  filters: { status: string | null }
}

export type WebhookDeliveryRetryResponse = {
  object: "webhook_delivery_retry"
  apiVersion: "v2"
  endpointId: string
  delivery: {
    id: string
    endpointId: string
    status: string
    statusCode: number | null
    errorMessage: string | null
    attemptCount: number
  }
}

export type ScamGuardScanType = "url" | "wallet" | "token" | "transaction"
export type ScamGuardChain = "solana" | "evm" | "unknown"

export type ScamGuardScanInput = {
  type: ScamGuardScanType
  value: string
  walletAddress?: string
  chain?: ScamGuardChain
  sourceUrl?: string
}

export type ScamGuardScanResponse = {
  id: string
  type: ScamGuardScanType
  score: number
  riskLevel: "SAFE" | "CAUTION" | "HIGH_RISK" | "CRITICAL"
  summary: string
  confidence: "LOW" | "MEDIUM" | "HIGH"
  explanation: string
  signals: Array<{
    code: string
    severity: "info" | "low" | "medium" | "high" | "critical"
    title: string
    detail: string
  }>
  actions: string[]
  metadata: Record<string, unknown>
  scannedAt: string
}

export type ScamGuardFeedbackInput = {
  scanId?: string
  verdict: "reported_scam" | "reported_safe" | "false_positive" | "false_negative"
  value?: string
  chain?: ScamGuardChain
  reason?: string
  source?: string
}

export class TriProofApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly details: unknown

  constructor(message: string, options: { status: number; code?: string | null; details?: unknown }) {
    super(message)
    this.name = "TriProofApiError"
    this.status = options.status
    this.code = options.code ?? null
    this.details = options.details ?? null
  }
}

export class TriProofClient {
  private baseUrl: string
  private apiKey: string
  private fetchImpl: typeof fetch

  constructor(options: { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch }) {
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? "https://triproofprotocol.com").replace(/\/$/, "")
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  private async rawRequest(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers)
    if (!headers.has("authorization")) headers.set("authorization", `Bearer ${this.apiKey}`)
    if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has("content-type")) {
      headers.set("content-type", "application/json")
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string; code?: string } | null
      throw new TriProofApiError(body?.error ?? `Tri-Proof API error: ${response.status}`, {
        status: response.status,
        code: body?.code ?? null,
        details: body,
      })
    }
    return response
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await this.rawRequest(path, options)
    return await response.json() as T
  }

  createAnalysis(input: CreateAnalysisInput) {
    return this.request<CreateAnalysisResponse>("/api/v1/analyze", {
      method: "POST",
      body: JSON.stringify(input),
    })
  }

  getAnalysis(analysisId: string) {
    return this.request<AnalysisStatusResponse>(`/api/v1/analysis/${encodeURIComponent(analysisId)}`)
  }

  getMetrics(analysisId: string) {
    return this.request(`/api/analysis/${encodeURIComponent(analysisId)}/metrics`)
  }

  createCampaign(input: CreateCampaignInput) {
    return this.request<CampaignSummary>("/api/v2/campaigns", {
      method: "POST",
      body: JSON.stringify(input),
    })
  }

  listCampaigns() {
    return this.request<{ object: string; apiVersion: "v2"; campaigns: CampaignSummary[] }>("/api/v2/campaigns")
  }

  getCampaign(campaignId: string) {
    return this.request<CampaignSummary>(`/api/v2/campaigns/${encodeURIComponent(campaignId)}`)
  }

  runCampaignAnalysis(campaignId: string, input: CampaignAnalysisRunInput) {
    return this.request<CampaignAnalysisRunResponse>(`/api/v2/campaigns/${encodeURIComponent(campaignId)}/analyses`, {
      method: "POST",
      body: JSON.stringify(input),
    })
  }

  getCampaignAnalysis(campaignId: string, analysisId: string) {
    return this.request<Record<string, unknown>>(
      `/api/v2/campaigns/${encodeURIComponent(campaignId)}/analyses/${encodeURIComponent(analysisId)}`,
    )
  }

  listCampaignRunDecisions(
    campaignId: string,
    analysisId: string,
    options: { limit?: number; cursor?: string } = {},
  ) {
    const query = new URLSearchParams()
    if (options.limit !== undefined) query.set("limit", String(options.limit))
    if (options.cursor) query.set("cursor", options.cursor)
    const suffix = query.size > 0 ? `?${query.toString()}` : ""
    return this.request<CampaignRunDecisionPackage>(
      `/api/v2/campaigns/${encodeURIComponent(campaignId)}/analyses/${encodeURIComponent(analysisId)}/decisions${suffix}`,
    )
  }

  listCampaignClusters(
    campaignId: string,
    analysisId: string,
    options: { limit?: number; cursor?: string } = {},
  ) {
    const query = new URLSearchParams()
    if (options.limit !== undefined) query.set("limit", String(options.limit))
    if (options.cursor) query.set("cursor", options.cursor)
    const suffix = query.size > 0 ? `?${query.toString()}` : ""
    return this.request<CampaignClusterList>(
      `/api/v2/campaigns/${encodeURIComponent(campaignId)}/analyses/${encodeURIComponent(analysisId)}/clusters${suffix}`,
    )
  }

  getCampaignClusterIntelligence(campaignId: string, analysisId: string, clusterLabel: string) {
    return this.request<CampaignClusterIntelligence>(
      `/api/v2/campaigns/${encodeURIComponent(campaignId)}/analyses/${encodeURIComponent(analysisId)}/clusters/${encodeURIComponent(clusterLabel)}`,
    )
  }

  listCampaignClusterMembers(
    campaignId: string,
    analysisId: string,
    clusterLabel: string,
    options: { limit?: number; cursor?: string } = {},
  ) {
    const query = new URLSearchParams()
    if (options.limit !== undefined) query.set("limit", String(options.limit))
    if (options.cursor) query.set("cursor", options.cursor)
    const suffix = query.size > 0 ? `?${query.toString()}` : ""
    return this.request<CampaignClusterMemberList>(
      `/api/v2/campaigns/${encodeURIComponent(campaignId)}/analyses/${encodeURIComponent(analysisId)}/clusters/${encodeURIComponent(clusterLabel)}/members${suffix}`,
    )
  }

  listCampaignClusterEvidence(
    campaignId: string,
    analysisId: string,
    clusterLabel: string,
    options: { lane?: CampaignClusterEvidenceLane; limit?: number; cursor?: string } = {},
  ) {
    const query = new URLSearchParams()
    if (options.lane) query.set("lane", options.lane)
    if (options.limit !== undefined) query.set("limit", String(options.limit))
    if (options.cursor) query.set("cursor", options.cursor)
    const suffix = query.size > 0 ? `?${query.toString()}` : ""
    return this.request<CampaignClusterEvidenceList>(
      `/api/v2/campaigns/${encodeURIComponent(campaignId)}/analyses/${encodeURIComponent(analysisId)}/clusters/${encodeURIComponent(clusterLabel)}/evidence${suffix}`,
    )
  }

  async exportCampaignClusterCase(
    campaignId: string,
    analysisId: string,
    clusterLabel: string,
    format: CampaignClusterCaseExportFormat = "json",
  ) {
    const response = await this.rawRequest(
      `/api/v2/campaigns/${encodeURIComponent(campaignId)}/analyses/${encodeURIComponent(analysisId)}/clusters/${encodeURIComponent(clusterLabel)}/export?format=${encodeURIComponent(format)}`,
    )
    return response.text()
  }

  getCampaignDecisionPackage(campaignId: string) {
    return this.request<CampaignDecisionPackage>(
      `/api/v2/campaigns/${encodeURIComponent(campaignId)}/decisions?format=json`,
    )
  }

  async getCampaignDecisionCsv(campaignId: string) {
    const response = await this.rawRequest(
      `/api/v2/campaigns/${encodeURIComponent(campaignId)}/decisions?format=csv`,
    )
    return response.text()
  }

  changeCampaignLifecycle(campaignId: string, lifecycle: TriProofCampaignLifecycle) {
    return this.request<Record<string, unknown>>(`/api/v2/campaigns/${encodeURIComponent(campaignId)}`, {
      method: "PATCH",
      body: JSON.stringify({ lifecycle }),
    })
  }

  activateCampaignPolicy(campaignId: string, input: CampaignPolicyActivationInput) {
    return this.request<Record<string, unknown>>(`/api/v2/campaigns/${encodeURIComponent(campaignId)}/policy`, {
      method: "POST",
      body: JSON.stringify(input),
    })
  }

  listWebhooks() {
    return this.request<{ object: string; apiVersion: "v2"; supportedEvents: string[]; endpoints: WebhookEndpoint[] }>("/api/v2/webhooks")
  }

  getWebhook(endpointId: string) {
    return this.request<WebhookEndpoint>(`/api/v2/webhooks/${encodeURIComponent(endpointId)}`)
  }

  createWebhook(input: WebhookEndpointInput) {
    return this.request<CreateWebhookResponse>("/api/v2/webhooks", {
      method: "POST",
      body: JSON.stringify(input),
    })
  }

  updateWebhook(endpointId: string, input: WebhookEndpointUpdate) {
    return this.request<WebhookEndpoint>(`/api/v2/webhooks/${encodeURIComponent(endpointId)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    })
  }

  deleteWebhook(endpointId: string) {
    return this.request<{ id: string; object: "webhook_endpoint_deleted"; deleted: true; apiVersion: "v2" }>(
      `/api/v2/webhooks/${encodeURIComponent(endpointId)}`,
      { method: "DELETE" },
    )
  }

  listWebhookDeliveries(
    endpointId: string,
    options: { limit?: number; cursor?: string; status?: "pending" | "failed" | "delivered" } = {},
  ) {
    const query = new URLSearchParams()
    if (options.limit !== undefined) query.set("limit", String(options.limit))
    if (options.cursor) query.set("cursor", options.cursor)
    if (options.status) query.set("status", options.status)
    const suffix = query.size > 0 ? `?${query.toString()}` : ""
    return this.request<WebhookDeliveryList>(
      `/api/v2/webhooks/${encodeURIComponent(endpointId)}/deliveries${suffix}`,
    )
  }

  retryWebhookDelivery(endpointId: string, deliveryId: string) {
    return this.request<WebhookDeliveryRetryResponse>(
      `/api/v2/webhooks/${encodeURIComponent(endpointId)}/deliveries/${encodeURIComponent(deliveryId)}/retry`,
      { method: "POST" },
    )
  }

  scanScamGuard(input: ScamGuardScanInput) {
    return this.request<ScamGuardScanResponse>("/api/v1/scamguard/scan", {
      method: "POST",
      body: JSON.stringify(input),
    })
  }

  submitScamGuardFeedback(input: ScamGuardFeedbackInput) {
    return this.request<{ ok: boolean; feedback: Record<string, unknown> }>("/api/scamguard/feedback", {
      method: "POST",
      body: JSON.stringify(input),
    })
  }
}
