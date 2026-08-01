export function isSolanaChain(chain: string | null | undefined) {
  return chain?.trim().toLowerCase() === "solana"
}

export function normalizeChainAddress(
  address: string,
  chain: string | null | undefined
) {
  const trimmed = address.trim()
  return isSolanaChain(chain) ? trimmed : trimmed.toLowerCase()
}

export function chainAddressKey(
  address: string,
  chain: string | null | undefined
) {
  const normalizedChain = chain?.trim().toLowerCase() ?? ""
  return `${normalizedChain}:${normalizeChainAddress(address, chain)}`
}
