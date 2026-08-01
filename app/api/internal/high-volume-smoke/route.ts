import { NextResponse } from "next/server"

import { enrichSolanaWalletsBulk } from "@/lib/onchain/providers/helius-bulk"
import { isValidWalletAddress } from "@/lib/validators/wallet"

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

  const addresses = Array.from(
    new Set(
      (url.searchParams.get("addresses") ?? "")
        .split(",")
        .map((address) => address.trim())
        .filter((address) => isValidWalletAddress(address, "Solana"))
    )
  ).slice(0, 100)

  if (!addresses.length) {
    return NextResponse.json(
      { error: "Provide one to 100 valid Solana addresses" },
      { status: 400 }
    )
  }

  const startedAt = Date.now()
  const output = await enrichSolanaWalletsBulk({ addresses })
  const results = Array.from(output.results.values())
  const accountTypes = results.reduce<Record<string, number>>((summary, result) => {
    const key = result.data.accountType ?? "unknown"
    summary[key] = (summary[key] ?? 0) + 1
    return summary
  }, {})
  const completed = results.filter((result) => result.status === "completed").length
  const failed = results.length - completed

  return NextResponse.json({
    source: "caller-supplied-real-solana-addresses",
    supplied: addresses.length,
    completed,
    failed,
    completionRate: Number(((completed / addresses.length) * 100).toFixed(2)),
    withHistory: results.filter(
      (result) =>
        result.data.firstSeen !== null ||
        (result.data.txCount !== null && result.data.txCount > 0)
    ).length,
    withFunding: results.filter(
      (result) => result.data.fundingSource !== null
    ).length,
    accountTypes,
    providers: Array.from(new Set(results.map((result) => result.provider))),
    requestCount: output.requestCount,
    rateLimitCount: output.rateLimitCount,
    warnings: output.warnings,
    elapsedMs: Date.now() - startedAt,
  })
}
