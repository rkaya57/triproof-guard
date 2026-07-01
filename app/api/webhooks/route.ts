import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { createWebhookSecret } from "@/lib/webhooks/sign"

export const runtime = "nodejs"

const supportedEvents = ["analysis.completed"]

function safeWebhookUrl(value: unknown) {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") return null
    return url.toString()
  } catch {
    return null
  }
}

function normalizeEvents(value: unknown) {
  const events = Array.isArray(value) ? value.map(String) : ["analysis.completed"]
  const normalized = events.filter((event) => supportedEvents.includes(event))
  return normalized.length ? normalized : ["analysis.completed"]
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const endpoints = await db.webhookEndpoint.findMany({
      where: { userId: user.id },
      include: {
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({
      endpoints: endpoints.map((endpoint) => ({
        id: endpoint.id,
        url: endpoint.url,
        eventTypes: endpoint.eventTypes,
        isActive: endpoint.isActive,
        description: endpoint.description,
        createdAt: endpoint.createdAt,
        latestDeliveries: endpoint.deliveries.map((delivery) => ({
          id: delivery.id,
          eventType: delivery.eventType,
          status: delivery.status,
          statusCode: delivery.statusCode,
          errorMessage: delivery.errorMessage,
          createdAt: delivery.createdAt,
          deliveredAt: delivery.deliveredAt,
        })),
      })),
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database is required for webhooks" }, { status: 503 })
    }
    throw error
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    url?: string
    eventTypes?: string[]
    description?: string
  } | null

  const url = safeWebhookUrl(body?.url)
  if (!url) {
    return NextResponse.json({ error: "A valid HTTPS webhook url is required" }, { status: 400 })
  }

  const eventTypes = normalizeEvents(body?.eventTypes)
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 200) : null
  const secret = createWebhookSecret()

  try {
    const endpoint = await db.webhookEndpoint.create({
      data: {
        userId: user.id,
        url,
        secret,
        eventTypes,
        description,
      },
    })

    return NextResponse.json({
      endpoint: {
        id: endpoint.id,
        url: endpoint.url,
        eventTypes: endpoint.eventTypes,
        isActive: endpoint.isActive,
        description: endpoint.description,
        createdAt: endpoint.createdAt,
      },
      secret,
      note: "Store this secret now. It is used to verify x-triproof-signature headers.",
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database is required for webhooks" }, { status: 503 })
    }
    throw error
  }
}
