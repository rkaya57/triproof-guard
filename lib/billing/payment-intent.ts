import { randomBytes } from "node:crypto"

import { jwtVerify, SignJWT } from "jose"

import { getAccessPassSigningSecret } from "@/lib/env/validation"
import { getSolUsdPrice, usdToSolAmount } from "@/lib/billing/sol-price-quote"

const intentLifetimeSeconds = 15 * 60
const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

export type PaymentCurrency = "USDC" | "SOL"
export type PaymentPurchaseKind = "subscription" | "credits"

export type SignedPaymentIntent = {
  intentId: string
  userId: string
  purchaseKind: PaymentPurchaseKind
  itemId: string
  currency: PaymentCurrency
  amountUsdc: number
  amountSol: number | null
  solUsdPrice: number | null
  reference: string
  expiresAt: string
}

function signingKey() {
  return new TextEncoder().encode(getAccessPassSigningSecret())
}

function base58Encode(bytes: Uint8Array) {
  if (!bytes.length) return ""
  const digits = [0]
  for (const byte of bytes) {
    let carry = byte
    for (let index = 0; index < digits.length; index += 1) {
      const value = digits[index] * 256 + carry
      digits[index] = value % 58
      carry = Math.floor(value / 58)
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = Math.floor(carry / 58)
    }
  }

  let result = ""
  for (const byte of bytes) {
    if (byte !== 0) break
    result += base58Alphabet[0]
  }
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    result += base58Alphabet[digits[index]]
  }
  return result
}

export function createPaymentReference() {
  return base58Encode(randomBytes(32))
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

export async function createPaymentIntent({
  userId,
  purchaseKind,
  itemId,
  currency,
  amountUsdc,
}: {
  userId: string
  purchaseKind: PaymentPurchaseKind
  itemId: string
  currency: PaymentCurrency
  amountUsdc: number
}) {
  if (!userId || !itemId || !isPositiveFiniteNumber(amountUsdc)) {
    throw new Error("A valid payment user, item, and amount are required.")
  }

  const solUsdPrice = currency === "SOL" ? await getSolUsdPrice() : null
  const amountSol = solUsdPrice ? usdToSolAmount(amountUsdc, solUsdPrice) : null
  const expiresAt = new Date(Date.now() + intentLifetimeSeconds * 1000)
  const intent: SignedPaymentIntent = {
    intentId: randomBytes(18).toString("base64url"),
    userId,
    purchaseKind,
    itemId,
    currency,
    amountUsdc,
    amountSol,
    solUsdPrice,
    reference: createPaymentReference(),
    expiresAt: expiresAt.toISOString(),
  }

  const token = await new SignJWT(intent)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setJti(intent.intentId)
    .setExpirationTime(`${intentLifetimeSeconds}s`)
    .sign(signingKey())

  return { ...intent, token }
}

export async function verifyPaymentIntent(token: string) {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, signingKey())
    const intentId = String(payload.intentId ?? payload.jti ?? "")
    const userId = String(payload.userId ?? "")
    const purchaseKind = String(payload.purchaseKind ?? "")
    const itemId = String(payload.itemId ?? "")
    const currency = String(payload.currency ?? "")
    const amountUsdc = Number(payload.amountUsdc)
    const amountSol = payload.amountSol === null || payload.amountSol === undefined ? null : Number(payload.amountSol)
    const solUsdPrice = payload.solUsdPrice === null || payload.solUsdPrice === undefined ? null : Number(payload.solUsdPrice)
    const reference = String(payload.reference ?? "")
    const expiresAt = String(payload.expiresAt ?? "")

    if (
      !intentId ||
      !userId ||
      !itemId ||
      (purchaseKind !== "subscription" && purchaseKind !== "credits") ||
      (currency !== "USDC" && currency !== "SOL") ||
      !isPositiveFiniteNumber(amountUsdc) ||
      !reference ||
      Number.isNaN(Date.parse(expiresAt)) ||
      Date.parse(expiresAt) <= Date.now()
    ) {
      return null
    }

    if (currency === "SOL") {
      if (!isPositiveFiniteNumber(amountSol) || !isPositiveFiniteNumber(solUsdPrice)) return null
    } else if (amountSol !== null || solUsdPrice !== null) {
      return null
    }

    return {
      intentId,
      userId,
      purchaseKind,
      itemId,
      currency,
      amountUsdc,
      amountSol,
      solUsdPrice,
      reference,
      expiresAt,
    } as SignedPaymentIntent
  } catch {
    return null
  }
}
