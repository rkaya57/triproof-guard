import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { serializeAnalysis } from "@/lib/analysis/serializers"
import { getDevAnalysisForUser } from "@/lib/dev-store/store"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { buildPdfReport } from "@/lib/exports/pdf"
import { filterWalletsByExportType, walletsToCsv } from "@/lib/exports/csv"

export const runtime = "nodejs"

const csvFileNames = {
  approved: "approved_reward_candidates.csv",
  manual_review: "gray_zone_manual_review_wallets.csv",
  rejected: "rejected_not_eligible_wallets.csv",
  full: "full_analysis_report.csv",
} as const

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const type = new URL(request.url).searchParams.get("type") ?? "full"
  let analysisRecord
  try {
    analysisRecord = await db.analysis.findFirst({
      where: { id, project: { userId: user.id } },
      include: {
        project: true,
        wallets: { orderBy: [{ riskScore: "desc" }, { walletAddress: "asc" }] },
        clusters: { orderBy: [{ averageRiskScore: "desc" }, { clusterLabel: "asc" }] },
      },
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      const devAnalysis = await getDevAnalysisForUser(user.id, id)
      if (!devAnalysis) {
        return NextResponse.json({ error: "Analysis not found" }, { status: 404 })
      }

      return exportAnalysis(devAnalysis, type)
    }

    throw error
  }

  if (!analysisRecord) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 })
  }

  return exportAnalysis(serializeAnalysis(analysisRecord), type)
}

async function exportAnalysis(
  analysis: ReturnType<typeof serializeAnalysis>,
  type: string
) {
  if (type === "pdf") {
    const bytes = await buildPdfReport(analysis)
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer
    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${analysis.project.name.replace(/\W+/g, "-").toLowerCase()}-risk-report.pdf"`,
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
