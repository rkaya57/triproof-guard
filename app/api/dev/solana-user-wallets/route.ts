import { NextResponse } from "next/server"

import { solanaRpc } from "@/lib/onchain/providers/helius"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SignatureInfo = {
  signature: string
  blockTime?: number | null
}

type ParsedInstruction = {
  program?: string
  programId?: string
  parsed?: {
    type?: string
    info?: Record<string, unknown>
  }
}

type ParsedTransaction = {
  transaction?: {
    message?: {
      accountKeys?: Array<string | { pubkey?: string; signer?: boolean; writable?: boolean }>
      instructions?: ParsedInstruction[]
    }
  }
}

type AccountInfo = {
  value?: {
    executable?: boolean
    owner?: string
  } | null
}

const systemProgramId = "11111111111111111111111111111111"
const tokenProgramId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const usdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
const wrappedSolMint = "So11111111111111111111111111111111111111112"
const jupiterProgram = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"

function accountKeyToString(accountKey: string | { pubkey?: string; signer?: boolean }) {
  return typeof accountKey === "string" ? accountKey : accountKey.pubkey ?? ""
}

function isSigner(accountKey: string | { pubkey?: string; signer?: boolean }) {
  return typeof accountKey !== "string" && Boolean(accountKey.signer)
}

async function getTransaction(signature: string) {
  try {
    return await solanaRpc<ParsedTransaction | null>("getTransaction", [
      signature,
      {
        encoding: "jsonParsed",
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      },
    ])
  } catch {
    return null
  }
}

async function isSystemUserWallet(address: string) {
  try {
    const info = await solanaRpc<AccountInfo>("getAccountInfo", [
      address,
      { encoding: "jsonParsed", commitment: "confirmed" },
    ])
    return Boolean(info.value && !info.value.executable && info.value.owner === systemProgramId)
  } catch {
    return false
  }
}

function csv(wallets: string[]) {
  return `wallet\n${wallets.join("\n")}\n`
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10)
  const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 50))
  const seedAccounts = [usdcMint, wrappedSolMint, jupiterProgram]
  const candidates = new Set<string>()

  for (const seed of seedAccounts) {
    if (candidates.size >= limit * 3) break
    const signatures = await solanaRpc<SignatureInfo[]>("getSignaturesForAddress", [
      seed,
      { limit: 40, commitment: "confirmed" },
    ])

    for (const item of signatures) {
      if (candidates.size >= limit * 3) break
      const transaction = await getTransaction(item.signature)
      const keys = transaction?.transaction?.message?.accountKeys ?? []
      keys.forEach((key) => {
        const address = accountKeyToString(key)
        if (address && isSigner(key) && address !== systemProgramId && address !== tokenProgramId) {
          candidates.add(address)
        }
      })
    }
  }

  const wallets: string[] = []
  for (const address of candidates) {
    if (wallets.length >= limit) break
    if (await isSystemUserWallet(address)) wallets.push(address)
  }

  if (!wallets.length) {
    return NextResponse.json(
      { error: "Could not collect user-like Solana wallets from the current RPC sample." },
      { status: 503 }
    )
  }

  return new NextResponse(csv(wallets), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="solana-user-wallets-${wallets.length}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
