import { apiError, getApiUser } from "@/lib/api/auth"
import { assertWebhookAccess, SubscriptionLimitError } from "@/lib/billing/subscription"

export async function requireWebhookApiAccess(request: Request) {
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
