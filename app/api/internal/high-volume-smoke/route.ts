import { NextResponse } from "next/server"

import { db } from "@/lib/db/prisma"
import { enrichSolanaWalletsBulk } from "@/lib/onchain/providers/helius-bulk"

export const runtime = "nodejs"
export const maxDuration = 300

const TEST_CONFIRMATION = "triproof-real-data-smoke-20260801"

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Preview only" }, { status: 404 })
  }

  const url = new URL(request.url)
  if (url.searchParams.get("confirm") !== TEST_CONFIRMATION) {
    return NextResponse.json({ error: "Confirmation required" }, { status: 403 })
  }

  const requested = Number.parseInt(url.searchParams.get("count") ?? "100", 10)
  const count = Math.min(500, Math.max(1, Number.isFinite(requested) ? requested : 100))
  const rows = await db.$queryRaw<Array<{ walletAddress: string }>>`
    SELECT DISTINCT wa."walletAddress"
    FROM "WalletAnalysis" wa
    WHERE wa."chain" = 'Solana'
      AND length(wa."walletAddress") BETWEEN 32 AND 44
      AND wa."walletAddress" <> '11111111111111111111111111111111'
    ORDER BY wa."walletAddress"
    LIMIT ${count}
  `

  const startedAt = Date.now()
  const output = await enrichSolanaWalletsBulk({
    addresses: rows.map((row) => row.walletAddress),
  })
  const results = Array.from(output.results.values())
  const accountTypes = results.reduce<Record<string, number>>((summary, result) => {
    const key = result.data.accountType ?? "unknown"
    summary[key] = (summary[key] ?? 0) + 1
    return summary
  }, {})
  const providers = Array.from(new Set(results.map((result) => result.provider)))
  const completed = results.filter((result) => result.status === "completed").length
  const failed = results.length - completed
  const withHistory = results.filter(
    (result) =>
      result.data.firstSeen !== null ||
      (result.data.txCount !== null && result.data.txCount > 0)
  ).length
  const withFunding = results.filter(
    (result) => result.data.fundingSource !== null
  ).length

  return NextResponse.json({
    source: "preview-database-distinct-solana-wallets",
    requested: count,
    discovered: rows.length,
    completed,
    failed,
    completionRate: rows.length
      ? Number(((completed / rows.length) * 100).toFixed(2))
      : 0,
    withHistory,
    withFunding,
    accountTypes,
    providers,
    requestCount: output.requestCount,
    rateLimitCount: output.rateLimitCount,
    warnings: output.warnings,
    elapsedMs: Date.now() - startedAt,
  })
}
