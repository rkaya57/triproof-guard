import { db } from "@/lib/db/prisma"

export type ProviderUsageStatus = "success" | "failed" | "rate_limited"

type ProviderUsageInput = {
  provider: string
  chain?: string | null
  method: string
  analysisId?: string | null
  userId?: string | null
  estimatedCredits?: number
  requestCount?: number
  status?: ProviderUsageStatus
  errorMessage?: string | null
}

const heliusCreditEstimate: Record<string, number> = {
  getBalance: 1,
  getAccountInfo: 1,
  getSignaturesForAddress: 1,
  getTokenAccountsByOwner: 5,
  getTransaction: 10,
}

export function estimateProviderCredits(provider: string, method: string, requestCount = 1) {
  const normalizedProvider = provider.toLowerCase()
  if (normalizedProvider === "helius") {
    return Math.max(1, requestCount) * (heliusCreditEstimate[method] ?? 1)
  }

  return Math.max(1, requestCount)
}

export async function recordProviderUsage(input: ProviderUsageInput) {
  const provider = input.provider.toLowerCase()
  const requestCount = Math.max(1, Math.trunc(input.requestCount ?? 1))
  const estimatedCredits = Math.max(
    1,
    Math.trunc(input.estimatedCredits ?? estimateProviderCredits(provider, input.method, requestCount))
  )
  const status = input.status ?? "success"
  const errorMessage = input.errorMessage?.slice(0, 500) ?? null

  try {
    await db.$executeRaw`
      INSERT INTO "ProviderUsageLog" (
        "id", "provider", "chain", "method", "analysisId", "userId",
        "estimatedCredits", "requestCount", "status", "errorMessage", "createdAt"
      ) VALUES (
        ${crypto.randomUUID()}, ${provider}, ${input.chain ?? null}, ${input.method},
        ${input.analysisId ?? null}, ${input.userId ?? null}, ${estimatedCredits},
        ${requestCount}, ${status}, ${errorMessage}, NOW()
      )
    `
  } catch (error) {
    console.warn("Provider usage logging skipped", error instanceof Error ? error.message : String(error))
  }
}
