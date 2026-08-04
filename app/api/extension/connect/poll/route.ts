import { NextResponse } from "next/server"

import { createExtensionAccessToken } from "@/lib/extension/auth"
import { db } from "@/lib/db/prisma"
import { hashExtensionSecret } from "@/lib/extension/connection"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { requestId?: unknown; pollToken?: unknown }
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : ""
  const pollToken = typeof body.pollToken === "string" ? body.pollToken.trim() : ""
  if (!requestId || !pollToken) return NextResponse.json({ error: "Invalid extension connection request." }, { status: 400 })

  const connection = await db.extensionConnectRequest.findUnique({
    where: { id: requestId },
    select: {
      pollTokenHash: true,
      status: true,
      userId: true,
      extensionTokenId: true,
      extensionTokenExpiresAt: true,
      expiresAt: true,
      revokedAt: true,
    },
  })
  if (!connection || connection.pollTokenHash !== hashExtensionSecret(pollToken)) {
    return NextResponse.json({ error: "Extension connection was not found." }, { status: 404 })
  }
  if (connection.expiresAt <= new Date()) {
    return NextResponse.json({ status: "expired" }, { headers: { "Cache-Control": "no-store" } })
  }
  if (connection.status !== "APPROVED" || !connection.userId || !connection.extensionTokenId || !connection.extensionTokenExpiresAt || connection.revokedAt) {
    return NextResponse.json({ status: "pending" }, { headers: { "Cache-Control": "no-store" } })
  }

  const accessToken = await createExtensionAccessToken({
    userId: connection.userId,
    requestId,
    tokenId: connection.extensionTokenId,
  })
  return NextResponse.json(
    { status: "approved", accessToken, expiresAt: connection.extensionTokenExpiresAt.toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  )
}
