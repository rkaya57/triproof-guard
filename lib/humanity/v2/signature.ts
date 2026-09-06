import { createPublicKey, verify as verifyEd25519 } from "node:crypto"
import { verifyMessage } from "ethers"

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
const BASE58_INDEX = new Map([...BASE58_ALPHABET].map((character, index) => [character, index]))

function decodeBase58(value: string) {
  const clean = value.trim()
  if (!clean) throw new Error("Missing base58 value")

  const bytes = [0]
  for (const character of clean) {
    const digit = BASE58_INDEX.get(character)
    if (digit === undefined) throw new Error("Invalid base58 value")

    let carry = digit
    for (let index = 0; index < bytes.length; index += 1) {
      const numeric = bytes[index] * 58 + carry
      bytes[index] = numeric & 0xff
      carry = numeric >> 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }

  let leadingZeroes = 0
  while (leadingZeroes < clean.length && clean[leadingZeroes] === "1") leadingZeroes += 1
  const output = new Uint8Array(leadingZeroes + bytes.length)
  for (let index = 0; index < bytes.length; index += 1) {
    output[output.length - 1 - index] = bytes[index]
  }
  return output
}

function decodeHex(value: string) {
  const clean = value.startsWith("0x") ? value.slice(2) : value
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) throw new Error("Invalid hex value")
  return Uint8Array.from(clean.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [])
}

function decodeSolanaSignature(signature: string) {
  try {
    return decodeBase58(signature)
  } catch {
    return decodeHex(signature)
  }
}

function verifySolanaMessage(walletAddress: string, message: string, signature: string) {
  const publicKeyBytes = decodeBase58(walletAddress)
  if (publicKeyBytes.length !== 32) throw new Error("Solana public key must be 32 bytes")

  const signatureBytes = decodeSolanaSignature(signature)
  if (signatureBytes.length !== 64) throw new Error("Solana signature must be 64 bytes")

  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex")
  const key = createPublicKey({
    key: Buffer.concat([spkiPrefix, Buffer.from(publicKeyBytes)]),
    format: "der",
    type: "spki",
  })

  return verifyEd25519(null, Buffer.from(message, "utf8"), key, Buffer.from(signatureBytes))
}

export type WalletSignatureVerificationResult = {
  signatureVerified: boolean
  signatureCaptured: boolean
  walletChain: string
  verificationMethod: "solana_ed25519" | "evm_eip191" | "unsupported"
  error?: string
}

export async function verifyHumanityWalletSignature({
  walletChain,
  walletAddress,
  message,
  signature,
}: {
  walletChain?: string | null
  walletAddress: string
  message: string
  signature: string
}): Promise<WalletSignatureVerificationResult> {
  const chain = (walletChain ?? "").trim().toLowerCase()
  const cleanSignature = signature.trim()
  const signatureCaptured = cleanSignature.length >= 16 && !cleanSignature.includes("MOCK_SIGNATURE")

  if (!signatureCaptured) {
    return {
      signatureVerified: false,
      signatureCaptured: false,
      walletChain: chain || "unknown",
      verificationMethod: "unsupported",
      error: "No real wallet signature was captured",
    }
  }

  try {
    if (chain === "solana") {
      const ok = verifySolanaMessage(walletAddress, message, cleanSignature)
      return {
        signatureVerified: ok,
        signatureCaptured: true,
        walletChain: "solana",
        verificationMethod: "solana_ed25519",
        error: ok ? undefined : "Solana signature did not match canonical Humanity V2 proof message",
      }
    }

    if (chain === "evm" || chain === "ethereum" || walletAddress.startsWith("0x")) {
      const recovered = verifyMessage(message, cleanSignature).toLowerCase()
      const ok = recovered === walletAddress.trim().toLowerCase()
      return {
        signatureVerified: ok,
        signatureCaptured: true,
        walletChain: chain || "evm",
        verificationMethod: "evm_eip191",
        error: ok ? undefined : "EVM signature recovered a different wallet",
      }
    }

    return {
      signatureVerified: false,
      signatureCaptured: true,
      walletChain: chain || "unknown",
      verificationMethod: "unsupported",
      error: "Unsupported wallet chain for Humanity V2 signature verification",
    }
  } catch (error) {
    return {
      signatureVerified: false,
      signatureCaptured: true,
      walletChain: chain || "unknown",
      verificationMethod: chain === "solana" ? "solana_ed25519" : chain === "evm" || chain === "ethereum" ? "evm_eip191" : "unsupported",
      error: error instanceof Error ? error.message : "Wallet signature verification failed",
    }
  }
}
