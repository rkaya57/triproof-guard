import assert from "node:assert/strict"
import test from "node:test"

import {
  buildHumanityAbuseBucketKey,
  deriveHumanityNetworkSubject,
  fixedWindowFor,
  getHumanityRateLimitRules,
} from "@/lib/humanity/v2/abuse-defense"

const SECRET = "humanity-v2-5-test-secret"

test("V2.5 fixed windows reset deterministically and expose retry-after", () => {
  const window = fixedWindowFor(125_001, 60_000)
  assert.equal(window.startMs, 120_000)
  assert.equal(window.endMs, 180_000)
  assert.equal(window.retryAfterSec, 55)

  const boundary = fixedWindowFor(180_000, 60_000)
  assert.equal(boundary.startMs, 180_000)
  assert.equal(boundary.endMs, 240_000)
  assert.equal(boundary.retryAfterSec, 60)
})

test("V2.5 network subject is pseudonymous and stable for the same proxy address", () => {
  const requestA = new Request("https://triproofprotocol.com/api/humanity/v2/challenge/start", {
    headers: { "x-vercel-forwarded-for": "203.0.113.7, 10.0.0.2" },
  })
  const requestB = new Request("https://triproofprotocol.com/api/humanity/v2/challenge/start", {
    headers: { "x-vercel-forwarded-for": "203.0.113.7" },
  })
  const requestC = new Request("https://triproofprotocol.com/api/humanity/v2/challenge/start", {
    headers: { "x-vercel-forwarded-for": "203.0.113.8" },
  })

  const first = deriveHumanityNetworkSubject(requestA, SECRET)
  assert.equal(first, deriveHumanityNetworkSubject(requestB, SECRET))
  assert.notEqual(first, deriveHumanityNetworkSubject(requestC, SECRET))
  assert.equal(first.includes("203.0.113.7"), false)
  assert.match(first, /^[0-9a-f]{64}$/)
})

test("V2.5 bucket keys are domain separated by action and dimension", () => {
  const startWallet = buildHumanityAbuseBucketKey({
    action: "CHALLENGE_START",
    dimension: "wallet",
    subject: "0x1234567890123456789012345678901234567890",
    secret: SECRET,
  })
  const submitWallet = buildHumanityAbuseBucketKey({
    action: "SUBMIT",
    dimension: "wallet",
    subject: "0x1234567890123456789012345678901234567890",
    secret: SECRET,
  })
  const startPrincipal = buildHumanityAbuseBucketKey({
    action: "CHALLENGE_START",
    dimension: "principal",
    subject: "0x1234567890123456789012345678901234567890",
    secret: SECRET,
  })

  assert.notEqual(startWallet, submitWallet)
  assert.notEqual(startWallet, startPrincipal)
  assert.equal(startWallet.includes("0x1234"), false)
})

test("challenge start applies principal, network and wallet policies", () => {
  const rules = getHumanityRateLimitRules({
    action: "CHALLENGE_START",
    principal: "admin-user-id",
    network: "network-hash",
    wallet: "wallet-address",
  })

  assert.deepEqual(
    rules.map((rule) => [rule.dimension, rule.limit, rule.windowMs]),
    [
      ["principal", 30, 600_000],
      ["network", 60, 600_000],
      ["wallet", 10, 3_600_000],
    ]
  )
})

test("V2.5 chain and proof actions use bounded session or verification scopes", () => {
  const stepRules = getHumanityRateLimitRules({
    action: "CHAIN_STEP",
    principal: "admin-user-id",
    network: "network-hash",
    sessionId: "session-id",
  })
  const signRules = getHumanityRateLimitRules({
    action: "SIGN",
    principal: "admin-user-id",
    network: "network-hash",
    verificationId: "verification-id",
  })

  assert.equal(stepRules.find((rule) => rule.dimension === "session")?.limit, 8)
  assert.equal(signRules.find((rule) => rule.dimension === "verification")?.limit, 6)
  assert.equal(stepRules.some((rule) => rule.subject === "session-id"), true)
  assert.equal(signRules.some((rule) => rule.subject === "verification-id"), true)
})
