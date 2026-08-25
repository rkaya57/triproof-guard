const DEFAULT_LIMIT = 120
const MIN_LIMIT = 20
const MAX_LIMIT = 250

const nodePattern = /^[A-Za-z0-9._:/-]+$/
const clusterPattern = /^[A-Za-z0-9._:/ -]+$/

export type VisualDecisionProofRequest = {
  component: string | null
  node: string | null
  cluster: string | null
  limit: number
  focusOnly: boolean
}

type ParseResult =
  | { ok: true; value: VisualDecisionProofRequest }
  | { ok: false; error: string }

type IdentifierResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string }

function optionalIdentifier(
  value: string | null,
  name: string,
  maxLength: number,
  pattern: RegExp
): IdentifierResult {
  if (value === null || value.trim() === "") return { ok: true as const, value: null }
  const normalized = value.trim()
  if (normalized.length > maxLength || !pattern.test(normalized)) {
    return { ok: false as const, error: `Invalid ${name} identifier.` }
  }
  return { ok: true as const, value: normalized }
}

function boundedLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? String(DEFAULT_LIMIT), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT
  return Math.min(Math.max(parsed, MIN_LIMIT), MAX_LIMIT)
}

export function parseVisualDecisionProofRequest(searchParams: URLSearchParams): ParseResult {
  const node = optionalIdentifier(searchParams.get("node"), "node", 220, nodePattern)
  if (node.ok === false) return { ok: false, error: node.error }

  const cluster = optionalIdentifier(searchParams.get("cluster"), "cluster", 120, clusterPattern)
  if (cluster.ok === false) return { ok: false, error: cluster.error }

  return {
    ok: true,
    value: {
      // Component is an existing parameter; preserve its legacy trim-and-fallback behavior.
      component: searchParams.get("component")?.trim() || null,
      node: node.value,
      cluster: cluster.value,
      limit: boundedLimit(searchParams.get("limit")),
      focusOnly: searchParams.get("view") === "focus",
    },
  }
}

export const visualDecisionProofLimits = {
  default: DEFAULT_LIMIT,
  min: MIN_LIMIT,
  max: MAX_LIMIT,
} as const
