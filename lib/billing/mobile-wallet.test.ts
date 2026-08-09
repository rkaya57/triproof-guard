import assert from "node:assert/strict"
import test from "node:test"

import { buildMobileWalletBrowseUrl, isLikelyMobileUserAgent } from "./mobile-wallet"

test("detects common mobile browser user agents", () => {
  assert.equal(isLikelyMobileUserAgent("Mozilla/5.0 (Linux; Android 14; Mobile)"), true)
  assert.equal(isLikelyMobileUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), true)
  assert.equal(isLikelyMobileUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), false)
})

test("builds Phantom browse universal link with encoded checkout and referrer", () => {
  const targetUrl = "https://triproofprotocol.com/checkout?plan=builder&currency=USDC"
  const refUrl = "https://triproofprotocol.com"
  const link = buildMobileWalletBrowseUrl({ wallet: "phantom", targetUrl, refUrl })

  assert.equal(
    link,
    `https://phantom.app/ul/browse/${encodeURIComponent(targetUrl)}?ref=${encodeURIComponent(refUrl)}`
  )
})

test("builds Solflare v1 browse universal link with encoded checkout and referrer", () => {
  const targetUrl = "https://triproofprotocol.com/checkout?pack=sybil_starter&currency=SOL"
  const refUrl = "https://triproofprotocol.com"
  const link = buildMobileWalletBrowseUrl({ wallet: "solflare", targetUrl, refUrl })

  assert.equal(
    link,
    `https://solflare.com/ul/v1/browse/${encodeURIComponent(targetUrl)}?ref=${encodeURIComponent(refUrl)}`
  )
})
