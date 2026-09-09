import assert from "node:assert/strict"
import test from "node:test"

import {
  createHumanGuardChallenge,
  derivePacketSuspect,
  humanGuardOriginAllowed,
  normalizeAllowedOrigins,
  verifyHumanGuardSubmission,
} from "./core"

test("HumanGuard normalizes and enforces exact origins", () => {
  const origins = normalizeAllowedOrigins(["https://example.com", "https://example.com/"])
  assert.deepEqual(origins, ["https://example.com"])
  assert.equal(humanGuardOriginAllowed("https://example.com", origins), true)
  assert.equal(humanGuardOriginAllowed("https://evil.example.com", origins), false)
})

test("Quantum Seal requires server-side alignment and interaction evidence", () => {
  const challenge = createHumanGuardChallenge("QUANTUM_SEAL", "test-quantum-seed")
  const target = challenge.expectedAnswer.targetAngle as number
  const verified = verifyHumanGuardSubmission({
    type: "QUANTUM_SEAL",
    expectedAnswer: challenge.expectedAnswer,
    result: { angles: [target, target, target] },
    telemetry: { durationMs: 1_200, pointerMoves: 14, clicks: 1, corrections: 3 },
  })
  assert.equal(verified.ok, true)
  assert.ok(verified.humanScore >= 80)

  const rejected = verifyHumanGuardSubmission({
    type: "QUANTUM_SEAL",
    expectedAnswer: challenge.expectedAnswer,
    result: { angles: [target + 1, target, target] },
    telemetry: { durationMs: 1_200, pointerMoves: 14 },
  })
  assert.equal(rejected.ok, false)
})

test("Packet Intercept suspect derivation is deterministic", () => {
  const a = derivePacketSuspect("render-seed", 11)
  const b = derivePacketSuspect("render-seed", 11)
  assert.equal(a, b)
  assert.ok(a >= 0 && a < 11)
})

test("Time Fracture rejects a client-supplied success flag without the correct position", () => {
  const challenge = createHumanGuardChallenge("TIME_FRACTURE", "test-time-seed")
  const target = challenge.expectedAnswer.targetT as number
  const rejected = verifyHumanGuardSubmission({
    type: "TIME_FRACTURE",
    expectedAnswer: challenge.expectedAnswer,
    result: { success: true, timePosition: target + 0.4 },
    telemetry: { durationMs: 1_200, scrubMoves: 12 },
  })
  assert.equal(rejected.ok, false)

  const verified = verifyHumanGuardSubmission({
    type: "TIME_FRACTURE",
    expectedAnswer: challenge.expectedAnswer,
    result: { timePosition: target },
    telemetry: { durationMs: 1_200, scrubMoves: 12, pointerMoves: 12, clicks: 1 },
  })
  assert.equal(verified.ok, true)
})
