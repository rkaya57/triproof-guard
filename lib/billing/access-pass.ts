import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { jwtVerify, SignJWT } from "jose"

const cookieName = "tri-proof-access-pass"
const maxAge = 60 * 60 * 24 * 30

export type AccessPass = {
  userId: string
  plan: string
  txHash: string
  network: string
  walletCredits: number
  amountUsdc: number
}

function secretKey() {
  return new TextEncoder().encode(
    process.env.NEXTAUTH_SECRET ?? "development-secret-change-me"
  )
}

export async function createAccessPassToken(pass: AccessPass) {
  return new SignJWT(pass)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey())
}

export async function getAccessPassForUser(userId: string) {
  const cookieStore = await cookies()
  const token = cookieStore.get(cookieName)?.value
  if (!token) return null

  try {
    const verified = await jwtVerify(token, secretKey())
    const payload = verified.payload
    if (payload.userId !== userId) return null

    const walletCredits = Number(payload.walletCredits)
    const amountUsdc = Number(payload.amountUsdc)
    if (!Number.isFinite(walletCredits) || walletCredits <= 0) return null
    if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) return null

    return {
      userId: String(payload.userId),
      plan: String(payload.plan),
      txHash: String(payload.txHash),
      network: String(payload.network),
      walletCredits,
      amountUsdc,
    } satisfies AccessPass
  } catch {
    return null
  }
}

export async function attachAccessPassCookie(response: NextResponse, pass: AccessPass) {
  const token = await createAccessPassToken(pass)
  response.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  })
}
