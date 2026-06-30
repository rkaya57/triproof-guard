const SOLANA_WEB3_URL = "https://unpkg.com/@solana/web3.js@1.98.4/lib/index.iife.min.js"
const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com"
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

type WalletProvider = {
  publicKey?: { toString(): string }
  connect(): Promise<{ publicKey?: { toString(): string } } | void>
  signAndSendTransaction(transaction: unknown): Promise<{ signature?: string } | string>
}

type BrowserWindow = Window & {
  solana?: WalletProvider
  solflare?: WalletProvider
  solanaWeb3?: any
}

function getWallet() {
  const browserWindow = window as BrowserWindow
  return browserWindow.solana ?? browserWindow.solflare ?? null
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

function associatedTokenAddress(web3: any, mint: any, owner: any, tokenProgramId: any, associatedProgramId: any) {
  return web3.PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
    associatedProgramId
  )[0]
}

function createAssociatedTokenAccountInstruction(web3: any, payer: any, ata: any, owner: any, mint: any, tokenProgramId: any, associatedProgramId: any) {
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

function createTransferCheckedInstruction(web3: any, source: any, mint: any, destination: any, owner: any, amount: bigint, tokenProgramId: any) {
  return new web3.TransactionInstruction({
    programId: tokenProgramId,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: transferCheckedData(amount),
  })
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
  const wallet = getWallet()
  if (!wallet) {
    throw new Error("Phantom or Solflare extension was not found. Install/open a Solana wallet and try again.")
  }

  const web3 = await loadSolanaWeb3()
  const connection = new web3.Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? DEFAULT_RPC_URL, "confirmed")
  const connected = await wallet.connect()
  const publicKey = connected?.publicKey ?? wallet.publicKey

  if (!publicKey) {
    throw new Error("Wallet connection failed.")
  }

  const owner = new web3.PublicKey(publicKey.toString())
  const treasury = new web3.PublicKey(treasuryAddress)
  const mint = new web3.PublicKey(USDC_MINT)
  const referenceKey = new web3.PublicKey(reference)
  const tokenProgramId = new web3.PublicKey(TOKEN_PROGRAM_ID)
  const associatedProgramId = new web3.PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID)
  const memoProgramId = new web3.PublicKey(MEMO_PROGRAM_ID)
  const sourceAta = associatedTokenAddress(web3, mint, owner, tokenProgramId, associatedProgramId)
  const destinationAta = associatedTokenAddress(web3, mint, treasury, tokenProgramId, associatedProgramId)
  const amount = amountToUsdcUnits(amountUsdc)
  const transaction = new web3.Transaction()

  const destinationAccount = await connection.getAccountInfo(destinationAta, "confirmed")
  if (!destinationAccount) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        web3,
        owner,
        destinationAta,
        treasury,
        mint,
        tokenProgramId,
        associatedProgramId
      )
    )
  }

  transaction.add(
    createTransferCheckedInstruction(
      web3,
      sourceAta,
      mint,
      destinationAta,
      owner,
      amount,
      tokenProgramId
    )
  )

  transaction.add(
    new web3.TransactionInstruction({
      programId: memoProgramId,
      keys: [{ pubkey: referenceKey, isSigner: false, isWritable: false }],
      data: new TextEncoder().encode("Tri-Proof Solana USDC checkout"),
    })
  )

  const latest = await connection.getLatestBlockhash("confirmed")
  transaction.feePayer = owner
  transaction.recentBlockhash = latest.blockhash

  const result = await wallet.signAndSendTransaction(transaction)
  const signature = typeof result === "string" ? result : result.signature

  if (!signature) {
    throw new Error("Wallet did not return a transaction signature.")
  }

  await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    "confirmed"
  )

  return { signature }
}
