import { NextResponse } from "next/server"

import { getDemoAnalysis } from "@/lib/demo-data"
import { filterWalletsByExportType, walletsToCsv } from "@/lib/exports/csv"
import { buildPdfReport } from "@/lib/exports/pdf"

export const runtime = "nodejs"

const csvFileNames = {
  approved: "approved_wallets.csv",
  manual_review: "manual_review_wallets.csv",
  rejected: "rejected_wallets.csv",
  full: "full_analysis_report.csv",
} as const

export async function GET(request: Request) {
  const type = new URL(request.url).searchParams.get("type") ?? "full"
  const analysis = getDemoAnalysis()

  if (type === "pdf") {
    const bytes = await buildPdfReport(analysis)
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer
    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="tri-proof-guard-demo-report.pdf"',
      },
    })
  }

  if (!["approved", "manual_review", "rejected", "full"].includes(type)) {
    return NextResponse.json({ error: "Unsupported export type" }, { status: 400 })
  }

  const exportType = type as keyof typeof csvFileNames
  const csv = walletsToCsv(
    filterWalletsByExportType(
      analysis.wallets,
      exportType === "approved" ? "approved" : exportType
    ),
    exportType === "full"
  )

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFileNames[exportType]}"`,
    },
  })
}
