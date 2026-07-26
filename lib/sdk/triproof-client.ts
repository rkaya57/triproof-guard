export type TriProofRiskPolicy = "conservative" | "balanced" | "strict"
export type TriProofAnalysisMode = "onchain" | "hybrid"

export type CreateAnalysisInput = {
  chain: "Ethereum" | "Base" | "Arbitrum" | "Optimism" | "Polygon" | "BNB Chain" | "Solana"
  wallets: Array<string | {
    wallet?: string
    walletAddress?: string
    address?: string
    policyAction?: "approve" | "manual_review" | "reject"
    reputationLabel?: string
    policyReason?: string
  }>
  campaignType?: "Airdrop" | "Testnet" | "Whitelist" | "Quest" | "Points Program" | "Community Reward" | "Other"
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

export type ScamGuardScanType = "url" | "wallet" | "token" | "transaction"
export type ScamGuardChain = "solana" | "evm" | "unknown"

export type ScamGuardScanInput = {
  type: ScamGuardScanType
  value: string
  walletAddress?: string
  chain?: ScamGuardChain
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

export class TriProofClient {
  private baseUrl: string
  private apiKey: string

  constructor(options: { apiKey: string; baseUrl?: string }) {
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? "https://triproofprotocol.com").replace(/\/$/, "")
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
        ...(options.headers ?? {}),
      },
    })

    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(body?.error ?? `Tri-Proof API error: ${response.status}`)
    }
    return body as T
  }

  createAnalysis(input: CreateAnalysisInput) {
    return this.request<CreateAnalysisResponse>("/api/v1/analyze", {
      method: "POST",
      body: JSON.stringify(input),
    })
  }

  getAnalysis(analysisId: string) {
    return this.request<AnalysisStatusResponse>(`/api/v1/analysis/${analysisId}`)
  }

  getMetrics(analysisId: string) {
    return this.request(`/api/analysis/${analysisId}/metrics`)
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
