import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

const createSchema = z.object({
  name: z.string().trim().min(3).max(120),
  slug: z.string().trim().min(3).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(500).optional(),
  challengeLevel: z.enum(["BASIC", "STANDARD", "STRICT"]).default("STANDARD"),
  proofExpiresInDays: z.number().int().min(1).max(365).default(30),
  maxAttemptsPerWallet: z.number().int().min(1).max(10).default(3),
  humanityGateEnabled: z.boolean().default(true),
})

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const campaigns = await db.humanityCampaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { sessions: true, verifications: true } },
    },
  })

  return NextResponse.json({ campaigns })
}

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Humanity V2 campaign", issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const campaign = await db.humanityCampaign.create({ data: parsed.data })
    return NextResponse.json({ campaign }, { status: 201 })
  } catch (error) {
    console.error("Humanity V2 campaign creation failed", error)
    return NextResponse.json({ error: "Could not create Humanity V2 campaign" }, { status: 500 })
  }
}
