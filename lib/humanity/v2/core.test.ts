import assert from "node:assert/strict"
import { generateKeyPairSync, sign as signEd25519 } from "node:crypto"
import test from "node:test"
import { Wallet } from "ethers"

import {
  buildNullifierHash,
  buildProofMessage,
  computeClientTelemetryDecision,
  validateStepEvidence,
} from "@/lib/humanity/v2/core"
import { verifyHumanityWalletSignature } from "@/lib/humanity/v2/signature"

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

function encodeBase58(input: Uint8Array) {
  let leadingZeroes = 0
  while (leadingZeroes < input.length && input[leadingZeroes] === 0) leadingZeroes += 1

  let numeric = 0n
  for (const byte of input) numeric = numeric * 256n + BigInt(byte)

  let encoded = ""
  while (numeric > 0n) {
    const remainder = Number(numeric % 58n)
    encoded = BASE58_ALPHABET[remainder] + encoded
    numeric /= 58n
  }

  return "1".repeat(leadingZeroes) + encoded
}

const perfectScores = {
  facePresenceScore: 100,
  headPoseScore: 100,
  eyeBlinkScore: 100,
  handGestureScore: 100,
  motionTimingScore: 100,
  frameConsistencyScore: 100,
  replayRiskScore: 0,
  injectionRiskScore: 0,
}

test("client-only telemetry can never auto-approve a Humanity V2 proof", () => {
  const result = computeClientTelemetryDecision(perfectScores)
  assert.equal(result.decision, "MANUAL_REVIEW")
  assert.ok(result.reasonCodes.includes("CLIENT_TELEMETRY_UNATTESTED"))
  assert.ok(result.reasonCodes.includes("SERVER_ATTESTATION_REQUIRED_FOR_APPROVAL"))
})

test("high replay or injection risk rejects the session", () => {
  const result = computeClientTelemetryDecision({ ...perfectScores, replayRiskScore: 95 })
  assert.equal(result.decision, "REJECTED")
  assert.ok(result.reasonCodes.includes("SCREEN_REPLAY_RISK"))
})

test("step evidence must match the issued challenge order and timing", () => {
  const sequence = ["LOOK_CENTER", "TURN_LEFT", "BLINK"] as const
  const valid = validateStepEvidence([...sequence], [
    { step: "LOOK_CENTER", capturedAtMs: 1000, heldForMs: 500 },
    { step: "TURN_LEFT", capturedAtMs: 2000, heldForMs: 700 },
    { step: "BLINK", capturedAtMs: 3000, heldForMs: 300 },
  ])
  assert.equal(valid.ok, true)

  const invalid = validateStepEvidence([...sequence], [
    { step: "LOOK_CENTER", capturedAtMs: 1000, heldForMs: 500 },
    { step: "BLINK", capturedAtMs: 900, heldForMs: 100 },
    { step: "TURN_LEFT", capturedAtMs: 3000, heldForMs: 500 },
  ])
  assert.equal(invalid.ok, false)
  assert.ok(invalid.reasonCodes.some((reason) => reason.startsWith("STEP_ORDER_MISMATCH")))
  assert.ok(invalid.reasonCodes.some((reason) => reason.startsWith("NON_MONOTONIC_STEP_TIME")))
})

test("campaign-scoped nullifier is stable across sessions and EVM address casing", () => {
  const first = buildNullifierHash({
    secret: "test-secret",
    campaignId: "campaign-a",
    walletAddress: "0xAbCdEf0000000000000000000000000000000000",
    walletChain: "evm",
  })
  const second = buildNullifierHash({
    secret: "test-secret",
    campaignId: "campaign-a",
    walletAddress: "0xabcdef0000000000000000000000000000000000",
    walletChain: "EVM",
  })
  const otherCampaign = buildNullifierHash({
    secret: "test-secret",
    campaignId: "campaign-b",
    walletAddress: "0xabcdef0000000000000000000000000000000000",
    walletChain: "evm",
  })

  assert.equal(first, second)
  assert.notEqual(first, otherCampaign)
})

test("canonical proof message is deterministic", () => {
  const args = {
    campaignId: "campaign-1",
    verificationId: "verification-1",
    walletAddress: "0xAbCdEf0000000000000000000000000000000000",
    walletChain: "evm",
    nonce: "nonce-1",
    decision: "MANUAL_REVIEW" as const,
    proofExpiresAt: new Date("2026-10-01T00:00:00.000Z"),
  }
  const first = buildProofMessage(args)
  const second = buildProofMessage(args)
  assert.equal(first, second)
  assert.match(first, /Version: 2/)
  assert.match(first, /Wallet: 0xabcdef/)
})

test("EVM signatures verify only against the canonical Humanity V2 message", async () => {
  const wallet = Wallet.createRandom()
  const message = buildProofMessage({
    campaignId: "campaign-evm",
    verificationId: "verification-evm",
    walletAddress: wallet.address,
    walletChain: "evm",
    nonce: "nonce-evm",
    decision: "MANUAL_REVIEW",
    proofExpiresAt: new Date("2026-10-01T00:00:00.000Z"),
  })
  const signature = await wallet.signMessage(message)

  const verified = await verifyHumanityWalletSignature({
    walletChain: "evm",
    walletAddress: wallet.address,
    message,
    signature,
  })
  assert.equal(verified.signatureVerified, true)

  const tampered = await verifyHumanityWalletSignature({
    walletChain: "evm",
    walletAddress: wallet.address,
    message: `${message}\nTampered: true`,
    signature,
  })
  assert.equal(tampered.signatureVerified, false)
})

test("Solana Ed25519 signatures verify without extra runtime dependencies", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  const der = publicKey.export({ format: "der", type: "spki" })
  const rawPublicKey = new Uint8Array(der.subarray(der.length - 32))
  const walletAddress = encodeBase58(rawPublicKey)
  const message = "Tri-Proof Humanity V2 Solana signature test"
  const signatureBytes = signEd25519(null, Buffer.from(message, "utf8"), privateKey)
  const signature = encodeBase58(new Uint8Array(signatureBytes))

  const verified = await verifyHumanityWalletSignature({
    walletChain: "solana",
    walletAddress,
    message,
    signature,
  })

  assert.equal(verified.signatureVerified, true)
  assert.equal(verified.verificationMethod, "solana_ed25519")
})
