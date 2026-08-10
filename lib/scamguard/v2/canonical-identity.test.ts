import assert from "node:assert/strict"
import test from "node:test"

import { compareCanonicalIdentity } from "./canonical-identity"

const mintEvidence = (assetId: string) => ({
  status: "available" as const,
  source: "tokens.xyz" as const,
  mint: "mint",
  canonical: { assetId },
})

const claimEvidence = (assetId: string) => ({
  status: "available" as const,
  source: "tokens.xyz" as const,
  ref: "USDC",
  assetId,
})

test("canonical identity match remains informational", () => {
  const comparison = compareCanonicalIdentity(mintEvidence("usd"), claimEvidence("usd"))
  assert.equal(comparison.status, "match")
  assert.equal(comparison.signal?.severity, "info")
  assert.equal(comparison.signal?.code, "V2_CANONICAL_IDENTITY_MATCH")
})

test("canonical identity mismatch is strong impersonation evidence", () => {
  const comparison = compareCanonicalIdentity(mintEvidence("solana-fake-mint"), claimEvidence("usd"))
  assert.equal(comparison.status, "mismatch")
  assert.equal(comparison.signal?.severity, "critical")
  assert.equal(comparison.signal?.code, "V2_CANONICAL_IDENTITY_MISMATCH")
})

test("missing provider evidence never invents an impersonation verdict", () => {
  const comparison = compareCanonicalIdentity(undefined, claimEvidence("usd"))
  assert.equal(comparison.status, "insufficient_data")
  assert.equal(comparison.signal, undefined)
})
