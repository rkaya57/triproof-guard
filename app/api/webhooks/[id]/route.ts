import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import {
  normalizeWebhookDescription,
  normalizeWebhookEvents,
} from "@/lib/webhooks/management"

export const runtime = "nodejs"

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const body = (await request.json().catch(() => null)) as {
    isActive?: boolean
    eventTypes?: string[]
    description?: string | null
  } | null

  try {
    const endpoint = await db.webhookEndpoint.findFirst({ where: { id, userId: user.id } })
    if (!endpoint) return NextResponse.json({ error: "Webhook endpoint not found" }, { status: 404 })

    const eventTypes = body && "eventTypes" in body
      ? normalizeWebhookEvents(body.eventTypes, { allowEmpty: false })
      : undefined
    const description = body && "description" in body
      ? normalizeWebhookDescription(body.description)
      : undefined
    const updated = await db.webhookEndpoint.update({
      where: { id },
      data: {
        isActive: typeof body?.isActive === "boolean" ? body.isActive : undefined,
        eventTypes: eventTypes ?? undefined,
        description,
      },
    })

    return NextResponse.json({
      endpoint: {
        id: updated.id,
        url: updated.url,
        eventTypes: updated.eventTypes,
        isActive: updated.isActive,
        description: updated.description,
        updatedAt: updated.updatedAt,
      },
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database is required for webhooks" }, { status: 503 })
    }
    throw error
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params

  try {
    const endpoint = await db.webhookEndpoint.findFirst({ where: { id, userId: user.id } })
    if (!endpoint) return NextResponse.json({ error: "Webhook endpoint not found" }, { status: 404 })

    await db.webhookEndpoint.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database is required for webhooks" }, { status: 503 })
    }
    throw error
  }
}
