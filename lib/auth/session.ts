import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { jwtVerify, SignJWT } from "jose"

import {
  createAuthSession,
  findAuthUserById,
  getActiveAuthSession,
  revokeAuthSession,
} from "@/lib/auth/store"
import { hashAuthValue, requestClientIp, requestUserAgent } from "@/lib/auth/security"
import { getSessionSigningSecret } from "@/lib/env/validation"

const sessionCookieName = "tri-proof-session"
const shortSessionAge = 60 * 60 * 24
const rememberedSessionAge = 60 * 60 * 24 * 30

function secretKey() {
  return new TextEncoder().encode(getSessionSigningSecret())
}

export type CurrentSession = {
  userId: string
  sessionId: string
  sessionVersion: number
}

export async function createSessionToken(input: {
  userId: string
  sessionId: string
  sessionVersion: number
  maxAgeSeconds: number
}) {
  return new SignJWT({
    userId: input.userId,
    sessionId: input.sessionId,
    sessionVersion: input.sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${input.maxAgeSeconds}s`)
    .setJti(input.sessionId)
    .sign(secretKey())
}

async function sessionTokenFromCookies() {
  const cookieStore = await cookies()
  return cookieStore.get(sessionCookieName)?.value ?? null
}

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const token = await sessionTokenFromCookies()
  if (!token) return null

  try {
    const verified = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] })
    const userId = verified.payload.userId
    const sessionId = verified.payload.sessionId
    const sessionVersion = verified.payload.sessionVersion
    if (
      typeof userId !== "string" ||
      typeof sessionId !== "string" ||
      typeof sessionVersion !== "number"
    ) {
      return null
    }

    const user = await findAuthUserById(userId)
    if (!user || user.sessionVersion !== sessionVersion) return null
    const active = await getActiveAuthSession({ sessionId, userId, sessionVersion })
    if (!active) return null
    return { userId, sessionId, sessionVersion }
  } catch {
    return null
  }
}

export async function getSessionUserId() {
  return (await getCurrentSession())?.userId ?? null
}

export async function getCurrentUser() {
  const session = await getCurrentSession()
  if (!session) return null
  const user = await findAuthUserById(session.userId)
  if (!user) return null
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    onboardingCompletedAt: user.onboardingCompletedAt,
    referralCode: user.referralCode,
    createdAt: user.createdAt,
  }
}

export async function requireCurrentUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  return user
}

export async function requireVerifiedCurrentUser() {
  const user = await requireCurrentUser()
  if (!user.emailVerifiedAt) throw new Error("Email verification required")
  return user
}

export async function attachSessionCookie(
  response: NextResponse,
  userId: string,
  options: { request?: Request; remember?: boolean } = {}
) {
  const user = await findAuthUserById(userId)
  if (!user) throw new Error("Cannot create a session for an unknown user.")

  const maxAgeSeconds = options.remember ? rememberedSessionAge : shortSessionAge
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000)
  const request = options.request
  const sessionId = await createAuthSession({
    userId,
    sessionVersion: user.sessionVersion,
    ipHash: request ? hashAuthValue(requestClientIp(request)) : null,
    userAgent: request ? requestUserAgent(request) : null,
    expiresAt,
  })
  const token = await createSessionToken({
    userId,
    sessionId,
    sessionVersion: user.sessionVersion,
    maxAgeSeconds,
  })

  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
    priority: "high",
  })
  return sessionId
}

export async function revokeCurrentSession() {
  const session = await getCurrentSession()
  if (session) await revokeAuthSession(session.sessionId, session.userId)
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    priority: "high",
  })
}
