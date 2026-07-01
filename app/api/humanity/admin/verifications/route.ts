import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

type VerificationRow = {
  id: string
  campaignId: string
  campaignName: string
  walletAddress: string
  walletChain: string | null
  decision: string
  humanSessionScore: number
  facePresenceScore: number | null
  headPoseScore: number | null
  eyeBlinkScore: number | null
  handGestureScore: number | null
  replayRiskScore: number | null
  injectionRiskScore: number | null
  reasonCodes: unknown
  signatureVerified: boolean
  proofExpiresAt: Date
  createdAt: Date
}

function csvEscape(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "")
  return `"${text.replace(/"/g, '""')}"`
}

function toCsv(rows: VerificationRow[]) {
  const header = [
    "id",
    "campaign",
    "walletAddress",
    "walletChain",
    "decision",
    "humanSessionScore",
    "signatureVerified",
    "reasonCodes",
    "createdAt",
    "proofExpiresAt",
  ]
  const lines = rows.map((row) => [
    row.id,
    row.campaignName,
    row.walletAddress,
    row.walletChain ?? "",
    row.decision,
    row.humanSessionScore,
    row.signatureVerified,
    JSON.stringify(row.reasonCodes ?? []),
    row.createdAt,
    row.proofExpiresAt,
  ].map(csvEscape).join(","))
  return [header.join(","), ...lines].join("\n")
}

export async function GET(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const url = new URL(request.url)
  const campaignId = url.searchParams.get("campaignId")
  const decision = url.searchParams.get("decision")
  const format = url.searchParams.get("format")

  try {
    const rows = await db.$queryRaw<VerificationRow[]>`
      SELECT
        v."id",
        v."campaignId",
        c."name" AS "campaignName",
        v."walletAddress",
        v."walletChain",
        v."decision",
        v."humanSessionScore",
        v."facePresenceScore",
        v."headPoseScore",
        v."eyeBlinkScore",
        v."handGestureScore",
        v."replayRiskScore",
        v."injectionRiskScore",
        v."reasonCodes",
        v."signatureVerified",
        v."proofExpiresAt",
        v."createdAt"
      FROM "HumanityVerification" v
      JOIN "HumanityCampaign" c ON c."id" = v."campaignId"
      WHERE (${campaignId}::text IS NULL OR v."campaignId" = ${campaignId} OR c."slug" = ${campaignId})
        AND (${decision}::text IS NULL OR v."decision"::text = ${decision})
      ORDER BY v."createdAt" DESC
      LIMIT 500
    `

    if (format === "csv") {
      return new NextResponse(toCsv(rows), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="humanity-verifications-${decision || "all"}.csv"`,
        },
      })
    }

    return NextResponse.json({ verifications: rows })
  } catch (error) {
    console.error("Humanity verifications failed", error)
    return NextResponse.json({ error: "Could not load Humanity verifications" }, { status: 500 })
  }
}
