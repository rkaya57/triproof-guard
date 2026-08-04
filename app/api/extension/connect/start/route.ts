import { NextResponse } from "next/server"

import { db } from "@/lib/db/prisma"
import {
  createExtensionPollToken,
  createExtensionVerificationCode,
  extensionConnectDurationMs,
  hashExtensionSecret,
} from "@/lib/extension/connection"

export const runtime = "nodejs"

function cleanDeviceName(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 80) || null : null
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { deviceName?: unknown }
  const verificationCode = createExtensionVerificationCode()
  const pollToken = createExtensionPollToken()
  const expiresAt = new Date(Date.now() + extensionConnectDurationMs)
  const connection = await db.extensionConnectRequest.create({
    data: {
      verificationCodeHash: hashExtensionSecret(verificationCode),
      pollTokenHash: hashExtensionSecret(pollToken),
      deviceName: cleanDeviceName(body.deviceName),
      expiresAt,
    },
    select: { id: true },
  })

  return NextResponse.json(
    {
      requestId: connection.id,
      verificationCode,
      pollToken,
      expiresAt: expiresAt.toISOString(),
      connectUrl: `/extension/connect?request=${encodeURIComponent(connection.id)}`,
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
