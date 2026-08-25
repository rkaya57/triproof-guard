import { apiError, getApiUser } from "@/lib/api/auth"
import { assertWebhookAccess, SubscriptionLimitError } from "@/lib/billing/subscription"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { SUPPORTED_WEBHOOK_EVENTS } from "@/lib/webhooks/campaign-events"
import {
  normalizeWebhookDescription,
  normalizeWebhookEvents,
  normalizeWebhookUrl,
} from "@/lib/webhooks/management"
import { createWebhookSecret } from "@/lib/webhooks/sign"

export const runtime = "nodejs"

async function requireWebhookAccess(request: Request) {
  const auth = await getApiUser(request)
  if (auth.error) return { auth: null, error: auth.error } as const
  try {
    await assertWebhookAccess(auth.user)
    return { auth, error: null } as const
  } catch (error) {
    if (error instanceof SubscriptionLimitError) {
      return {
        auth: null,
        error: apiError(error.message, 403, { code: error.code }),
      } as const
    }
    throw error
  }
}

export async function GET(request: Request) {
  const access = await requireWebhookAccess(request)
  if (access.error) return access.error

  try {
    const endpoints = await db.webhookEndpoint.findMany({
      where: { userId: access.auth.user.id },
      include: {
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return Response.json({
      object: "webhook_endpoint_list",
      apiVersion: "v2",
      supportedEvents: SUPPORTED_WEBHOOK_EVENTS,
      endpoints: endpoints.map((endpoint) => ({
        id: endpoint.id,
        object: "webhook_endpoint",
        url: endpoint.url,
        eventTypes: endpoint.eventTypes,
        isActive: endpoint.isActive,
        description: endpoint.description,
        createdAt: endpoint.createdAt.toISOString(),
        updatedAt: endpoint.updatedAt.toISOString(),
        latestDeliveries: endpoint.deliveries.map((delivery) => ({
          id: delivery.id,
          eventType: delivery.eventType,
          status: delivery.status,
          statusCode: delivery.statusCode,
          errorMessage: delivery.errorMessage,
          attemptCount: delivery.attemptCount,
          createdAt: delivery.createdAt.toISOString(),
          deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
        })),
      })),
    }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) return apiError("Database is required for webhook management", 503)
    throw error
  }
}

export async function POST(request: Request) {
  const access = await requireWebhookAccess(request)
  if (access.error) return access.error

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return apiError("Invalid JSON body", 400)
  }

  const url = normalizeWebhookUrl(body.url)
  if (!url) return apiError("A valid HTTPS webhook url is required", 400, { code: "INVALID_WEBHOOK_URL" })

  const eventTypes = normalizeWebhookEvents(body.eventTypes, { fallback: ["analysis.completed"] })
  if (!eventTypes?.length) return apiError("At least one supported webhook event is required", 400, { code: "WEBHOOK_EVENTS_REQUIRED" })

  const description = normalizeWebhookDescription(body.description)
  const secret = createWebhookSecret()

  try {
    const endpoint = await db.webhookEndpoint.create({
      data: {
        userId: access.auth.user.id,
        url,
        secret,
        eventTypes,
        description,
      },
    })

    return Response.json({
      id: endpoint.id,
      object: "webhook_endpoint",
      apiVersion: "v2",
      url: endpoint.url,
      eventTypes: endpoint.eventTypes,
      isActive: endpoint.isActive,
      description: endpoint.description,
      secret,
      createdAt: endpoint.createdAt.toISOString(),
      note: "Store the signing secret now. It is returned only when the endpoint is created.",
      links: {
        self: `/api/v2/webhooks/${endpoint.id}`,
        collection: "/api/v2/webhooks",
        docs: "/docs/webhooks",
      },
    }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) return apiError("Database is required for webhook management", 503)
    throw error
  }
}
