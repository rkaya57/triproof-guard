import bs58 from "bs58"
import { verify as naclVerify } from "tweetnacl"
import { verifyMessage } from "ethers"

function hexToBytes(value: string) {
  const clean = value.startsWith("0x") ? value.slice(2) : value
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error("Invalid hex signature")
  }
  return Uint8Array.from(clean.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [])
}

function decodeSolanaSignature(signature: string) {
  const value = signature.trim()
  if (!value) throw new Error("Missing Solana signature")

  try {
    return bs58.decode(value)
  } catch {
    return hexToBytes(value)
  }
}

function normalizeEvmAddress(address: string) {
  return address.trim().toLowerCase()
}

export type WalletSignatureVerificationResult = {
  signatureVerified: boolean
  signatureCaptured: boolean
  walletChain: string
  verificationMethod: "solana_ed25519" | "evm_eip191" | "captured_only" | "unsupported"
  error?: string
}

export async function verifyWalletSignature({
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
  const chain = (walletChain || "").toLowerCase()
  const cleanSignature = signature.trim()
  const signatureCaptured = cleanSignature.length >= 16 && !cleanSignature.includes("MOCK_SIGNATURE")

  if (!signatureCaptured) {
    return {
      signatureVerified: false,
      signatureCaptured: false,
      walletChain: chain || "unknown",
      verificationMethod: "captured_only",
      error: "No real signature was captured",
    }
  }

  try {
    if (chain === "solana") {
      const publicKey = bs58.decode(walletAddress)
      const sig = decodeSolanaSignature(cleanSignature)
      const encodedMessage = new TextEncoder().encode(message)
      const ok = naclVerify.detached(encodedMessage, sig, publicKey)
      return {
        signatureVerified: ok,
        signatureCaptured: true,
        walletChain: chain,
        verificationMethod: "solana_ed25519",
        error: ok ? undefined : "Solana signature did not match wallet/message",
      }
    }

    if (chain === "evm" || chain === "ethereum" || walletAddress.startsWith("0x")) {
      const recovered = verifyMessage(message, cleanSignature)
      const ok = normalizeEvmAddress(recovered) === normalizeEvmAddress(walletAddress)
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
      error: "Unsupported wallet chain for cryptographic verification",
    }
  } catch (error) {
    return {
      signatureVerified: false,
      signatureCaptured: true,
      walletChain: chain || "unknown",
      verificationMethod: chain === "solana" ? "solana_ed25519" : chain === "evm" ? "evm_eip191" : "unsupported",
      error: error instanceof Error ? error.message : "Signature verification failed",
    }
  }
}
