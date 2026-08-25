import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import {
  buildCampaignDecisionPackageCsv,
  buildCampaignDecisionPackageJson,
  safeCampaignDecisionPackageFileStem,
} from "@/lib/campaign-decision-package/export"
import { loadCampaignDecisionPackage } from "@/lib/campaign-decision-package/server"
import { isDatabaseConnectionError } from "@/lib/db/errors"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const format = new URL(request.url).searchParams.get("format")?.trim().toLowerCase() || "json"
  if (format !== "json" && format !== "csv") {
    return NextResponse.json({ error: "format must be json or csv" }, { status: 400 })
  }

  try {
    const loaded = await loadCampaignDecisionPackage(id, user.id)
    if (!loaded) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    if (!loaded.package) {
      return NextResponse.json(
        { error: "Campaign analysis is required", campaignId: loaded.campaignId },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      )
    }

    const stem = safeCampaignDecisionPackageFileStem(loaded.campaignName)
    if (format === "csv") {
      return new Response(buildCampaignDecisionPackageCsv(loaded.package), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${stem}-decision-package.csv"`,
          "Cache-Control": "private, no-store",
        },
      })
    }

    return new Response(buildCampaignDecisionPackageJson(loaded.package), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `inline; filename="${stem}-decision-package.json"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json(
        { error: "Campaign decision package is temporarily unavailable" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      )
    }
    console.error("Campaign decision package load failed", error)
    return NextResponse.json({ error: "Campaign decision package could not be loaded" }, { status: 500 })
  }
}
