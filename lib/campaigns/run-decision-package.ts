export const RUN_DECISION_PACKAGE_OBJECT = "campaign_run_decision_package" as const
export const RUN_DECISION_PACKAGE_API_VERSION = "v2" as const
export const RUN_DECISION_PACKAGE_SCHEMA_VERSION = "tri-proof-run-decision-package-v1" as const
export const DEFAULT_RUN_DECISION_PAGE_SIZE = 100
export const MAX_RUN_DECISION_PAGE_SIZE = 500

const CURSOR_VERSION = 1 as const
const MAX_CURSOR_LENGTH = 512
const MAX_CURSOR_ID_LENGTH = 128
const MAX_EXPLANATION_LENGTH = 4000
const MAX_JSON_ARRAY_ITEMS = 50

export type RunDecisionCursorResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string }

export type RunDecisionRowInput = {
  id: string
  walletAddress: string
  chain: string
  state: string
  riskScore: number
  confidence: number | null
  clusterId: string | null
  evidence: unknown
  matchedRules: unknown
  explanation: string | null
  modelVersion: string
  policyVersion: string | null
  createdAt: Date | string
}

export type RunDecisionSummaryInput = {
  allow: number
  review: number
  exclude: number
  insufficient_data: number
}

function iso(value: Date | string | null) {
  if (!value) return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function boundedJson(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null
  if (Array.isArray(value)) return value.slice(0, MAX_JSON_ARRAY_ITEMS).map(boundedJson)
  if (typeof value !== "object") {
    if (typeof value === "string") return value.slice(0, MAX_EXPLANATION_LENGTH)
    return value
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_JSON_ARRAY_ITEMS)
      .map(([key, item]) => [key, boundedJson(item)]),
  )
}

export function parseRunDecisionPageSize(raw: string | null) {
  if (raw === null || raw.trim() === "") return DEFAULT_RUN_DECISION_PAGE_SIZE
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return Math.min(parsed, MAX_RUN_DECISION_PAGE_SIZE)
}

export function encodeRunDecisionCursor(id: string) {
  return Buffer.from(JSON.stringify({ v: CURSOR_VERSION, id }), "utf8").toString("base64url")
}

export function decodeRunDecisionCursor(raw: string | null): RunDecisionCursorResult {
  if (!raw) return { ok: true, id: null }
  if (raw.length > MAX_CURSOR_LENGTH) return { ok: false, error: "Invalid run decision cursor" }

  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { v?: unknown; id?: unknown }
    if (decoded.v !== CURSOR_VERSION || typeof decoded.id !== "string") {
      return { ok: false, error: "Invalid run decision cursor" }
    }
    if (
      decoded.id.length < 1 ||
      decoded.id.length > MAX_CURSOR_ID_LENGTH ||
      !/^[A-Za-z0-9_-]+$/.test(decoded.id)
    ) {
      return { ok: false, error: "Invalid run decision cursor" }
    }
    return { ok: true, id: decoded.id }
  } catch {
    return { ok: false, error: "Invalid run decision cursor" }
  }
}

export function buildRunDecisionPackage(input: {
  campaignId: string
  campaignName: string
  analysisId: string
  run: {
    status: string
    modelVersion: string
    policyVersion: string | null
    inputHash: string | null
    totalWallets: number
    completedAt: Date | string | null
    createdAt: Date | string
    policy: {
      id: string
      preset: string | null
      version: number
      policyHash: string | null
    } | null
  }
  summary: RunDecisionSummaryInput
  rows: readonly RunDecisionRowInput[]
  pageSize: number
}) {
  const hasMore = input.rows.length > input.pageSize
  const pageRows = input.rows.slice(0, input.pageSize)
  const nextCursor = hasMore && pageRows.length
    ? encodeRunDecisionCursor(pageRows[pageRows.length - 1]!.id)
    : null

  const decisions = pageRows.map((row) => ({
    walletAddress: row.walletAddress,
    chain: row.chain,
    executionState: row.state,
    riskScore: row.riskScore,
    confidence: row.confidence,
    clusterId: row.clusterId,
    evidence: boundedJson(row.evidence),
    matchedRules: boundedJson(row.matchedRules),
    explanation: row.explanation?.slice(0, MAX_EXPLANATION_LENGTH) ?? null,
    modelVersion: row.modelVersion,
    policyVersion: row.policyVersion,
    persistedAt: iso(row.createdAt),
  }))

  const encodedCampaign = encodeURIComponent(input.campaignId)
  const encodedAnalysis = encodeURIComponent(input.analysisId)

  return {
    object: RUN_DECISION_PACKAGE_OBJECT,
    apiVersion: RUN_DECISION_PACKAGE_API_VERSION,
    schemaVersion: RUN_DECISION_PACKAGE_SCHEMA_VERSION,
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    analysisId: input.analysisId,
    run: {
      status: input.run.status,
      modelVersion: input.run.modelVersion,
      policyVersion: input.run.policyVersion,
      inputHash: input.run.inputHash,
      totalWallets: input.run.totalWallets,
      createdAt: iso(input.run.createdAt),
      completedAt: iso(input.run.completedAt),
    },
    policySnapshot: input.run.policy ? {
      id: input.run.policy.id,
      preset: input.run.policy.preset,
      version: input.run.policy.version,
      policyHash: input.run.policy.policyHash,
    } : null,
    summary: { ...input.summary },
    decisions,
    pagination: {
      limit: input.pageSize,
      returned: decisions.length,
      hasMore,
      nextCursor,
    },
    boundaries: [
      "This resource reads persisted CampaignDecision rows for the exact analysis run in the URL; it does not rerun the policy engine.",
      "Later campaign policy versions, later risk-memory observations, and later analysis runs do not rewrite the persisted decisions returned here.",
      "Pagination controls position only and cannot change campaign, analysis-run, or owner authorization scope.",
      "Evidence and matched rules are persisted audit context and are not re-scored by this resource.",
    ],
    links: {
      analysis: `/api/v2/campaigns/${encodedCampaign}/analyses/${encodedAnalysis}`,
      campaign: `/api/v2/campaigns/${encodedCampaign}`,
      latestCampaignDecisionPackage: `/api/v2/campaigns/${encodedCampaign}/decisions`,
    },
  }
}

export type RunDecisionPackage = ReturnType<typeof buildRunDecisionPackage>
