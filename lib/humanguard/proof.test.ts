import assert from "node:assert/strict"
import test from "node:test"

import { signHumanGuardProof, verifyHumanGuardProofToken } from "./proof"

test("HumanGuard proof tokens round-trip signed claims", async () => {
  const secret = "test-humanguard-proof-secret-with-enough-entropy"
  const expiresAt = new Date(Date.now() + 60_000)
  const token = await signHumanGuardProof({
    tokenId: "hg_test_token",
    siteId: "site_test",
    sessionId: "session_test",
    action: "claim",
    origin: "https://example.com",
    walletAddress: "0xabc",
    walletChain: "base",
    challengeType: "QUANTUM_SEAL",
    humanScore: 94,
    expiresAt,
  }, secret)

  const claims = await verifyHumanGuardProofToken(token, secret)
  assert.equal(claims.tokenId, "hg_test_token")
  assert.equal(claims.siteId, "site_test")
  assert.equal(claims.sessionId, "session_test")
  assert.equal(claims.action, "claim")
  assert.equal(claims.origin, "https://example.com")
  assert.equal(claims.walletAddress, "0xabc")
  assert.equal(claims.walletChain, "base")
  assert.equal(claims.challengeType, "QUANTUM_SEAL")
  assert.equal(claims.humanScore, 94)
})
