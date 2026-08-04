import { NextResponse } from "next/server"

import { extensionBearerToken, verifyExtensionAccessToken } from "@/lib/extension/auth"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const token = extensionBearerToken(request)
  const claims = token ? await verifyExtensionAccessToken(token) : null
  if (!claims) return NextResponse.json({ error: "Extension session is already disconnected." }, { status: 401 })

  await db.extensionConnectRequest.updateMany({
    where: { id: claims.requestId, userId: claims.userId, extensionTokenId: claims.tokenId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
}
