import assert from "node:assert/strict"
import test from "node:test"

import { detectBrandImpersonation } from "./brand-impersonation"

test("official brand domains and subdomains do not trigger impersonation findings", () => {
  for (const url of [
    "https://phantom.com",
    "https://help.phantom.com/security",
    "https://phantom.app",
    "https://support.phantom.app/help",
    "https://solflare.com",
    "https://jup.ag",
    "https://raydium.io",
    "https://docs.raydium.io",
    "https://metamask.io",
    "https://support.metamask.io",
    "https://uniswap.org",
    "https://developers.uniswap.org",
  ]) {
    assert.deepEqual(detectBrandImpersonation(url), [], url)
  }
})

test("detects a one-edit typosquat outside official domains", () => {
  const findings = detectBrandImpersonation("https://phantorn.app/claim")
  assert.ok(findings.some((finding) => finding.brand === "phantom" && finding.matchType === "typosquat" && finding.confidence === "high"))
})

test("detects Unicode homoglyph brand impersonation from raw hostname text", () => {
  const findings = detectBrandImpersonation("https://phаntom-login.example/claim")
  assert.ok(findings.some((finding) => finding.brand === "phantom" && ["homoglyph", "embedded_brand"].includes(finding.matchType)))
})

test("detects brand plus claim lure on a non-official domain", () => {
  const findings = detectBrandImpersonation("https://solflare-claim.example")
  assert.ok(findings.some((finding) => finding.brand === "solflare" && finding.matchType === "embedded_brand"))
})

test("detects MetaMask, Uniswap and Raydium lookalikes", () => {
  assert.ok(detectBrandImpersonation("https://metamask-login.example").some((finding) => finding.brand === "metamask"))
  assert.ok(detectBrandImpersonation("https://unlswap.example").some((finding) => finding.brand === "uniswap"))
  assert.ok(detectBrandImpersonation("https://raydlum.example").some((finding) => finding.brand === "raydium"))
})

test("unrelated domains do not create a brand finding", () => {
  assert.deepEqual(detectBrandImpersonation("https://example.org/dashboard"), [])
})
