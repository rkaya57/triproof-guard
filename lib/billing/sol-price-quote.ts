import { jwtVerify, SignJWT } from "jose"

import { getAccessPassSigningSecret } from "@/lib/env/validation"

const quoteLifetimeSeconds = 15 * 60
const priceCacheLifetimeMs = 60 * 1000
const lamportsPerSol = 1_000_000_000

let cachedPrice: { value: number; expiresAt: number } | null = null

export type SolPaymentQuote = {
  userId: string
  plan: string
  amountUsdc: number
  amountSol: number
  solUsdPrice: number
  expiresAt: string
}

function signingKey() {
  return new TextEncoder().encode(getAccessPassSigningSecret())
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

export function usdToSolAmount(amountUsdc: number, solUsdPrice: number) {
  if (!isPositiveFiniteNumber(amountUsdc) || !isPositiveFiniteNumber(solUsdPrice)) {
    throw new Error("A valid USDC amount and SOL price are required.")
  }

  // Round upward to one lamport so a valid quote can never undercharge the USD plan price.
  return Math.ceil((amountUsdc / solUsdPrice) * lamportsPerSol) / lamportsPerSol
}

export async function getSolUsdPrice() {
  if (cachedPrice && cachedPrice.expiresAt > Date.now()) return cachedPrice.value

  const endpoint = new URL("https://api.coingecko.com/api/v3/simple/price")
  endpoint.searchParams.set("ids", "solana")
  endpoint.searchParams.set("vs_currencies", "usd")

  const apiKey = process.env.COINGECKO_DEMO_API_KEY?.trim()
  const response = await fetch(endpoint, {
    headers: apiKey ? { "x-cg-demo-api-key": apiKey } : undefined,
    next: { revalidate: 60 },
  })

  if (!response.ok) {
    throw new Error("Live SOL pricing is temporarily unavailable. Please use USDC or try again shortly.")
  }

  const payload = (await response.json().catch(() => ({}))) as { solana?: { usd?: unknown } }
  const price = Number(payload.solana?.usd)

  if (!isPositiveFiniteNumber(price)) {
    throw new Error("Live SOL pricing returned an invalid value. Please use USDC or try again shortly.")
  }

  cachedPrice = { value: price, expiresAt: Date.now() + priceCacheLifetimeMs }
  return price
}

export async function createSolPaymentQuote({
  userId,
  plan,
  amountUsdc,
}: {
  userId: string
  plan: string
  amountUsdc: number
}) {
  const solUsdPrice = await getSolUsdPrice()
  const amountSol = usdToSolAmount(amountUsdc, solUsdPrice)
  const expiresAt = new Date(Date.now() + quoteLifetimeSeconds * 1000)
  const quote: SolPaymentQuote = {
    userId,
    plan,
    amountUsdc,
    amountSol,
    solUsdPrice,
    expiresAt: expiresAt.toISOString(),
  }

  const token = await new SignJWT(quote)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${quoteLifetimeSeconds}s`)
    .sign(signingKey())

  return { ...quote, token }
}

export async function verifySolPaymentQuote(token: string) {
  try {
    const { payload } = await jwtVerify(token, signingKey())
    const amountUsdc = Number(payload.amountUsdc)
    const amountSol = Number(payload.amountSol)
    const solUsdPrice = Number(payload.solUsdPrice)
    const expiresAt = String(payload.expiresAt ?? "")
    const userId = String(payload.userId ?? "")
    const plan = String(payload.plan ?? "")

    if (
      !userId ||
      !plan ||
      !isPositiveFiniteNumber(amountUsdc) ||
      !isPositiveFiniteNumber(amountSol) ||
      !isPositiveFiniteNumber(solUsdPrice) ||
      Number.isNaN(Date.parse(expiresAt))
    ) {
      return null
    }

    return { userId, plan, amountUsdc, amountSol, solUsdPrice, expiresAt } satisfies SolPaymentQuote
  } catch {
    return null
  }
}
