const SOLANA_WEB3_URL = "https://unpkg.com/@solana/web3.js@1.98.4/lib/index.iife.min.js"
const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com"
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

type WalletProvider = {
  publicKey?: { toString(): string }
  connect(): Promise<{ publicKey?: { toString(): string } } | void>
  signAndSendTransaction(transaction: TransactionInstance): Promise<{ signature?: string } | string>
  isPhantom?: boolean
  isSolflare?: boolean
}

type PublicKeyInstance = {
  toString(): string
  toBuffer(): Uint8Array
}

type TransactionInstructionInstance = unknown

type AccountMeta = {
  pubkey: PublicKeyInstance
  isSigner: boolean
  isWritable: boolean
}

type TransactionInstructionInput = {
  programId: PublicKeyInstance
  keys: AccountMeta[]
  data: Uint8Array
}

type TransactionInstance = {
  add(...instructions: TransactionInstructionInstance[]): TransactionInstance
  feePayer?: PublicKeyInstance
  recentBlockhash?: string
}

type ConnectionInstance = {
  getAccountInfo(publicKey: PublicKeyInstance, commitment: "confirmed"): Promise<unknown | null>
  getLatestBlockhash(commitment: "confirmed"): Promise<{ blockhash: string; lastValidBlockHeight: number }>
  confirmTransaction(
    strategy: { signature: string; blockhash: string; lastValidBlockHeight: number },
    commitment: "confirmed"
  ): Promise<{ value?: { err?: unknown } }>
  getSignatureStatuses(
    signatures: string[],
    config: { searchTransactionHistory: boolean }
  ): Promise<{
    value?: Array<{
      err?: unknown
      confirmationStatus?: "processed" | "confirmed" | "finalized" | null
    } | null>
  }>
  getTokenAccountBalance(publicKey: PublicKeyInstance, commitment: "confirmed"): Promise<{
    value?: { amount?: string }
  }>
}

type SolanaWeb3 = {
  PublicKey: {
    new (value: string): PublicKeyInstance
    findProgramAddressSync(seeds: Uint8Array[], programId: PublicKeyInstance): [PublicKeyInstance, number]
  }
  Transaction: new () => TransactionInstance
  TransactionInstruction: new (input: TransactionInstructionInput) => TransactionInstructionInstance
  Connection: new (endpoint: string, commitment: "confirmed") => ConnectionInstance
  SystemProgram: { programId: PublicKeyInstance }
}

type BrowserWindow = Window & {
  solana?: WalletProvider
  solflare?: WalletProvider
  phantom?: { solana?: WalletProvider }
  solanaWeb3?: SolanaWeb3
}

type WalletProviderSources = Pick<BrowserWindow, "solana" | "solflare" | "phantom">

function isWalletProvider(value: unknown): value is WalletProvider {
  if (!value || typeof value !== "object") return false
  const provider = value as Partial<WalletProvider>
  return (
    typeof provider.connect === "function" &&
    typeof provider.signAndSendTransaction === "function"
  )
}

export function findSolanaWalletProvider(sources: WalletProviderSources) {
  const candidates = [
    sources.solana,
    sources.phantom?.solana,
    sources.solflare,
  ].filter(isWalletProvider)
  const unique = Array.from(new Set(candidates))
  return unique.find((provider) => provider.publicKey) ?? unique[0] ?? null
}

export function solanaPayReferenceAccountMeta(pubkey: PublicKeyInstance): AccountMeta {
  return { pubkey, isSigner: false, isWritable: false }
}

export function paymentMemoAccountMetas(): AccountMeta[] {
  // SPL Memo requires every account supplied to the memo instruction to be a
  // signer. The checkout reference belongs on the payment transfer instruction
  // as a read-only non-signer, not on the memo instruction.
  return []
}

async function waitForWalletProvider(timeoutMs = 3_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const provider = findSolanaWalletProvider(window as BrowserWindow)
    if (provider) return provider
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return findSolanaWalletProvider(window as BrowserWindow)
}

function isBlockHeightExpiredError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "")
  const normalized = message.toLowerCase()
  return (
    normalized.includes("block height exceeded") ||
    normalized.includes("blockhash not found") ||
    normalized.includes("transactionexpiredblockheightexceeded")
  )
}

async function confirmSubmittedTransaction(
  connection: ConnectionInstance,
  signature: string,
  latest: { blockhash: string; lastValidBlockHeight: number }
) {
  try {
    const confirmation = await connection.confirmTransaction(
      { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
      "confirmed"
    )
    if (confirmation.value?.err) {
      throw new Error(`Solana rejected the transaction: ${JSON.stringify(confirmation.value.err)}`)
    }
  } catch (error) {
    const status = await connection
      .getSignatureStatuses([signature], { searchTransactionHistory: true })
      .then((response) => response.value?.[0] ?? null)
      .catch(() => null)

    if (
      status &&
      !status.err &&
      (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")
    ) {
      return
    }
    if (status?.err) {
      throw new Error(`Solana rejected the transaction: ${JSON.stringify(status.err)}`)
    }
    if (isBlockHeightExpiredError(error)) {
      throw new Error(
        "The wallet approval expired before the payment reached Solana. No payment was recorded. Click Pay again and approve the new request promptly."
      )
    }
    throw error
  }
}

async function loadSolanaWeb3() {
  const browserWindow = window as BrowserWindow
  if (browserWindow.solanaWeb3) return browserWindow.solanaWeb3

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SOLANA_WEB3_URL}"]`)
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("Solana web3 could not be loaded.")), { once: true })
      return
    }

    const script = document.createElement("script")
    script.src = SOLANA_WEB3_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Solana web3 could not be loaded."))
    document.head.appendChild(script)
  })

  if (!browserWindow.solanaWeb3) {
    throw new Error("Solana web3 is not available in this browser.")
  }

  return browserWindow.solanaWeb3
}

function amountToUsdcUnits(amount: string) {
  const value = Number(amount)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Invalid USDC amount.")
  }
  return BigInt(Math.round(value * 1_000_000))
}

function transferCheckedData(amount: bigint) {
  const data = new Uint8Array(10)
  data[0] = 12
  const view = new DataView(data.buffer)
  view.setBigUint64(1, amount, true)
  data[9] = 6
  return data
}

function nativeTransferData(amountLamports: bigint) {
  const data = new Uint8Array(12)
  const view = new DataView(data.buffer)
  view.setUint32(0, 2, true)
  view.setBigUint64(4, amountLamports, true)
  return data
}

function associatedTokenAddress(
  web3: SolanaWeb3,
  mint: PublicKeyInstance,
  owner: PublicKeyInstance,
  tokenProgramId: PublicKeyInstance,
  associatedProgramId: PublicKeyInstance
) {
  return web3.PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
    associatedProgramId
  )[0]
}

function createAssociatedTokenAccountInstruction(
  web3: SolanaWeb3,
  payer: PublicKeyInstance,
  ata: PublicKeyInstance,
  owner: PublicKeyInstance,
  mint: PublicKeyInstance,
  tokenProgramId: PublicKeyInstance,
  associatedProgramId: PublicKeyInstance
) {
  return new web3.TransactionInstruction({
    programId: associatedProgramId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    ],
    data: new Uint8Array(),
  })
}

function createTransferCheckedInstruction(
  web3: SolanaWeb3,
  source: PublicKeyInstance,
  mint: PublicKeyInstance,
  destination: PublicKeyInstance,
  owner: PublicKeyInstance,
  amount: bigint,
  tokenProgramId: PublicKeyInstance,
  reference: PublicKeyInstance
) {
  return new web3.TransactionInstruction({
    programId: tokenProgramId,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
      solanaPayReferenceAccountMeta(reference),
    ],
    data: transferCheckedData(amount),
  })
}

function createNativeTransferInstruction(
  web3: SolanaWeb3,
  source: PublicKeyInstance,
  destination: PublicKeyInstance,
  amountLamports: bigint,
  reference: PublicKeyInstance
) {
  return new web3.TransactionInstruction({
    programId: web3.SystemProgram.programId,
    keys: [
      { pubkey: source, isSigner: true, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      solanaPayReferenceAccountMeta(reference),
    ],
    data: nativeTransferData(amountLamports),
  })
}

async function sendSolanaPayment({
  treasuryAddress,
  reference,
  memo,
  rpcUrl,
  buildPaymentInstruction,
}: {
  treasuryAddress: string
  reference: string
  memo: string
  rpcUrl?: string
  buildPaymentInstruction: (input: {
    web3: SolanaWeb3
    owner: PublicKeyInstance
    treasury: PublicKeyInstance
    referenceKey: PublicKeyInstance
    connection: ConnectionInstance
  }) => Promise<TransactionInstructionInstance[]>
}) {
  const wallet = await waitForWalletProvider()
  if (!wallet) {
    const frameHint = window.self !== window.top ? " Open the checkout in a normal browser tab." : ""
    throw new Error(
      `Phantom or Solflare was not detected. Enable the wallet extension for this HTTPS site, unlock it, reload the page, and try again.${frameHint}`
    )
  }

  const web3 = await loadSolanaWeb3()
  const connection = new web3.Connection(rpcUrl ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? DEFAULT_RPC_URL, "confirmed")
  const connected = await wallet.connect()
  const publicKey = connected?.publicKey ?? wallet.publicKey

  if (!publicKey) throw new Error("Wallet connection failed.")

  const owner = new web3.PublicKey(publicKey.toString())
  const treasury = new web3.PublicKey(treasuryAddress)
  const referenceKey = new web3.PublicKey(reference)
  const memoProgramId = new web3.PublicKey(MEMO_PROGRAM_ID)
  const transaction = new web3.Transaction()

  transaction.add(...(await buildPaymentInstruction({ web3, owner, treasury, referenceKey, connection })))
  transaction.add(
    new web3.TransactionInstruction({
      programId: memoProgramId,
      keys: paymentMemoAccountMetas(),
      data: new TextEncoder().encode(memo),
    })
  )

  const latest = await connection.getLatestBlockhash("confirmed")
  transaction.feePayer = owner
  transaction.recentBlockhash = latest.blockhash

  let result: { signature?: string } | string
  try {
    result = await wallet.signAndSendTransaction(transaction)
  } catch (error) {
    if (isBlockHeightExpiredError(error)) {
      throw new Error(
        "The wallet approval expired before submission. Reload the checkout and approve the new payment request promptly."
      )
    }
    throw error
  }
  const signature = typeof result === "string" ? result : result.signature
  if (!signature) throw new Error("Wallet did not return a transaction signature.")

  await confirmSubmittedTransaction(connection, signature, latest)

  return { signature }
}

export async function paySolanaUsdcWithWallet({
  treasuryAddress,
  amountUsdc,
  reference,
}: {
  treasuryAddress: string
  amountUsdc: string
  reference: string
}) {
  return sendSolanaPayment({
    treasuryAddress,
    reference,
    memo: "Tri-Proof Solana USDC checkout",
    buildPaymentInstruction: async ({ web3, owner, treasury, referenceKey, connection }) => {
      const mint = new web3.PublicKey(USDC_MINT)
      const tokenProgramId = new web3.PublicKey(TOKEN_PROGRAM_ID)
      const associatedProgramId = new web3.PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID)
      const sourceAta = associatedTokenAddress(web3, mint, owner, tokenProgramId, associatedProgramId)
      const destinationAta = associatedTokenAddress(web3, mint, treasury, tokenProgramId, associatedProgramId)
      const instructions: TransactionInstructionInstance[] = []

      if (!(await connection.getAccountInfo(destinationAta, "confirmed"))) {
        instructions.push(
          createAssociatedTokenAccountInstruction(web3, owner, destinationAta, treasury, mint, tokenProgramId, associatedProgramId)
        )
      }

      instructions.push(
        createTransferCheckedInstruction(
          web3,
          sourceAta,
          mint,
          destinationAta,
          owner,
          amountToUsdcUnits(amountUsdc),
          tokenProgramId,
          referenceKey
        )
      )
      return instructions
    },
  })
}

export async function paySolanaSolWithWallet({
  treasuryAddress,
  amountSol,
  reference,
}: {
  treasuryAddress: string
  amountSol: number
  reference: string
}) {
  if (!Number.isFinite(amountSol) || amountSol <= 0) throw new Error("Invalid SOL amount.")

  const amountLamports = BigInt(Math.ceil(amountSol * 1_000_000_000))
  return sendSolanaPayment({
    treasuryAddress,
    reference,
    memo: "Tri-Proof Solana SOL checkout",
    buildPaymentInstruction: async ({ web3, owner, treasury, referenceKey }) => [
      createNativeTransferInstruction(web3, owner, treasury, amountLamports, referenceKey),
    ],
  })
}

export async function connectSolanaWallet() {
  const wallet = await waitForWalletProvider()
  if (!wallet) {
    throw new Error("Phantom or Solflare was not detected. Unlock the extension and reload this page.")
  }
  const connected = await wallet.connect()
  const publicKey = connected?.publicKey ?? wallet.publicKey
  if (!publicKey) throw new Error("Wallet connection failed.")
  return publicKey.toString()
}

export async function getSplTokenAccountForWallet({
  mintAddress,
}: {
  mintAddress: string
}) {
  const web3 = await loadSolanaWeb3()
  const walletAddress = await connectSolanaWallet()
  const owner = new web3.PublicKey(walletAddress)
  const mint = new web3.PublicKey(mintAddress)
  const tokenProgramId = new web3.PublicKey(TOKEN_PROGRAM_ID)
  const associatedProgramId = new web3.PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID)
  const tokenAccount = associatedTokenAddress(web3, mint, owner, tokenProgramId, associatedProgramId)

  return { walletAddress: owner.toString(), tokenAccount: tokenAccount.toString() }
}

export async function ensureSplTokenAccountWithWallet({
  mintAddress,
  rpcUrl,
}: {
  mintAddress: string
  rpcUrl: string
}) {
  const wallet = await waitForWalletProvider()
  if (!wallet) throw new Error("Phantom or Solflare was not detected.")
  const web3 = await loadSolanaWeb3()
  const connected = await wallet.connect()
  const publicKey = connected?.publicKey ?? wallet.publicKey
  if (!publicKey) throw new Error("Wallet connection failed.")

  const owner = new web3.PublicKey(publicKey.toString())
  const mint = new web3.PublicKey(mintAddress)
  const tokenProgramId = new web3.PublicKey(TOKEN_PROGRAM_ID)
  const associatedProgramId = new web3.PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID)
  const ata = associatedTokenAddress(web3, mint, owner, tokenProgramId, associatedProgramId)
  const connection = new web3.Connection(rpcUrl, "confirmed")

  if (!(await connection.getAccountInfo(ata, "confirmed"))) {
    const transaction = new web3.Transaction().add(
      createAssociatedTokenAccountInstruction(web3, owner, ata, owner, mint, tokenProgramId, associatedProgramId)
    )
    const latest = await connection.getLatestBlockhash("confirmed")
    transaction.feePayer = owner
    transaction.recentBlockhash = latest.blockhash
    const submitted = await wallet.signAndSendTransaction(transaction)
    const signature = typeof submitted === "string" ? submitted : submitted.signature
    if (!signature) throw new Error("Wallet did not return an account-creation signature.")
    await confirmSubmittedTransaction(connection, signature, latest)
  }

  return { walletAddress: owner.toString(), tokenAccount: ata.toString() }
}

export async function transferSplTokenWithWallet({
  mintAddress,
  destinationTokenAccount,
  amountUnits,
  rpcUrl,
  memo = "Tri-Proof Devnet staking",
}: {
  mintAddress: string
  destinationTokenAccount: string
  amountUnits: string
  rpcUrl: string
  memo?: string
}) {
  if (!/^\d+$/.test(amountUnits) || BigInt(amountUnits) <= 0n) {
    throw new Error("Invalid token amount.")
  }

  const reference = await connectSolanaWallet()
  return sendSolanaPayment({
    treasuryAddress: destinationTokenAccount,
    reference,
    memo,
    rpcUrl,
    buildPaymentInstruction: async ({ web3, owner, treasury, referenceKey }) => {
      const mint = new web3.PublicKey(mintAddress)
      const tokenProgramId = new web3.PublicKey(TOKEN_PROGRAM_ID)
      const associatedProgramId = new web3.PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID)
      const sourceAta = associatedTokenAddress(web3, mint, owner, tokenProgramId, associatedProgramId)
      return [
        createTransferCheckedInstruction(
          web3,
          sourceAta,
          mint,
          treasury,
          owner,
          BigInt(amountUnits),
          tokenProgramId,
          referenceKey
        ),
      ]
    },
  })
}
