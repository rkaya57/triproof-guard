import { createPublicKey, verify as verifySignature } from "node:crypto"

import { isAddress, verifyMessage } from "ethers"

import { safePostAuthPath } from "@/lib/auth/redirects"
import {
  authAppUrl,
  createOpaqueToken,
  hashOpaqueToken,
} from "@/lib/auth/security"
import { consumeAuthToken, createAuthToken } from "@/lib/auth/store"
import { isValidSolanaAddress } from "@/lib/validators/wallet"

export type WalletChain = "EVM" | "SOLANA"
export type WalletPurpose = "LOGIN" | "LINK"

const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
const base58Values = new Map(Array.from(base58Alphabet, (character, index) => [character, index]))

function decodeBase58(value: string) {
  const bytes = [0]
  for (const character of value) {
    const digit = base58Values.get(character)
    if (digit === undefined) throw new Error("Invalid base58 value.")
    let carry = digit
    for (let index = 0; index < bytes.length; index += 1) {
      const current = bytes[index] * 58 + carry
      bytes[index] = current & 0xff
      carry = current >> 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  for (let index = 0; index < value.length - 1 && value[index] === "1"; index += 1) {
    bytes.push(0)
  }
  return Buffer.from(bytes.reverse())
}

export function normalizeAuthWalletAddress(chain: WalletChain, address: string) {
  const trimmed = address.trim()
  if (chain === "EVM") {
    if (!isAddress(trimmed)) throw new Error("Invalid EVM wallet address.")
    return trimmed.toLowerCase()
  }
  if (!isValidSolanaAddress(trimmed)) throw new Error("Invalid Solana wallet address.")
  return trimmed
}

function walletMessage(input: {
  chain: WalletChain
  address: string
  purpose: WalletPurpose
  nonce: string
  issuedAt: string
  expiresAt: string
}) {
  const host = new URL(authAppUrl()).host
  const action = input.purpose === "LINK" ? "link this wallet to your account" : "sign in"
  return [
    `${host} wants you to ${action} with your ${input.chain} wallet:`,
    input.address,
    "",
    "This request does not initiate a blockchain transaction and will never ask for a seed phrase or private key.",
    "",
    `URI: ${authAppUrl()}`,
    "Version: 1",
    `Chain: ${input.chain}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expiration Time: ${input.expiresAt}`,
  ].join("\n")
}

export async function createWalletChallenge(input: {
  chain: WalletChain
  address: string
  purpose: WalletPurpose
  userId?: string | null
  redirectTo?: string
}) {
  const address = normalizeAuthWalletAddress(input.chain, input.address)
  const token = createOpaqueToken()
  const nonce = createOpaqueToken(16)
  const issuedAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
  const message = walletMessage({
    chain: input.chain,
    address,
    purpose: input.purpose,
    nonce,
    issuedAt,
    expiresAt: expiresAt.toISOString(),
  })
  await createAuthToken({
    userId: input.userId,
    type: "WALLET_CHALLENGE",
    tokenHash: hashOpaqueToken(token),
    expiresAt,
    metadata: {
      chain: input.chain,
      address,
      purpose: input.purpose,
      message,
      redirectTo: safePostAuthPath(input.redirectTo),
    },
  })
  return { token, message, address, expiresAt: expiresAt.toISOString() }
}

function verifySolanaMessage(input: { address: string; message: string; signature: string }) {
  try {
    const rawPublicKey = decodeBase58(input.address)
    if (rawPublicKey.length !== 32) return false
    const signature = Buffer.from(input.signature, "base64")
    if (signature.length !== 64) return false
    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex")
    const publicKey = createPublicKey({
      key: Buffer.concat([spkiPrefix, rawPublicKey]),
      format: "der",
      type: "spki",
    })
    return verifySignature(null, Buffer.from(input.message, "utf8"), publicKey, signature)
  } catch {
    return false
  }
}

export function verifyAuthWalletMessageSignature(input: {
  chain: WalletChain
  address: string
  message: string
  signature: string
}) {
  const normalizedAddress = normalizeAuthWalletAddress(input.chain, input.address)
  if (input.chain === "SOLANA") {
    return verifySolanaMessage({
      address: normalizedAddress,
      message: input.message,
      signature: input.signature,
    })
  }
  try {
    return verifyMessage(input.message, input.signature).toLowerCase() === normalizedAddress
  } catch {
    return false
  }
}

export async function verifyWalletChallenge(input: {
  token: string
  chain: WalletChain
  address: string
  purpose: WalletPurpose
  signature: string
}) {
  const token = await consumeAuthToken({
    tokenHash: hashOpaqueToken(input.token),
    type: "WALLET_CHALLENGE",
    maxAttempts: 1,
  })
  const metadata = token?.metadata
  const normalizedAddress = normalizeAuthWalletAddress(input.chain, input.address)
  if (
    !metadata ||
    metadata.chain !== input.chain ||
    metadata.address !== normalizedAddress ||
    metadata.purpose !== input.purpose ||
    typeof metadata.message !== "string"
  ) {
    throw new Error("Wallet challenge is invalid or expired.")
  }

  const valid = verifyAuthWalletMessageSignature({
    chain: input.chain,
    address: normalizedAddress,
    message: metadata.message,
    signature: input.signature,
  })
  if (!valid) throw new Error("Wallet signature could not be verified.")

  return {
    userId: token.userId,
    chain: input.chain,
    address: normalizedAddress,
    purpose: input.purpose,
    redirectTo: safePostAuthPath(metadata.redirectTo),
  }
}
