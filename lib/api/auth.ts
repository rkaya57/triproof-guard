import { getCurrentUser } from "@/lib/auth/session"
import { apiError, getV1ApiUser } from "@/lib/api/v1-auth"

export { apiError }

/**
 * Shared API v2 auth.
 *
 * Bearer/API-key requests retain the existing subscription request metering.
 * Browser dashboard sessions are authenticated without consuming API request
 * quota; wallet-analysis billing remains enforced separately by the analysis
 * credit gate.
 */
export async function getApiUser(request: Request) {
  const authorization = request.headers.get("authorization")?.trim()
  if (authorization) return getV1ApiUser(request)

  const user = await getCurrentUser()
  if (!user) {
    return {
      user: null,
      error: apiError("Unauthorized. Use a dashboard session or Authorization: Bearer <API_KEY>.", 401),
    } as const
  }

  return { user, error: null } as const
}
