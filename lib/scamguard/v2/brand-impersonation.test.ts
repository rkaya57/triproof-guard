import assert from "node:assert/strict"
import test from "node:test"

import { detectBrandImpersonation } from "./brand-impersonation"

test("official brand domains and subdomains do not trigger impersonation findings", () => {
  assert.deepEqual(detectBrandImpersonation("https://phantom.app"), [])
  assert.deepEqual(detectBrandImpersonation("https://support.phantom.app/help"), [])
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

test("unrelated domains do not create a brand finding", () => {
  assert.deepEqual(detectBrandImpersonation("https://example.org/dashboard"), [])
})
