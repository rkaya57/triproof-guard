import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { jwtVerify, SignJWT } from "jose"

import { findDevUserById } from "@/lib/dev-store/store"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

const sessionCookieName = "tri-proof-session"
const maxAge = 60 * 60 * 24 * 7

function secretKey() {
  return new TextEncoder().encode(
    process.env.NEXTAUTH_SECRET ?? "development-secret-change-me"
  )
}

export async function createSessionToken(userId: string) {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey())
}

export async function getSessionUserId() {
  const cookieStore = await cookies()
  const token = cookieStore.get(sessionCookieName)?.value
  if (!token) return null

  try {
    const verified = await jwtVerify(token, secretKey())
    const userId = verified.payload.userId
    return typeof userId === "string" ? userId : null
  } catch {
    return null
  }
}

export async function getCurrentUser() {
  const userId = await getSessionUserId()
  if (!userId) return null

  try {
    return await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, createdAt: true },
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return findDevUserById(userId)
    }

    throw error
  }
}

export async function requireCurrentUser() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Unauthorized")
  }

  return user
}

export async function attachSessionCookie(response: NextResponse, userId: string) {
  const token = await createSessionToken(userId)
  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  })
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
}
