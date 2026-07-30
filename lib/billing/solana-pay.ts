import { solanaRpc, validateSolanaAddress } from "@/lib/onchain/providers/helius"

const usdcDecimals = BigInt(1_000_000)
const defaultSolanaUsdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
const solanaSignatureRegex = /^[1-9A-HJ-NP-Za-km-z]{64,96}$/

type TokenAccount = {
  pubkey?: string
}

type SignatureInfo = {
  signature: string
}

type ParsedInstruction = {
  program?: string
  parsed?: {
    type?: string
    info?: Record<string, unknown>
  }
}

type ParsedInnerInstructionGroup = {
  instructions?: ParsedInstruction[]
}

type ParsedSolanaTransaction = {
  slot?: number
  meta?: {
    err?: unknown
    innerInstructions?: ParsedInnerInstructionGroup[]
  } | null
  transaction?: {
    message?: {
      instructions?: ParsedInstruction[]
    }
  }
}

export type SolanaPaymentNetwork = {
  label: string
  treasury?: string
  usdcMint?: string
}

function tokenAmountToUnits(value: unknown) {
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value)
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value))
  return BigInt(0)
}

function instructionAmountUnits(instruction: ParsedInstruction) {
  const info = instruction.parsed?.info ?? {}
  const tokenAmount = info.tokenAmount as { amount?: unknown } | undefined
  return tokenAmountToUnits(tokenAmount?.amount ?? info.amount)
}

function isMatchingUsdcTransfer(
  instruction: ParsedInstruction,
  treasuryTokenAccounts: Set<string>,
  usdcMint: string,
  expectedUnits: bigint
) {
  const info = instruction.parsed?.info ?? {}
  const type = instruction.parsed?.type
  const destination = String(info.destination ?? "")
  const mint = String(info.mint ?? usdcMint)

  if (instruction.program !== "spl-token") return false
  if (type !== "transfer" && type !== "transferChecked") return false
  if (!treasuryTokenAccounts.has(destination)) return false
  if (mint !== usdcMint) return false

  return instructionAmountUnits(instruction) >= expectedUnits
}

function isMatchingNativeSolTransfer(
  instruction: ParsedInstruction,
  treasury: string,
  expectedLamports: bigint
) {
  const info = instruction.parsed?.info ?? {}
  if (instruction.program !== "system" || instruction.parsed?.type !== "transfer") return false
  if (String(info.destination ?? "") !== treasury) return false
  return tokenAmountToUnits(info.lamports) >= expectedLamports
}

function flattenInstructions(transaction: ParsedSolanaTransaction) {
  const direct = transaction.transaction?.message?.instructions ?? []
  const inner = (transaction.meta?.innerInstructions ?? []).flatMap((group) => group.instructions ?? [])
  return [...direct, ...inner]
}

export function buildSolanaPayUrl({
  recipient,
  amountUsdc,
  reference,
  label = "Tri-Proof Protocol",
  message = "Tri-Proof 30-day access pass",
}: {
  recipient: string
  amountUsdc: number
  reference?: string
  label?: string
  message?: string
}) {
  const params = new URLSearchParams()
  params.set("amount", String(amountUsdc))
  params.set("spl-token", process.env.SOLANA_USDC_MINT ?? defaultSolanaUsdcMint)
  params.set("label", label)
  params.set("message", message)

  if (reference) params.set("reference", reference)

  return `solana:${recipient}?${params.toString()}`
}

export async function verifySolanaUsdcTransfer({
  txHash,
  network,
  expectedAmountUsdc,
}: {
  txHash: string
  network: SolanaPaymentNetwork
  expectedAmountUsdc: number
}) {
  const treasury = network.treasury?.trim()
  const usdcMint = network.usdcMint?.trim() || process.env.SOLANA_USDC_MINT || defaultSolanaUsdcMint

  if (!treasury || !validateSolanaAddress(treasury)) {
    return { ok: false as const, error: "Solana treasury wallet is not configured correctly." }
  }

  if (!validateSolanaAddress(usdcMint)) {
    return { ok: false as const, error: "Solana USDC mint is not configured correctly." }
  }

  if (!solanaSignatureRegex.test(txHash)) {
    return { ok: false as const, error: "Invalid Solana transaction signature." }
  }

  const tokenAccounts = await solanaRpc<{ value?: TokenAccount[] }>("getTokenAccountsByOwner", [
    treasury,
    { mint: usdcMint },
    { encoding: "jsonParsed", commitment: "confirmed" },
  ])

  const treasuryTokenAccounts = new Set(
    (tokenAccounts.value ?? []).map((account) => account.pubkey).filter(Boolean) as string[]
  )

  if (!treasuryTokenAccounts.size) {
    return {
      ok: false as const,
      error: "No Solana USDC token account was found for the treasury wallet.",
    }
  }

  const transaction = await solanaRpc<ParsedSolanaTransaction | null>("getTransaction", [
    txHash,
    {
      encoding: "jsonParsed",
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    },
  ])

  if (!transaction) {
    return { ok: false as const, error: "Solana transaction was not found yet." }
  }

  if (transaction.meta?.err) {
    return { ok: false as const, error: "Solana transaction is not successful." }
  }

  const expectedUnits = BigInt(expectedAmountUsdc) * usdcDecimals
  const matchingTransfer = flattenInstructions(transaction).find((instruction) =>
    isMatchingUsdcTransfer(instruction, treasuryTokenAccounts, usdcMint, expectedUnits)
  )

  if (!matchingTransfer) {
    return {
      ok: false as const,
      error: "No matching Solana USDC transfer to the treasury wallet was found in this transaction.",
    }
  }

  const latestSlot = await solanaRpc<number>("getSlot", [{ commitment: "confirmed" }])
  const confirmations = transaction.slot && latestSlot >= transaction.slot ? latestSlot - transaction.slot + 1 : 0
  const requiredConfirmations = Number.parseInt(process.env.PAYMENT_CONFIRMATIONS ?? "1", 10)

  if (confirmations < requiredConfirmations) {
    return {
      ok: false as const,
      error: `Waiting for confirmations. Current: ${confirmations}, required: ${requiredConfirmations}.`,
    }
  }

  return {
    ok: true as const,
    txHash,
    receivedAmountUsdc: Number(instructionAmountUnits(matchingTransfer)) / Number(usdcDecimals),
    confirmations,
  }
}

export async function verifySolanaNativeSolTransfer({
  txHash,
  network,
  expectedAmountSol,
}: {
  txHash: string
  network: SolanaPaymentNetwork
  expectedAmountSol: number
}) {
  const treasury = network.treasury?.trim()
  if (!treasury || !validateSolanaAddress(treasury)) {
    return { ok: false as const, error: "Solana treasury wallet is not configured correctly." }
  }
  if (!solanaSignatureRegex.test(txHash)) {
    return { ok: false as const, error: "Invalid Solana transaction signature." }
  }

  const transaction = await solanaRpc<ParsedSolanaTransaction | null>("getTransaction", [
    txHash,
    { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
  ])
  if (!transaction) return { ok: false as const, error: "Solana transaction was not found yet." }
  if (transaction.meta?.err) return { ok: false as const, error: "Solana transaction is not successful." }

  const expectedLamports = BigInt(Math.ceil(expectedAmountSol * 1_000_000_000))
  const matchingTransfer = flattenInstructions(transaction).find((instruction) =>
    isMatchingNativeSolTransfer(instruction, treasury, expectedLamports)
  )
  if (!matchingTransfer) {
    return { ok: false as const, error: "No matching SOL transfer to the treasury wallet was found in this transaction." }
  }

  const latestSlot = await solanaRpc<number>("getSlot", [{ commitment: "confirmed" }])
  const confirmations = transaction.slot && latestSlot >= transaction.slot ? latestSlot - transaction.slot + 1 : 0
  const requiredConfirmations = Number.parseInt(process.env.PAYMENT_CONFIRMATIONS ?? "1", 10)
  if (confirmations < requiredConfirmations) {
    return { ok: false as const, error: `Waiting for confirmations. Current: ${confirmations}, required: ${requiredConfirmations}.` }
  }

  return {
    ok: true as const,
    txHash,
    receivedAmountSol: Number(tokenAmountToUnits(matchingTransfer.parsed?.info?.lamports)) / 1_000_000_000,
    confirmations,
  }
}

export async function verifySolanaUsdcTransferByReference({
  reference,
  network,
  expectedAmountUsdc,
}: {
  reference: string
  network: SolanaPaymentNetwork
  expectedAmountUsdc: number
}) {
  if (!validateSolanaAddress(reference)) {
    return { ok: false as const, error: "Invalid Solana payment reference." }
  }

  const signatures = await solanaRpc<SignatureInfo[]>("getSignaturesForAddress", [
    reference,
    { limit: 10, commitment: "confirmed" },
  ])

  if (!signatures.length) {
    return { ok: false as const, pending: true, error: "Payment not found yet." }
  }

  for (const item of signatures) {
    const verification = await verifySolanaUsdcTransfer({
      txHash: item.signature,
      network,
      expectedAmountUsdc,
    })

    if (verification.ok) {
      return verification
    }
  }

  return {
    ok: false as const,
    pending: true,
    error: "Payment was not found yet for this Solana Pay reference.",
  }
}
