export type ScamGuardSharedReport = {
  version: 1
  generatedAt: string
  type: "url" | "wallet" | "token" | "transaction"
  chain: "solana" | "evm" | "unknown"
  target: string
  riskLevel: "SAFE" | "CAUTION" | "HIGH_RISK" | "CRITICAL"
  shieldScore: number
  confidence: "LOW" | "MEDIUM" | "HIGH"
  summary: string
  primaryReason: string
  timeline: Array<{ label: string; value: string; status: string }>
  signals: Array<{ severity: string; title: string; detail: string }>
  actions: string[]
}

const riskLevels = new Set<ScamGuardSharedReport["riskLevel"]>(["SAFE", "CAUTION", "HIGH_RISK", "CRITICAL"])
const confidenceLevels = new Set<ScamGuardSharedReport["confidence"]>(["LOW", "MEDIUM", "HIGH"])
const scanTypes = new Set<ScamGuardSharedReport["type"]>(["url", "wallet", "token", "transaction"])
const scanChains = new Set<ScamGuardSharedReport["chain"]>(["solana", "evm", "unknown"])

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : ""
}

function score(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0
}

function array(value: unknown) {
  return Array.isArray(value) ? value : []
}

export function decodeSharedScamGuardReport(value: string | undefined): ScamGuardSharedReport | null {
  if (!value || value.length > 12_000 || !/^[A-Za-z0-9_-]+$/.test(value)) return null

  try {
    const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - (value.length % 4)) % 4)}`
    const raw = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>
    const riskLevel = raw.riskLevel
    const confidence = raw.confidence
    const type = raw.type
    const chain = raw.chain
    if (
      raw.version !== 1 ||
      !riskLevels.has(riskLevel as ScamGuardSharedReport["riskLevel"]) ||
      !confidenceLevels.has(confidence as ScamGuardSharedReport["confidence"]) ||
      !scanTypes.has(type as ScamGuardSharedReport["type"]) ||
      !scanChains.has(chain as ScamGuardSharedReport["chain"])
    ) return null

    const target = text(raw.target, 120)
    const summary = text(raw.summary, 320)
    const primaryReason = text(raw.primaryReason, 320)
    if (!target || !summary || !primaryReason) return null

    return {
      version: 1,
      generatedAt: text(raw.generatedAt, 40) || new Date(0).toISOString(),
      type: type as ScamGuardSharedReport["type"],
      chain: chain as ScamGuardSharedReport["chain"],
      target,
      riskLevel: riskLevel as ScamGuardSharedReport["riskLevel"],
      shieldScore: score(raw.shieldScore),
      confidence: confidence as ScamGuardSharedReport["confidence"],
      summary,
      primaryReason,
      timeline: array(raw.timeline).slice(0, 4).flatMap((item) => {
        if (!item || typeof item !== "object") return []
        const row = item as Record<string, unknown>
        const label = text(row.label, 32)
        const timelineValue = text(row.value, 90)
        const status = text(row.status, 150)
        return label && timelineValue && status ? [{ label, value: timelineValue, status }] : []
      }),
      signals: array(raw.signals).slice(0, 4).flatMap((item) => {
        if (!item || typeof item !== "object") return []
        const signal = item as Record<string, unknown>
        const title = text(signal.title, 110)
        const detail = text(signal.detail, 230)
        return title && detail ? [{ severity: text(signal.severity, 16), title, detail }] : []
      }),
      actions: array(raw.actions).slice(0, 3).map((item) => text(item, 190)).filter(Boolean),
    }
  } catch {
    return null
  }
}
