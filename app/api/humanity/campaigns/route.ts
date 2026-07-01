import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import { ensureHumanityDemoCampaigns } from "@/lib/humanity/admin-gate"

export const runtime = "nodejs"

type CampaignRow = {
  id: string
  name: string
  slug: string
  description: string | null
  challengeLevel: string
  humanityGateEnabled: boolean
  proofExpiresInDays: number
  maxAttemptsPerWallet: number
  createdAt: Date
}

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  try {
    await ensureHumanityDemoCampaigns()
    const campaigns = await db.$queryRaw<CampaignRow[]>`
      SELECT "id", "name", "slug", "description", "challengeLevel", "humanityGateEnabled", "proofExpiresInDays", "maxAttemptsPerWallet", "createdAt"
      FROM "HumanityCampaign"
      ORDER BY "createdAt" DESC
    `
    return NextResponse.json({ campaigns })
  } catch (error) {
    console.error("Humanity campaigns failed", error)
    return NextResponse.json(
      {
        error: "Humanity tables are not ready. Run Prisma migrations first.",
        migrationCommand: "npx prisma generate && npx prisma migrate deploy",
      },
      { status: 503 }
    )
  }
}

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const body = (await request.json().catch(() => null)) as {
    name?: string
    slug?: string
    description?: string
    challengeLevel?: string
  } | null

  const name = body?.name?.trim()
  const slug = body?.slug?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-")
  const description = body?.description?.trim() || null
  const level = ["BASIC", "STANDARD", "STRICT"].includes(body?.challengeLevel ?? "")
    ? body?.challengeLevel
    : "STANDARD"

  if (!name || !slug) {
    return NextResponse.json({ error: "name and slug are required" }, { status: 400 })
  }

  try {
    const rows = await db.$queryRaw<CampaignRow[]>`
      INSERT INTO "HumanityCampaign" ("id", "name", "slug", "description", "challengeLevel", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${name}, ${slug}, ${description}, ${level}::"HumanityChallengeLevel", NOW(), NOW())
      RETURNING "id", "name", "slug", "description", "challengeLevel", "humanityGateEnabled", "proofExpiresInDays", "maxAttemptsPerWallet", "createdAt"
    `
    return NextResponse.json({ campaign: rows[0] }, { status: 201 })
  } catch (error) {
    console.error("Humanity campaign create failed", error)
    return NextResponse.json({ error: "Could not create Humanity campaign" }, { status: 500 })
  }
}
