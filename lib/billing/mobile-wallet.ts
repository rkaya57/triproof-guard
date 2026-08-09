export type MobileSolanaWallet = "phantom" | "solflare"

export function isLikelyMobileUserAgent(userAgent: string) {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)
}

export function buildMobileWalletBrowseUrl({
  wallet,
  targetUrl,
  refUrl,
}: {
  wallet: MobileSolanaWallet
  targetUrl: string
  refUrl: string
}) {
  const encodedTarget = encodeURIComponent(targetUrl)
  const encodedRef = encodeURIComponent(refUrl)

  if (wallet === "phantom") {
    return `https://phantom.app/ul/browse/${encodedTarget}?ref=${encodedRef}`
  }

  return `https://solflare.com/ul/v1/browse/${encodedTarget}?ref=${encodedRef}`
}
