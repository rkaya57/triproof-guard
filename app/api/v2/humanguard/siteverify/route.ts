import { NextResponse } from "next/server"
import { z } from "zod"

import { getApiUser } from "@/lib/api/auth"
import { db } from "@/lib/db/prisma"
import { getHumanGuardProofSecret } from "@/lib/env/validation"
import { normalizeHumanGuardOrigin, normalizeHumanGuardWallet } from "@/lib/humanguard/core"
import { verifyHumanGuardProofToken } from "@/lib/humanguard/proof"

export const runtime = "nodejs"

const requestSchema = z.object({
  token: z.string().trim().min(64).max(16_000),
  action: z.string().trim().min(1).max(80).optional(),
  wallet: z.string().trim().min(3).max(200).optional(),
  walletChain: z.string().trim().min(1).max(32).optional(),
  origin: z.string().trim().min(1).max(300).optional(),
})

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}

export async function POST(request: Request) {
  const auth = await getApiUser(request)
  if (auth.error) return auth.error

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return noStore({ error: "Invalid HumanGuard siteverify request", issues: parsed.error.issues }, 400)
  }

  let claims: Awaited<ReturnType<typeof verifyHumanGuardProofToken>>
  try {
    claims = await verifyHumanGuardProofToken(parsed.data.token, getHumanGuardProofSecret())
  } catch (error) {
    return noStore({
      success: false,
      error: "HumanGuard proof token is invalid",
      reason: error instanceof Error ? error.message : "Invalid proof token",
    }, 400)
  }

  const site = await db.humanGuardSite.findUnique({ where: { id: claims.siteId } })
  if (!site || !site.enabled || site.ownerUserId !== auth.user.id) {
    return noStore({ success: false, error: "HumanGuard site not found for this API account" }, 403)
  }

  const proof = await db.humanGuardProof.findUnique({ where: { tokenId: claims.tokenId } })
  if (!proof || proof.siteId !== site.id || proof.sessionId !== claims.sessionId) {
    return noStore({ success: false, error: "HumanGuard proof record not found" }, 404)
  }
  if (proof.consumedAt) {
    return noStore({
      success: false,
      error: "HumanGuard proof has already been consumed",
      reasonCodes: ["HUMANGUARD_REPLAY_REJECTED"],
    }, 409)
  }
  if (proof.expiresAt.getTime() <= Date.now() || (claims.expiresAt && claims.expiresAt.getTime() <= Date.now())) {
    return noStore({
      success: false,
      error: "HumanGuard proof has expired",
      reasonCodes: ["HUMANGUARD_PROOF_EXPIRED"],
    }, 410)
  }

  if (parsed.data.action && parsed.data.action !== proof.action) {
    return noStore({ success: false, error: "HumanGuard action mismatch" }, 403)
  }

  const expectedWallet = normalizeHumanGuardWallet(parsed.data.wallet)
  if (expectedWallet && expectedWallet !== normalizeHumanGuardWallet(proof.walletAddress)) {
    return noStore({ success: false, error: "HumanGuard wallet mismatch" }, 403)
  }

  if (parsed.data.walletChain && parsed.data.walletChain.toLowerCase() !== (proof.walletChain ?? "").toLowerCase()) {
    return noStore({ success: false, error: "HumanGuard wallet chain mismatch" }, 403)
  }

  if (parsed.data.origin) {
    let expectedOrigin: string
    try {
      expectedOrigin = normalizeHumanGuardOrigin(parsed.data.origin)
    } catch {
      return noStore({ success: false, error: "Invalid expected HumanGuard origin" }, 400)
    }
    if (expectedOrigin !== proof.origin) {
      return noStore({ success: false, error: "HumanGuard origin mismatch" }, 403)
    }
  }

  if (
    claims.action !== proof.action ||
    claims.origin !== proof.origin ||
    normalizeHumanGuardWallet(claims.walletAddress) !== normalizeHumanGuardWallet(proof.walletAddress) ||
    (claims.walletChain ?? "").toLowerCase() !== (proof.walletChain ?? "").toLowerCase()
  ) {
    return noStore({ success: false, error: "HumanGuard proof claims do not match stored evidence" }, 403)
  }

  const consumed = await db.humanGuardProof.updateMany({
    where: {
      id: proof.id,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  })
  if (consumed.count !== 1) {
    return noStore({
      success: false,
      error: "HumanGuard proof could not be consumed",
      reasonCodes: ["HUMANGUARD_REPLAY_REJECTED"],
    }, 409)
  }

  return noStore({
    success: true,
    object: "humanguard_verification",
    siteId: site.id,
    action: proof.action,
    origin: proof.origin,
    wallet: proof.walletAddress,
    walletChain: proof.walletChain,
    humanScore: proof.humanScore,
    challengeType: proof.challengeType,
    verifiedAt: new Date().toISOString(),
  })
}
