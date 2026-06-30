const defaultSolanaUsdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

export function getSolanaRpcUrl() {
  const explicit = process.env.SOLANA_RPC_URL?.trim()
  if (explicit) return explicit

  const apiKey = process.env.HELIUS_API_KEY?.trim()
  if (apiKey) return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`

  return null
}

export function getSolanaUsdcMint() {
  return process.env.SOLANA_USDC_MINT?.trim() || defaultSolanaUsdcMint
}

type RpcResponse<T> = {
  result?: T
  error?: { message?: string }
}

type TokenBalance = {
  mint?: string
  owner?: string
  uiTokenAmount?: {
    amount?: string
    decimals?: number
  }
}

type ParsedSolanaTransaction = {
  slot?: number
  blockTime?: number | null
  meta?: {
    err?: unknown
    preTokenBalances?: TokenBalance[]
    postTokenBalances?: TokenBalance[]
  } | null
}

async function solanaRpc<T>(method: string, params: unknown[]): Promise<T> {
  const rpcUrl = getSolanaRpcUrl()
  if (!rpcUrl) {
    throw new Error("SOLANA_RPC_URL or HELIUS_API_KEY is not configured")
  }

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    }),
    cache: "no-store",
  })

  const payload = (await response.json()) as RpcResponse<T>
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? `Solana RPC ${method} failed`)
  }

  return payload.result as T
}

function tokenAmountUnits(balance: TokenBalance | undefined) {
  if (!balance?.uiTokenAmount?.amount) return BigInt(0)
  try {
    return BigInt(balance.uiTokenAmount.amount)
  } catch {
    return BigInt(0)
  }
}

function findOwnerBalance(balances: TokenBalance[] | undefined, owner: string, mint: string) {
  return (balances ?? []).find(
    (balance) => balance.owner === owner && balance.mint === mint
  )
}

export async function verifySolanaUsdcPayment({
  signature,
  treasury,
  expectedAmountUsdc,
}: {
  signature: string
  treasury: string
  expectedAmountUsdc: number
}) {
  const transaction = await solanaRpc<ParsedSolanaTransaction | null>("getTransaction", [
    signature,
    {
      encoding: "jsonParsed",
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    },
  ])

  if (!transaction) {
    return { ok: false as const, error: "Transaction was not found yet." }
  }

  if (transaction.meta?.err) {
    return { ok: false as const, error: "Transaction is not successful." }
  }

  const mint = getSolanaUsdcMint()
  const pre = tokenAmountUnits(findOwnerBalance(transaction.meta?.preTokenBalances, treasury, mint))
  const post = tokenAmountUnits(findOwnerBalance(transaction.meta?.postTokenBalances, treasury, mint))
  const receivedUnits = post - pre
  const expectedUnits = BigInt(expectedAmountUsdc) * BigInt(1_000_000)

  if (receivedUnits < expectedUnits) {
    return {
      ok: false as const,
      error: "No matching Solana USDC transfer to the treasury wallet was found in this transaction.",
    }
  }

  const latestSlot = await solanaRpc<number>("getSlot", [{ commitment: "confirmed" }])
  const txSlot = Number(transaction.slot ?? 0)
  const confirmations = txSlot > 0 && latestSlot >= txSlot ? latestSlot - txSlot + 1 : 1
  const requiredConfirmations = Number.parseInt(process.env.PAYMENT_CONFIRMATIONS ?? "1", 10)

  if (confirmations < requiredConfirmations) {
    return {
      ok: false as const,
      error: `Waiting for confirmations. Current: ${confirmations}, required: ${requiredConfirmations}.`,
    }
  }

  return {
    ok: true as const,
    receivedAmountUsdc: Number(receivedUnits) / 1_000_000,
    confirmations,
  }
}
