import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import { verifyWalletSignature } from "@/lib/humanity/signature-verify"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const body = (await request.json().catch(() => null)) as {
    verificationId?: string
    walletAddress?: string
    walletChain?: string
    signedMessage?: string
    signature?: string
  } | null

  const verificationId = body?.verificationId?.trim()
  const walletAddress = body?.walletAddress?.trim().toLowerCase()
  const signedMessage = body?.signedMessage?.trim()
  const signature = body?.signature?.trim()
  const walletChain = body?.walletChain?.trim().toLowerCase()

  if (!verificationId || !walletAddress || !signedMessage || !signature) {
    return NextResponse.json({ error: "verificationId, walletAddress, signedMessage and signature are required" }, { status: 400 })
  }

  try {
    const rows = await db.$queryRaw<Array<{ id: string; walletAddress: string; walletChain: string | null }>>`
      SELECT "id", "walletAddress", "walletChain"
      FROM "HumanityVerification"
      WHERE "id" = ${verificationId}
      LIMIT 1
    `
    const verification = rows[0]
    if (!verification) return NextResponse.json({ error: "Verification not found" }, { status: 404 })
    if (verification.walletAddress.toLowerCase() !== walletAddress) {
      return NextResponse.json({ error: "Wallet does not match verification" }, { status: 403 })
    }

    const verificationResult = await verifyWalletSignature({
      walletChain: walletChain || verification.walletChain,
      walletAddress,
      message: signedMessage,
      signature,
    })

    await db.$executeRaw`
      UPDATE "HumanityVerification"
      SET "signedMessage" = ${signedMessage},
          "signature" = ${signature},
          "signatureVerified" = ${verificationResult.signatureVerified},
          "updatedAt" = NOW()
      WHERE "id" = ${verificationId}
    `

    return NextResponse.json({
      ok: true,
      signatureCaptured: verificationResult.signatureCaptured,
      signatureVerified: verificationResult.signatureVerified,
      verificationMethod: verificationResult.verificationMethod,
      walletChain: verificationResult.walletChain,
      error: verificationResult.error,
    })
  } catch (error) {
    console.error("Humanity signature verification failed", error)
    return NextResponse.json({ error: "Could not verify Humanity signature" }, { status: 500 })
  }
}
