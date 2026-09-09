import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import { z } from "zod"

import { getApiUser } from "@/lib/api/auth"
import { db } from "@/lib/db/prisma"
import { createHumanGuardSiteKey, normalizeAllowedOrigins } from "@/lib/humanguard/core"

export const runtime = "nodejs"

const createSiteSchema = z.object({
  name: z.string().trim().min(1).max(100),
  allowedOrigins: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
  mode: z.enum(["ADAPTIVE", "ALWAYS_CHALLENGE"]).default("ADAPTIVE"),
  walletRequired: z.boolean().default(false),
})

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}

export async function GET(request: Request) {
  const auth = await getApiUser(request)
  if (auth.error) return auth.error

  const sites = await db.humanGuardSite.findMany({
    where: { ownerUserId: auth.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      siteKey: true,
      allowedOrigins: true,
      mode: true,
      walletRequired: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { sessions: true, proofs: true } },
    },
  })

  return noStore({
    object: "list",
    apiVersion: "v2",
    sites: sites.map((site) => ({
      id: site.id,
      object: "humanguard_site",
      name: site.name,
      siteKey: site.siteKey,
      allowedOrigins: site.allowedOrigins,
      mode: site.mode,
      walletRequired: site.walletRequired,
      enabled: site.enabled,
      sessionCount: site._count.sessions,
      proofCount: site._count.proofs,
      createdAt: site.createdAt.toISOString(),
      updatedAt: site.updatedAt.toISOString(),
    })),
  })
}

export async function POST(request: Request) {
  const auth = await getApiUser(request)
  if (auth.error) return auth.error

  const parsed = createSiteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return noStore({ error: "Invalid HumanGuard site request", issues: parsed.error.issues }, 400)
  }

  let allowedOrigins: string[]
  try {
    allowedOrigins = normalizeAllowedOrigins(parsed.data.allowedOrigins)
  } catch (error) {
    return noStore({
      error: error instanceof Error ? error.message : "Invalid HumanGuard origin",
    }, 400)
  }

  const site = await db.humanGuardSite.create({
    data: {
      ownerUserId: auth.user.id,
      name: parsed.data.name,
      siteKey: createHumanGuardSiteKey(),
      allowedOrigins: allowedOrigins as Prisma.InputJsonValue,
      mode: parsed.data.mode,
      walletRequired: parsed.data.walletRequired,
    },
  })

  return noStore({
    id: site.id,
    object: "humanguard_site",
    apiVersion: "v2",
    name: site.name,
    siteKey: site.siteKey,
    allowedOrigins: site.allowedOrigins,
    mode: site.mode,
    walletRequired: site.walletRequired,
    enabled: site.enabled,
    integration: {
      script: "https://triproofprotocol.com/humanguard/v1.js",
      verifyEndpoint: "/api/v2/humanguard/siteverify",
    },
    createdAt: site.createdAt.toISOString(),
  }, 201)
}
