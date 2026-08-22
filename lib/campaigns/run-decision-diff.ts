export const RUN_DECISION_DIFF_OBJECT = "campaign_run_decision_diff" as const
export const RUN_DECISION_DIFF_API_VERSION = "v2" as const
export const RUN_DECISION_DIFF_SCHEMA_VERSION = "tri-proof-run-decision-diff-v1" as const
export const DEFAULT_RUN_DECISION_DIFF_PAGE_SIZE = 100
export const MAX_RUN_DECISION_DIFF_PAGE_SIZE = 500

const CURSOR_VERSION = 1 as const
const MAX_CURSOR_LENGTH = 512
const MAX_CURSOR_OFFSET = 1_000_000

export type RunDecisionDiffCursorResult =
  | { ok: true; offset: number }
  | { ok: false; error: string }

export type RunDecisionDiffRowInput = {
  id: string
  walletAddress: string
  chain: string
  state: string
  riskScore: number
  confidence: number | null
  clusterId: string | null
  modelVersion: string
  policyVersion: string | null
}

export type RunDecisionDiffRunInput = {
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

function iso(value: Date | string | null) {
  if (!value) return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function isSolanaChain(chain: string) {
  return chain.trim().toLowerCase() === "solana"
}

export function runDecisionIdentityKey(chain: string, walletAddress: string) {
  const normalizedChain = chain.trim().toLowerCase()
  const normalizedWallet = isSolanaChain(chain)
    ? walletAddress.trim()
    : walletAddress.trim().toLowerCase()
  return `${normalizedChain}:${normalizedWallet}`
}

export function parseRunDecisionDiffPageSize(raw: string | null) {
  if (raw === null || raw.trim() === "") return DEFAULT_RUN_DECISION_DIFF_PAGE_SIZE
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return Math.min(parsed, MAX_RUN_DECISION_DIFF_PAGE_SIZE)
}

export function encodeRunDecisionDiffCursor(offset: number) {
  return Buffer.from(JSON.stringify({ v: CURSOR_VERSION, offset }), "utf8").toString("base64url")
}

export function decodeRunDecisionDiffCursor(raw: string | null): RunDecisionDiffCursorResult {
  if (!raw) return { ok: true, offset: 0 }
  if (raw.length > MAX_CURSOR_LENGTH) return { ok: false, error: "Invalid run decision diff cursor" }

  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      v?: unknown
      offset?: unknown
    }
    if (
      decoded.v !== CURSOR_VERSION ||
      !Number.isInteger(decoded.offset) ||
      Number(decoded.offset) < 0 ||
      Number(decoded.offset) > MAX_CURSOR_OFFSET
    ) {
      return { ok: false, error: "Invalid run decision diff cursor" }
    }
    return { ok: true, offset: Number(decoded.offset) }
  } catch {
    return { ok: false, error: "Invalid run decision diff cursor" }
  }
}

function runSnapshot(run: RunDecisionDiffRunInput) {
  return {
    status: run.status,
    modelVersion: run.modelVersion,
    policyVersion: run.policyVersion,
    inputHash: run.inputHash,
    totalWallets: run.totalWallets,
    createdAt: iso(run.createdAt),
    completedAt: iso(run.completedAt),
    policySnapshot: run.policy ? {
      id: run.policy.id,
      preset: run.policy.preset,
      version: run.policy.version,
      policyHash: run.policy.policyHash,
    } : null,
  }
}

function stateSummary(rows: readonly RunDecisionDiffRowInput[]) {
  const counts: Record<string, number> = {}
  for (const row of rows) counts[row.state] = (counts[row.state] ?? 0) + 1
  return counts
}

function fieldChanges(from: RunDecisionDiffRowInput, to: RunDecisionDiffRowInput) {
  const changed: string[] = []
  if (from.state !== to.state) changed.push("state")
  if (from.riskScore !== to.riskScore) changed.push("riskScore")
  if (from.confidence !== to.confidence) changed.push("confidence")
  if (from.clusterId !== to.clusterId) changed.push("clusterId")
  if (from.modelVersion !== to.modelVersion) changed.push("modelVersion")
  if (from.policyVersion !== to.policyVersion) changed.push("policyVersion")
  return changed
}

export function buildRunDecisionDiff(input: {
  campaignId: string
  campaignName: string
  fromAnalysisId: string
  toAnalysisId: string
  fromRun: RunDecisionDiffRunInput
  toRun: RunDecisionDiffRunInput
  fromRows: readonly RunDecisionDiffRowInput[]
  toRows: readonly RunDecisionDiffRowInput[]
  pageSize: number
  offset?: number
}) {
  const fromMap = new Map<string, RunDecisionDiffRowInput>()
  const toMap = new Map<string, RunDecisionDiffRowInput>()

  for (const row of input.fromRows) fromMap.set(runDecisionIdentityKey(row.chain, row.walletAddress), row)
  for (const row of input.toRows) toMap.set(runDecisionIdentityKey(row.chain, row.walletAddress), row)

  const keys = Array.from(new Set([...fromMap.keys(), ...toMap.keys()])).sort((a, b) => a.localeCompare(b))
  const changes: Array<{
    walletAddress: string
    chain: string
    changeType: "added" | "removed" | "state_changed" | "context_changed"
    fieldsChanged: string[]
    from: null | {
      state: string
      riskScore: number
      confidence: number | null
      clusterId: string | null
      modelVersion: string
      policyVersion: string | null
    }
    to: null | {
      state: string
      riskScore: number
      confidence: number | null
      clusterId: string | null
      modelVersion: string
      policyVersion: string | null
    }
    riskScoreDelta: number | null
  }> = []

  let unchanged = 0
  let added = 0
  let removed = 0
  let stateChanged = 0
  let contextChanged = 0
  const transitions: Record<string, number> = {}

  for (const key of keys) {
    const from = fromMap.get(key) ?? null
    const to = toMap.get(key) ?? null

    if (!from && to) {
      added += 1
      transitions[`<none>→${to.state}`] = (transitions[`<none>→${to.state}`] ?? 0) + 1
      changes.push({
        walletAddress: to.walletAddress,
        chain: to.chain,
        changeType: "added",
        fieldsChanged: ["presence"],
        from: null,
        to: {
          state: to.state,
          riskScore: to.riskScore,
          confidence: to.confidence,
          clusterId: to.clusterId,
          modelVersion: to.modelVersion,
          policyVersion: to.policyVersion,
        },
        riskScoreDelta: null,
      })
      continue
    }

    if (from && !to) {
      removed += 1
      transitions[`${from.state}→<none>`] = (transitions[`${from.state}→<none>`] ?? 0) + 1
      changes.push({
        walletAddress: from.walletAddress,
        chain: from.chain,
        changeType: "removed",
        fieldsChanged: ["presence"],
        from: {
          state: from.state,
          riskScore: from.riskScore,
          confidence: from.confidence,
          clusterId: from.clusterId,
          modelVersion: from.modelVersion,
          policyVersion: from.policyVersion,
        },
        to: null,
        riskScoreDelta: null,
      })
      continue
    }

    if (!from || !to) continue
    const changed = fieldChanges(from, to)
    if (changed.length === 0) {
      unchanged += 1
      continue
    }

    const didStateChange = from.state !== to.state
    if (didStateChange) {
      stateChanged += 1
      transitions[`${from.state}→${to.state}`] = (transitions[`${from.state}→${to.state}`] ?? 0) + 1
    } else {
      contextChanged += 1
    }

    changes.push({
      walletAddress: to.walletAddress,
      chain: to.chain,
      changeType: didStateChange ? "state_changed" : "context_changed",
      fieldsChanged: changed,
      from: {
        state: from.state,
        riskScore: from.riskScore,
        confidence: from.confidence,
        clusterId: from.clusterId,
        modelVersion: from.modelVersion,
        policyVersion: from.policyVersion,
      },
      to: {
        state: to.state,
        riskScore: to.riskScore,
        confidence: to.confidence,
        clusterId: to.clusterId,
        modelVersion: to.modelVersion,
        policyVersion: to.policyVersion,
      },
      riskScoreDelta: to.riskScore - from.riskScore,
    })
  }

  const offset = Math.max(0, Math.min(input.offset ?? 0, changes.length))
  const page = changes.slice(offset, offset + input.pageSize)
  const nextOffset = offset + page.length
  const hasMore = nextOffset < changes.length
  const encodedCampaign = encodeURIComponent(input.campaignId)
  const encodedFromAnalysis = encodeURIComponent(input.fromAnalysisId)
  const encodedToAnalysis = encodeURIComponent(input.toAnalysisId)

  return {
    object: RUN_DECISION_DIFF_OBJECT,
    apiVersion: RUN_DECISION_DIFF_API_VERSION,
    schemaVersion: RUN_DECISION_DIFF_SCHEMA_VERSION,
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    fromAnalysisId: input.fromAnalysisId,
    toAnalysisId: input.toAnalysisId,
    runs: {
      from: runSnapshot(input.fromRun),
      to: runSnapshot(input.toRun),
    },
    summary: {
      comparedIdentityCount: keys.length,
      changedIdentityCount: changes.length,
      unchangedIdentityCount: unchanged,
      addedIdentityCount: added,
      removedIdentityCount: removed,
      stateChangedIdentityCount: stateChanged,
      contextChangedIdentityCount: contextChanged,
      fromStateCounts: stateSummary(input.fromRows),
      toStateCounts: stateSummary(input.toRows),
      stateTransitions: Object.fromEntries(Object.entries(transitions).sort(([a], [b]) => a.localeCompare(b))),
    },
    changes: page,
    pagination: {
      limit: input.pageSize,
      offset,
      returned: page.length,
      totalChanged: changes.length,
      hasMore,
      nextCursor: hasMore ? encodeRunDecisionDiffCursor(nextOffset) : null,
    },
    boundaries: [
      "This comparison reads persisted CampaignDecision rows from two exact analysis runs; it does not rerun policy, risk scoring, clustering, or evidence generation.",
      "A state transition describes a persisted difference between runs and is not a new automated decision or claim about wallet ownership.",
      "Risk-score, cluster, model, confidence, and policy-version deltas are descriptive audit metadata only.",
      "EVM wallet identity matching is case-insensitive. Solana Base58 identity matching remains case-sensitive.",
      "Pagination controls the changed-row projection only and does not change the compared run scope.",
    ],
    links: {
      fromRunDecisions: `/api/v2/campaigns/${encodedCampaign}/analyses/${encodedFromAnalysis}/decisions`,
      toRunDecisions: `/api/v2/campaigns/${encodedCampaign}/analyses/${encodedToAnalysis}/decisions`,
      campaign: `/api/v2/campaigns/${encodedCampaign}`,
    },
  }
}

export type RunDecisionDiff = ReturnType<typeof buildRunDecisionDiff>
