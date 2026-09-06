import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import { buildProofMessage, normalizeWalletAddress } from "@/lib/humanity/v2/core"
import { verifyHumanityWalletSignature } from "@/lib/humanity/v2/signature"

export const runtime = "nodejs"

const requestSchema = z.object({
  verificationId: z.string().trim().min(1).max(200),
  walletAddress: z.string().trim().min(10).max(200),
  walletChain: z.string().trim().min(1).max(32).optional(),
  signature: z.string().trim().min(16).max(2000),
})

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Humanity V2 signature request", issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const verification = await db.humanityVerification.findUnique({
      where: { id: parsed.data.verificationId },
      include: { session: true },
    })
    if (!verification) return NextResponse.json({ error: "Humanity V2 verification not found" }, { status: 404 })

    const effectiveChain = parsed.data.walletChain ?? verification.walletChain
    const submittedWallet = normalizeWalletAddress(parsed.data.walletAddress, effectiveChain)
    const storedWallet = normalizeWalletAddress(verification.walletAddress, verification.walletChain)
    if (submittedWallet !== storedWallet) {
      return NextResponse.json({ error: "Wallet does not match Humanity V2 verification" }, { status: 403 })
    }

    if (verification.proofExpiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Humanity V2 proof has expired" }, { status: 410 })
    }

    const proofMessage = buildProofMessage({
      campaignId: verification.campaignId,
      verificationId: verification.id,
      walletAddress: verification.walletAddress,
      walletChain: verification.walletChain,
      nonce: verification.session.nonce,
      decision: verification.decision,
      proofExpiresAt: verification.proofExpiresAt,
    })

    const signatureResult = await verifyHumanityWalletSignature({
      walletChain: effectiveChain,
      walletAddress: verification.walletAddress,
      message: proofMessage,
      signature: parsed.data.signature,
    })

    await db.humanityVerification.update({
      where: { id: verification.id },
      data: {
        signedMessage: proofMessage,
        signature: parsed.data.signature,
        signatureVerified: signatureResult.signatureVerified,
      },
    })

    return NextResponse.json({
      ok: signatureResult.signatureVerified,
      verificationId: verification.id,
      decision: verification.decision,
      signatureCaptured: signatureResult.signatureCaptured,
      signatureVerified: signatureResult.signatureVerified,
      verificationMethod: signatureResult.verificationMethod,
      walletChain: signatureResult.walletChain,
      proofMessage,
      error: signatureResult.error,
    })
  } catch (error) {
    console.error("Humanity V2 signature verification failed", error)
    return NextResponse.json({ error: "Could not verify Humanity V2 wallet signature" }, { status: 500 })
  }
}
