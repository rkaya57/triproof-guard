import { createPrivateKey, createPublicKey, sign } from "node:crypto"

import { getStakingServerConfig, TRI_DECIMALS, TRI_DEVNET_MINT } from "@/lib/staking/config"

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const signaturePattern = /^[1-9A-HJ-NP-Za-km-z]{64,96}$/

type AccountMeta = { address: string; isSigner: boolean; isWritable: boolean }
type ParsedInstruction = {
  program?: string
  parsed?: { type?: string; info?: Record<string, unknown> }
}
type ParsedTransaction = {
  meta?: { err?: unknown; innerInstructions?: Array<{ instructions?: ParsedInstruction[] }> } | null
  transaction?: { message?: { instructions?: ParsedInstruction[] } }
}

function decodeBase58(value: string) {
  let numeric = 0n
  for (const character of value.trim()) {
    const index = BASE58_ALPHABET.indexOf(character)
    if (index < 0) throw new Error("Invalid base58 value.")
    numeric = numeric * 58n + BigInt(index)
  }
  const bytes: number[] = []
  while (numeric > 0n) {
    bytes.unshift(Number(numeric & 255n))
    numeric >>= 8n
  }
  const leadingZeros = value.match(/^1*/)?.[0].length ?? 0
  return Uint8Array.from([...Array(leadingZeros).fill(0), ...bytes])
}

function encodeBase58(value: Uint8Array) {
  let numeric = 0n
  for (const byte of value) numeric = (numeric << 8n) + BigInt(byte)
  let encoded = ""
  while (numeric > 0n) {
    encoded = BASE58_ALPHABET[Number(numeric % 58n)] + encoded
    numeric /= 58n
  }
  const leadingZeros = value.findIndex((byte) => byte !== 0)
  const prefix = leadingZeros < 0 ? "1".repeat(value.length) : "1".repeat(leadingZeros)
  return prefix + (encoded || (prefix ? "" : "1"))
}

function compactU16(value: number) {
  const bytes: number[] = []
  let remainder = value
  do {
    let next = remainder & 127
    remainder >>>= 7
    if (remainder) next |= 128
    bytes.push(next)
  } while (remainder)
  return Uint8Array.from(bytes)
}

function concat(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, item) => total + item.length, 0))
  let offset = 0
  parts.forEach((item) => {
    result.set(item, offset)
    offset += item.length
  })
  return result
}

function transferCheckedData(amount: bigint) {
  const data = new Uint8Array(10)
  data[0] = 12
  new DataView(data.buffer).setBigUint64(1, amount, true)
  data[9] = TRI_DECIMALS
  return data
}

function keypairFromSecret(secret: string) {
  let raw: Uint8Array
  try {
    const parsed = JSON.parse(secret) as unknown
    raw = Array.isArray(parsed) ? Uint8Array.from(parsed) : decodeBase58(secret)
  } catch {
    raw = decodeBase58(secret)
  }
  if (raw.length !== 32 && raw.length !== 64) throw new Error("Staking vault secret key must contain 32 or 64 bytes.")

  const seed = raw.slice(0, 32)
  const pkcs8Prefix = Uint8Array.from(Buffer.from("302e020100300506032b657004220420", "hex"))
  const privateKey = createPrivateKey({ key: Buffer.from(concat(pkcs8Prefix, seed)), format: "der", type: "pkcs8" })
  const publicDer = createPublicKey(privateKey).export({ format: "der", type: "spki" })
  const publicKey = new Uint8Array(publicDer.slice(-32))
  return { privateKey, publicKey: encodeBase58(publicKey) }
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[]) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "tri-staking", method, params }),
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`Devnet RPC responded with ${response.status}.`)
  const payload = (await response.json()) as { result?: T; error?: { message?: string } }
  if (payload.error) throw new Error(payload.error.message ?? "Devnet RPC request failed.")
  return payload.result as T
}

function flattenedInstructions(transaction: ParsedTransaction) {
  return [
    ...(transaction.transaction?.message?.instructions ?? []),
    ...((transaction.meta?.innerInstructions ?? []).flatMap((group) => group.instructions ?? [])),
  ]
}

function instructionAmount(instruction: ParsedInstruction) {
  const info = instruction.parsed?.info ?? {}
  const tokenAmount = info.tokenAmount as { amount?: unknown } | undefined
  const raw = tokenAmount?.amount ?? info.amount
  return typeof raw === "string" && /^\d+$/.test(raw) ? BigInt(raw) : 0n
}

export async function verifyStakeTransfer({ signature, walletAddress, amountUnits }: { signature: string; walletAddress: string; amountUnits: bigint }) {
  const config = getStakingServerConfig()
  if (!signaturePattern.test(signature)) throw new Error("Invalid Devnet transaction signature.")

  const transaction = await rpc<ParsedTransaction | null>(config.rpcUrl, "getTransaction", [
    signature,
    { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
  ])
  if (!transaction) throw new Error("Stake transaction was not found on Devnet yet.")
  if (transaction.meta?.err) throw new Error("Stake transaction failed on Devnet.")

  const matching = flattenedInstructions(transaction).some((instruction) => {
    const info = instruction.parsed?.info ?? {}
    const mint = String(info.mint ?? "")
    const destination = String(info.destination ?? "")
    const authority = String(info.authority ?? info.owner ?? "")
    return (
      instruction.program === "spl-token" &&
      (instruction.parsed?.type === "transfer" || instruction.parsed?.type === "transferChecked") &&
      mint === TRI_DEVNET_MINT &&
      destination === config.vaultTokenAccount &&
      authority === walletAddress &&
      instructionAmount(instruction) === amountUnits
    )
  })
  if (!matching) throw new Error("No matching TRI transfer to the staking vault was found.")
}

async function assertRecipientTokenAccount(rpcUrl: string, tokenAccount: string, walletAddress: string) {
  const result = await rpc<{
    value?: { data?: { parsed?: { info?: { mint?: unknown; owner?: unknown } } } } | null
  }>(rpcUrl, "getAccountInfo", [tokenAccount, { encoding: "jsonParsed", commitment: "confirmed" }])
  const info = result.value?.data?.parsed?.info
  if (String(info?.mint ?? "") !== TRI_DEVNET_MINT || String(info?.owner ?? "") !== walletAddress) {
    throw new Error("The selected recipient token account does not belong to this wallet or TRI mint.")
  }
}

function serializeTransfer({ payer, source, destination, amount, blockhash }: { payer: string; source: string; destination: string; amount: bigint; blockhash: string }) {
  const instructionAccounts: AccountMeta[] = [
    { address: source, isSigner: false, isWritable: true },
    { address: TRI_DEVNET_MINT, isSigner: false, isWritable: false },
    { address: destination, isSigner: false, isWritable: true },
    { address: payer, isSigner: true, isWritable: false },
  ]
  const accountMap = new Map<string, AccountMeta>()
  const add = (account: AccountMeta) => {
    const existing = accountMap.get(account.address)
    accountMap.set(account.address, existing
      ? { address: account.address, isSigner: existing.isSigner || account.isSigner, isWritable: existing.isWritable || account.isWritable }
      : account)
  }
  add({ address: payer, isSigner: true, isWritable: true })
  instructionAccounts.forEach(add)
  add({ address: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false })

  const accountKeys = Array.from(accountMap.values()).sort((left, right) =>
    Number(right.isSigner) - Number(left.isSigner) || Number(right.isWritable) - Number(left.isWritable)
  )
  const index = new Map(accountKeys.map((account, position) => [account.address, position]))
  const readonlyUnsigned = accountKeys.filter((account) => !account.isSigner && !account.isWritable).length
  const header = Uint8Array.from([1, 0, readonlyUnsigned])
  const accountBytes = concat(...accountKeys.map((account) => decodeBase58(account.address)))
  const programIndex = index.get(TOKEN_PROGRAM_ID)
  if (programIndex === undefined) throw new Error("Could not build token transfer instruction.")
  const instruction = concat(
    Uint8Array.of(programIndex),
    compactU16(instructionAccounts.length),
    Uint8Array.from(instructionAccounts.map((account) => index.get(account.address) ?? 0)),
    compactU16(10),
    transferCheckedData(amount)
  )
  return concat(
    header,
    compactU16(accountKeys.length),
    accountBytes,
    decodeBase58(blockhash),
    compactU16(1),
    instruction
  )
}

export async function sendVaultTriTransfer({ destinationTokenAccount, walletAddress, amountUnits }: { destinationTokenAccount: string; walletAddress: string; amountUnits: bigint }) {
  if (amountUnits <= 0n) throw new Error("Transfer amount must be positive.")
  const config = getStakingServerConfig()
  await assertRecipientTokenAccount(config.rpcUrl, destinationTokenAccount, walletAddress)
  const signer = keypairFromSecret(config.vaultSecretKey)
  const latest = await rpc<{ value: { blockhash: string } }>(config.rpcUrl, "getLatestBlockhash", [{ commitment: "confirmed" }])
  const message = serializeTransfer({
    payer: signer.publicKey,
    source: config.vaultTokenAccount,
    destination: destinationTokenAccount,
    amount: amountUnits,
    blockhash: latest.value.blockhash,
  })
  const signature = new Uint8Array(sign(null, Buffer.from(message), signer.privateKey))
  const rawTransaction = concat(compactU16(1), signature, message)
  const signatureText = await rpc<string>(config.rpcUrl, "sendTransaction", [
    Buffer.from(rawTransaction).toString("base64"),
    { encoding: "base64", preflightCommitment: "confirmed", maxRetries: 3 },
  ])
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const statuses = await rpc<{
      value?: Array<{ err?: unknown; confirmationStatus?: "processed" | "confirmed" | "finalized" | null } | null>
    }>(config.rpcUrl, "getSignatureStatuses", [[signatureText], { searchTransactionHistory: true }])
    const status = statuses.value?.[0]
    if (status?.err) throw new Error(`Devnet payout failed: ${JSON.stringify(status.err)}`)
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return signatureText
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(`Devnet payout confirmation timed out: ${signatureText}`)
}
