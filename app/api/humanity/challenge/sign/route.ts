import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"

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

  if (!verificationId || !walletAddress || !signedMessage || !signature) {
    return NextResponse.json({ error: "verificationId, walletAddress, signedMessage and signature are required" }, { status: 400 })
  }

  try {
    const rows = await db.$queryRaw<Array<{ id: string; walletAddress: string }>>`
      SELECT "id", "walletAddress"
      FROM "HumanityVerification"
      WHERE "id" = ${verificationId}
      LIMIT 1
    `
    const verification = rows[0]
    if (!verification) return NextResponse.json({ error: "Verification not found" }, { status: 404 })
    if (verification.walletAddress.toLowerCase() !== walletAddress) {
      return NextResponse.json({ error: "Wallet does not match verification" }, { status: 403 })
    }

    const signatureCaptured = signature.length >= 16 && !signature.includes("MOCK_SIGNATURE")
    const messageMatchesWallet = signedMessage.toLowerCase().includes(walletAddress.toLowerCase())
    const signatureVerified = signatureCaptured && messageMatchesWallet

    await db.$executeRaw`
      UPDATE "HumanityVerification"
      SET "signedMessage" = ${signedMessage},
          "signature" = ${signature},
          "signatureVerified" = ${signatureVerified},
          "updatedAt" = NOW()
      WHERE "id" = ${verificationId}
    `

    return NextResponse.json({
      ok: true,
      signatureCaptured,
      signatureVerified,
      verificationMode: "admin_sandbox_capture",
      note: "Admin sandbox captures wallet signatures and checks message binding. Full cryptographic verification can be enabled after wallet-library dependencies are approved.",
    })
  } catch (error) {
    console.error("Humanity signature capture failed", error)
    return NextResponse.json({ error: "Could not save Humanity signature" }, { status: 500 })
  }
}
