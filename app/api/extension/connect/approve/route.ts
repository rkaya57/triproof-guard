import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { db } from "@/lib/db/prisma"
import {
  createExtensionTokenId,
  extensionAccessDurationMs,
  hashExtensionSecret,
} from "@/lib/extension/connection"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Sign in to connect your extension." }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { requestId?: unknown; verificationCode?: unknown }
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : ""
  const verificationCode = typeof body.verificationCode === "string" ? body.verificationCode.trim().toUpperCase() : ""
  if (!requestId || !/^[A-F0-9]{6}$/.test(verificationCode)) {
    return NextResponse.json({ error: "Enter the six-character code shown in ScamGuard." }, { status: 400 })
  }

  const connection = await db.extensionConnectRequest.findUnique({
    where: { id: requestId },
    select: { id: true, verificationCodeHash: true, status: true, expiresAt: true, userId: true },
  })
  if (!connection || connection.expiresAt <= new Date()) {
    return NextResponse.json({ error: "This connection request expired. Start again from the ScamGuard extension." }, { status: 410 })
  }
  if (connection.verificationCodeHash !== hashExtensionSecret(verificationCode)) {
    return NextResponse.json({ error: "That code does not match this extension request." }, { status: 400 })
  }
  if (connection.status === "APPROVED" && connection.userId !== user.id) {
    return NextResponse.json({ error: "This extension request is already linked to another account." }, { status: 409 })
  }

  const extensionTokenId = createExtensionTokenId()
  const extensionTokenExpiresAt = new Date(Date.now() + extensionAccessDurationMs)
  await db.extensionConnectRequest.update({
    where: { id: connection.id },
    data: {
      status: "APPROVED",
      userId: user.id,
      approvedAt: new Date(),
      revokedAt: null,
      extensionTokenId,
      extensionTokenExpiresAt,
    },
  })

  return NextResponse.json({ ok: true, expiresAt: extensionTokenExpiresAt.toISOString() }, { headers: { "Cache-Control": "no-store" } })
}
