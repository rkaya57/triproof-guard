import assert from "node:assert/strict"
import test from "node:test"
import { exportJWK, generateKeyPair, SignJWT } from "jose"

import { HUMANITY_ATTESTATION_CLAIM, verifyHumanityAttestationToken } from "./attestation"

const issuer = "https://liveness.example.test"
const audience = "triproof-humanity-v2"

async function fixture() {
  const { privateKey, publicKey } = await generateKeyPair("ES256")
  const publicJwk = await exportJWK(publicKey)
  publicJwk.alg = "ES256"

  const expected = {
    sessionId: "session-123",
    campaignId: "campaign-456",
    nonce: "a".repeat(64),
    walletAddress: "0x1111111111111111111111111111111111111111",
    walletChain: "evm",
  }

  async function sign(overrides: Record<string, unknown> = {}, ttlSeconds = 300) {
    const now = Math.floor(Date.now() / 1000)
    return new SignJWT({
      [HUMANITY_ATTESTATION_CLAIM]: {
        ...expected,
        passed: true,
        livenessScore: 94,
        antiSpoofScore: 92,
        providerSessionId: "provider-session-1",
        ...overrides,
      },
    })
      .setProtectedHeader({ alg: "ES256", typ: "JWT" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setJti("attestation-jti-1")
      .setIssuedAt(now)
      .setExpirationTime(now + ttlSeconds)
      .sign(privateKey)
  }

  return {
    expected,
    config: { publicJwk, issuer, audience, minLivenessScore: 80, minAntiSpoofScore: 80 },
    sign,
  }
}

test("accepts a short-lived provider attestation bound to the exact Humanity session", async () => {
  const { expected, config, sign } = await fixture()
  const token = await sign()
  const result = await verifyHumanityAttestationToken({ token, expected, config })

  assert.equal(result.verified, true)
  assert.equal(result.passed, true)
  assert.equal(result.livenessScore, 94)
  assert.equal(result.antiSpoofScore, 92)
  assert.equal(result.providerSessionId, "provider-session-1")
  assert.match(result.jtiHash, /^[0-9a-f]{24}$/)
})

test("rejects an otherwise valid provider token bound to a different nonce", async () => {
  const { expected, config, sign } = await fixture()
  const token = await sign({ nonce: "b".repeat(64) })

  await assert.rejects(
    verifyHumanityAttestationToken({ token, expected, config }),
    /nonce does not match server-issued Humanity nonce/
  )
})

test("rejects provider attestations with an excessive lifetime", async () => {
  const { expected, config, sign } = await fixture()
  const token = await sign({}, 900)

  await assert.rejects(
    verifyHumanityAttestationToken({ token, expected, config }),
    /lifetime must not exceed 10 minutes/
  )
})

test("rejects provider attestations below anti-spoof policy", async () => {
  const { expected, config, sign } = await fixture()
  const token = await sign({ antiSpoofScore: 61 })

  await assert.rejects(
    verifyHumanityAttestationToken({ token, expected, config }),
    /Anti-spoof provider score is below the configured threshold/
  )
})
