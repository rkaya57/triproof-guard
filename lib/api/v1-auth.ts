import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

type ApiUser = {
  id: string
  name: string
  email: string
  createdAt?: Date | string
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? ""
  const [scheme, token] = header.split(" ")
  if (scheme?.toLowerCase() !== "bearer" || !token) return null
  return token.trim()
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let result = 0
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return result === 0
}

export function apiError(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status })
}

export async function getV1ApiUser(request: Request): Promise<
  | { user: ApiUser; error: null }
  | { user: null; error: NextResponse }
> {
  const token = bearerToken(request)

  if (token) {
    const expected = process.env.TRIPROOF_API_KEY?.trim()
    if (!expected || !constantTimeEqual(token, expected)) {
      return { user: null, error: apiError("Invalid API key", 401) }
    }

    const email = process.env.TRIPROOF_API_USER_EMAIL?.trim()
    if (!email) {
      return {
        user: null,
        error: apiError("TRIPROOF_API_USER_EMAIL is not configured for API key usage", 503),
      }
    }

    try {
      const user = await db.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true, createdAt: true },
      })

      if (!user) {
        return { user: null, error: apiError("Configured API user was not found", 503) }
      }

      return { user, error: null }
    } catch (error) {
      if (isDatabaseConnectionError(error)) {
        return { user: null, error: apiError("Database is required for API usage", 503) }
      }
      throw error
    }
  }

  const sessionUser = await getCurrentUser()
  if (!sessionUser) {
    return {
      user: null,
      error: apiError("Unauthorized. Use a dashboard session or Authorization: Bearer <TRIPROOF_API_KEY>.", 401),
    }
  }

  return { user: sessionUser, error: null }
}
