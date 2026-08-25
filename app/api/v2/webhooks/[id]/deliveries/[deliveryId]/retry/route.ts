import { apiError } from "@/lib/api/auth"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { requireWebhookApiAccess } from "@/lib/webhooks/api-access"
import {
  retrySingleWebhookDelivery,
  WebhookRetryConflictError,
} from "@/lib/webhooks/retry"

export const runtime = "nodejs"

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; deliveryId: string }> },
) {
  const access = await requireWebhookApiAccess(request)
  if (access.error) return access.error
  const { id, deliveryId } = await context.params

  try {
    const result = await retrySingleWebhookDelivery({
      userId: access.auth.user.id,
      endpointId: id,
      deliveryId,
    })
    if (!result) return apiError("Webhook delivery not found", 404)

    return Response.json({
      object: "webhook_delivery_retry",
      apiVersion: "v2",
      endpointId: id,
      delivery: result,
      links: {
        endpoint: `/api/v2/webhooks/${id}`,
        deliveries: `/api/v2/webhooks/${id}/deliveries`,
      },
    }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    if (error instanceof WebhookRetryConflictError) {
      return apiError(error.message, 409, { code: error.code })
    }
    if (isDatabaseConnectionError(error)) return apiError("Database is required for webhook retry", 503)
    throw error
  }
}
