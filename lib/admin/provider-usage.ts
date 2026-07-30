import { db } from "@/lib/db/prisma"

export type ProviderWarningLevel = "green" | "yellow" | "orange" | "red" | "unknown"

export type AdminProviderUsage = {
  provider: "helius" | "etherscan" | "gemini"
  label: string
  configuredLimit: number
  limitWindow: "daily" | "monthly"
  limitUnit: "credits" | "requests"
  used: number
  usagePercent: number
  warningLevel: ProviderWarningLevel
  dailyRequests: number
  monthlyEstimatedCredits: number
  lastRateLimitAt: string | null
  failedLast24h: number
  rateLimitedLast24h: number
  note: string
}

type ProviderUsageRow = {
  provider: string
  dailyRequests: number | bigint | string | null
  monthlyEstimatedCredits: number | bigint | string | null
  lastRateLimitAt: Date | string | null
  failedLast24h: number | bigint | string | null
  rateLimitedLast24h: number | bigint | string | null
}

function envNumber(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function toNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value)
  if (typeof value === "number") return value
  if (typeof value === "string") return Number.parseInt(value, 10) || 0
  return 0
}

function toIso(value: unknown) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function thresholds() {
  return {
    yellow: envNumber("PROVIDER_USAGE_WARNING_YELLOW", 70),
    orange: envNumber("PROVIDER_USAGE_WARNING_ORANGE", 85),
    red: envNumber("PROVIDER_USAGE_WARNING_RED", 95),
  }
}

function warningLevel(percent: number): ProviderWarningLevel {
  const t = thresholds()
  if (percent >= t.red) return "red"
  if (percent >= t.orange) return "orange"
  if (percent >= t.yellow) return "yellow"
  return "green"
}

function percent(used: number, limit: number) {
  if (!limit) return 0
  return Math.min(999, Math.round((used / limit) * 100))
}

function emptyProvider(provider: "helius" | "etherscan" | "gemini", note: string): AdminProviderUsage {
  const isHelius = provider === "helius"
  const isGemini = provider === "gemini"
  const configuredLimit = isHelius
    ? envNumber("HELIUS_MONTHLY_CREDIT_LIMIT", 1_000_000)
    : isGemini ? envNumber("GEMINI_DAILY_REQUEST_LIMIT", 1_000) : envNumber("ETHERSCAN_DAILY_CALL_LIMIT", 100_000)

  return {
    provider,
    label: isHelius ? "Helius" : isGemini ? "Gemini" : "Etherscan",
    configuredLimit,
    limitWindow: isHelius ? "monthly" : "daily",
    limitUnit: isHelius ? "credits" : "requests",
    used: 0,
    usagePercent: 0,
    warningLevel: note ? "unknown" : "green",
    dailyRequests: 0,
    monthlyEstimatedCredits: 0,
    lastRateLimitAt: null,
    failedLast24h: 0,
    rateLimitedLast24h: 0,
    note,
  }
}

function buildProviderUsage(provider: "helius" | "etherscan" | "gemini", row?: ProviderUsageRow): AdminProviderUsage {
  const isHelius = provider === "helius"
  const isGemini = provider === "gemini"
  const configuredLimit = isHelius
    ? envNumber("HELIUS_MONTHLY_CREDIT_LIMIT", 1_000_000)
    : isGemini ? envNumber("GEMINI_DAILY_REQUEST_LIMIT", 1_000) : envNumber("ETHERSCAN_DAILY_CALL_LIMIT", 100_000)
  const dailyRequests = toNumber(row?.dailyRequests)
  const monthlyEstimatedCredits = toNumber(row?.monthlyEstimatedCredits)
  const used = isHelius ? monthlyEstimatedCredits : dailyRequests
  const usagePercent = percent(used, configuredLimit)
  const rateLimitedLast24h = toNumber(row?.rateLimitedLast24h)
  const failedLast24h = toNumber(row?.failedLast24h)

  return {
    provider,
    label: isHelius ? "Helius" : isGemini ? "Gemini" : "Etherscan",
    configuredLimit,
    limitWindow: isHelius ? "monthly" : "daily",
    limitUnit: isHelius ? "credits" : "requests",
    used,
    usagePercent,
    warningLevel: rateLimitedLast24h > 0 ? "red" : warningLevel(usagePercent),
    dailyRequests,
    monthlyEstimatedCredits,
    lastRateLimitAt: toIso(row?.lastRateLimitAt),
    failedLast24h,
    rateLimitedLast24h,
    note: isHelius
      ? "Estimated monthly Helius credit usage from Tri-Proof enrichment jobs."
      : isGemini ? "Telegram Gemini explanation requests, failures, and rate-limit events." : "Estimated daily Etherscan request usage from Tri-Proof enrichment jobs.",
  }
}

export async function getAdminProviderUsage(): Promise<AdminProviderUsage[]> {
  try {
    const rows = await db.$queryRaw<ProviderUsageRow[]>`
      SELECT
        "provider",
        COALESCE(SUM("requestCount") FILTER (WHERE "createdAt" >= date_trunc('day', NOW())), 0)::int AS "dailyRequests",
        COALESCE(SUM("estimatedCredits") FILTER (WHERE "createdAt" >= date_trunc('month', NOW())), 0)::int AS "monthlyEstimatedCredits",
        MAX("createdAt") FILTER (WHERE "status" = 'rate_limited') AS "lastRateLimitAt",
        COUNT(*) FILTER (WHERE "status" = 'failed' AND "createdAt" >= NOW() - INTERVAL '24 hours')::int AS "failedLast24h",
        COUNT(*) FILTER (WHERE "status" = 'rate_limited' AND "createdAt" >= NOW() - INTERVAL '24 hours')::int AS "rateLimitedLast24h"
      FROM "ProviderUsageLog"
      WHERE "provider" IN ('helius', 'etherscan', 'gemini')
      GROUP BY "provider"
    `
    const byProvider = new Map(rows.map((row) => [String(row.provider), row]))
    return [
      buildProviderUsage("helius", byProvider.get("helius")),
      buildProviderUsage("etherscan", byProvider.get("etherscan")),
      buildProviderUsage("gemini", byProvider.get("gemini")),
    ]
  } catch {
    return [
      emptyProvider("helius", "ProviderUsageLog table is not ready yet. Apply the provider usage migration."),
      emptyProvider("etherscan", "ProviderUsageLog table is not ready yet. Apply the provider usage migration."),
      emptyProvider("gemini", "ProviderUsageLog table is not ready yet. Apply the provider usage migration."),
    ]
  }
}
