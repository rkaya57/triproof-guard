type SolanaPublicKeyLike = {
  toString: () => string
}

type SolanaConnectResult = {
  publicKey?: SolanaPublicKeyLike
}

type SolanaProvider = {
  publicKey?: SolanaPublicKeyLike
  connect?: () => Promise<SolanaConnectResult>
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

function sameWallet(expected: string, actual: string, chain: string) {
  if (chain === "evm" || chain === "ethereum" || expected.startsWith("0x")) {
    return expected.trim().toLowerCase() === actual.trim().toLowerCase()
  }
  return expected.trim() === actual.trim()
}

export async function requestHumanityV2WalletSignature({
  walletChain,
  walletAddress,
  message,
}: {
  walletChain: string
  walletAddress: string
  message: string
}) {
  const chain = walletChain.trim().toLowerCase()
  const win = window as BrowserWalletWindow

  if (chain === "solana") {
    const solana = win.solana
    if (!solana?.signMessage) {
      throw new Error("A Solana browser wallet with signMessage support is required")
    }

    const connected = await solana.connect?.()
    const activeAddress = connected?.publicKey?.toString() ?? solana.publicKey?.toString()
    if (!activeAddress) throw new Error("Could not read the connected Solana wallet address")
    if (!sameWallet(walletAddress, activeAddress, chain)) {
      throw new Error("Connected Solana wallet does not match the Humanity wallet address")
    }

    const encoded = new TextEncoder().encode(message)
    const signed = await solana.signMessage(encoded, "utf8")
    return {
      signature: `0x${bytesToHex(signed.signature)}`,
      provider: "solana_browser_wallet" as const,
    }
  }

  if (chain === "evm" || chain === "ethereum" || walletAddress.startsWith("0x")) {
    const ethereum = win.ethereum
    if (!ethereum?.request) {
      throw new Error("An EVM browser wallet is required")
    }

    const accounts = await ethereum.request({ method: "eth_requestAccounts" })
    const activeAddress = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : null
    if (!activeAddress) throw new Error("Could not read the connected EVM wallet address")
    if (!sameWallet(walletAddress, activeAddress, "evm")) {
      throw new Error("Connected EVM wallet does not match the Humanity wallet address")
    }

    const signature = await ethereum.request({
      method: "personal_sign",
      params: [message, activeAddress],
    })
    if (typeof signature !== "string") throw new Error("EVM wallet did not return a signature")

    return {
      signature,
      provider: "evm_browser_wallet" as const,
    }
  }

  throw new Error(`Unsupported Humanity wallet chain: ${walletChain}`)
}
