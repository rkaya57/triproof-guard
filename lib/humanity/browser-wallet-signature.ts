type SolanaProvider = {
  connect?: () => Promise<unknown>
  signMessage?: (message: Uint8Array, encoding?: string) => Promise<{ signature: Uint8Array }>
}

type EthereumProvider = {
  request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

type BrowserWalletWindow = Window & {
  solana?: SolanaProvider
  ethereum?: EthereumProvider
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export async function requestBrowserWalletSignature({
  walletChain,
  walletAddress,
  message,
}: {
  walletChain: string
  walletAddress: string
  message: string
}) {
  const chain = walletChain.toLowerCase()
  const win = window as BrowserWalletWindow

  if (chain === "solana") {
    const solana = win.solana
    if (solana?.signMessage) {
      await solana.connect?.()
      const encoded = new TextEncoder().encode(message)
      const signed = await solana.signMessage(encoded, "utf8")
      return {
        signature: bytesToHex(signed.signature),
        provider: "solana_browser_wallet",
        cryptographic: true,
      }
    }
  }

  if (chain === "evm" || chain === "ethereum" || walletAddress.startsWith("0x")) {
    const ethereum = win.ethereum
    if (ethereum?.request) {
      const signature = await ethereum.request({
        method: "personal_sign",
        params: [message, walletAddress],
      })
      if (typeof signature === "string") {
        return {
          signature,
          provider: "evm_browser_wallet",
          cryptographic: true,
        }
      }
    }
  }

  return {
    signature: `ADMIN_CAPTURE_${crypto.randomUUID()}`,
    provider: "admin_sandbox_capture",
    cryptographic: false,
  }
}
