import { apiError, getApiUser } from "@/lib/api/auth"
import { assertWebhookAccess, SubscriptionLimitError } from "@/lib/billing/subscription"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import {
  normalizeWebhookDescription,
  normalizeWebhookEvents,
  normalizeWebhookUrl,
} from "@/lib/webhooks/management"

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

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireWebhookAccess(request)
  if (access.error) return access.error
  const { id } = await context.params

  try {
    const endpoint = await db.webhookEndpoint.findFirst({
      where: { id, userId: access.auth.user.id },
      include: {
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 25,
        },
      },
    })
    if (!endpoint) return apiError("Webhook endpoint not found", 404)

    return Response.json({
      id: endpoint.id,
      object: "webhook_endpoint",
      apiVersion: "v2",
      url: endpoint.url,
      eventTypes: endpoint.eventTypes,
      isActive: endpoint.isActive,
      description: endpoint.description,
      createdAt: endpoint.createdAt.toISOString(),
      updatedAt: endpoint.updatedAt.toISOString(),
      deliveries: endpoint.deliveries.map((delivery) => ({
        id: delivery.id,
        eventType: delivery.eventType,
        status: delivery.status,
        statusCode: delivery.statusCode,
        errorMessage: delivery.errorMessage,
        attemptCount: delivery.attemptCount,
        createdAt: delivery.createdAt.toISOString(),
        deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
      })),
    }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) return apiError("Database is required for webhook management", 503)
    throw error
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireWebhookAccess(request)
  if (access.error) return access.error
  const { id } = await context.params

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return apiError("Invalid JSON body", 400)
  }

  if (!["url", "eventTypes", "isActive", "description"].some((key) => key in body)) {
    return apiError("At least one webhook field is required", 400, { code: "WEBHOOK_UPDATE_REQUIRED" })
  }

  const url = "url" in body ? normalizeWebhookUrl(body.url) : undefined
  if ("url" in body && !url) return apiError("A valid HTTPS webhook url is required", 400, { code: "INVALID_WEBHOOK_URL" })

  const eventTypes = "eventTypes" in body
    ? normalizeWebhookEvents(body.eventTypes, { allowEmpty: false })
    : undefined
  if ("eventTypes" in body && !eventTypes?.length) {
    return apiError("At least one supported webhook event is required", 400, { code: "WEBHOOK_EVENTS_REQUIRED" })
  }

  const description = "description" in body ? normalizeWebhookDescription(body.description) : undefined
  if ("isActive" in body && typeof body.isActive !== "boolean") {
    return apiError("isActive must be a boolean", 400, { code: "INVALID_WEBHOOK_STATE" })
  }

  try {
    const existing = await db.webhookEndpoint.findFirst({
      where: { id, userId: access.auth.user.id },
      select: { id: true },
    })
    if (!existing) return apiError("Webhook endpoint not found", 404)

    const data: {
      url?: string
      eventTypes?: string[]
      isActive?: boolean
      description?: string | null
    } = {}
    if (url) data.url = url
    if (eventTypes) data.eventTypes = eventTypes
    if (typeof body.isActive === "boolean") data.isActive = body.isActive
    if (description !== undefined) data.description = description

    const endpoint = await db.webhookEndpoint.update({
      where: { id },
      data,
    })

    return Response.json({
      id: endpoint.id,
      object: "webhook_endpoint",
      apiVersion: "v2",
      url: endpoint.url,
      eventTypes: endpoint.eventTypes,
      isActive: endpoint.isActive,
      description: endpoint.description,
      updatedAt: endpoint.updatedAt.toISOString(),
      links: {
        self: `/api/v2/webhooks/${endpoint.id}`,
        collection: "/api/v2/webhooks",
      },
    }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) return apiError("Database is required for webhook management", 503)
    throw error
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireWebhookAccess(request)
  if (access.error) return access.error
  const { id } = await context.params

  try {
    const existing = await db.webhookEndpoint.findFirst({
      where: { id, userId: access.auth.user.id },
      select: { id: true },
    })
    if (!existing) return apiError("Webhook endpoint not found", 404)

    await db.webhookEndpoint.delete({ where: { id } })
    return Response.json({
      id,
      object: "webhook_endpoint_deleted",
      deleted: true,
      apiVersion: "v2",
    }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) return apiError("Database is required for webhook management", 503)
    throw error
  }
}
