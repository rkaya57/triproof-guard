import { createHash, randomBytes } from "node:crypto"

export const HUMAN_GUARD_CHALLENGE_TYPES = [
  "QUANTUM_SEAL",
  "PACKET_INTERCEPT",
  "TIME_FRACTURE",
  "RESONANCE_CORE",
] as const

export type HumanGuardChallengeType = (typeof HUMAN_GUARD_CHALLENGE_TYPES)[number]

export type HumanGuardTelemetry = {
  durationMs?: number
  pointerMoves?: number
  clicks?: number
  corrections?: number
  scrubMoves?: number
}

export type GeneratedHumanGuardChallenge = {
  type: HumanGuardChallengeType
  seed: string
  publicConfig: Record<string, unknown>
  expectedAnswer: Record<string, unknown>
}

export type HumanGuardVerificationResult = {
  ok: boolean
  humanScore: number
  reasonCodes: string[]
  evidence: Record<string, unknown>
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function finiteArray(value: unknown, length: number): number[] | null {
  if (!Array.isArray(value) || value.length !== length || !value.every(finite)) return null
  return value as number[]
}

function circularError(a: number, b: number) {
  let diff = Math.abs(a - b) % (Math.PI * 2)
  if (diff > Math.PI) diff = Math.PI * 2 - diff
  return diff
}

function hashUint32(value: string) {
  return createHash("sha256").update(value).digest().readUInt32BE(0)
}

function seededRandom(seed: string) {
  let state = hashUint32(seed) || 0x9e3779b9
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x1_0000_0000
  }
}

function randomBetween(next: () => number, min: number, max: number) {
  return min + next() * (max - min)
}

function randomInt(next: () => number, min: number, max: number) {
  return Math.floor(randomBetween(next, min, max + 1))
}

export function createHumanGuardSeed() {
  return randomBytes(18).toString("base64url")
}

export function createHumanGuardSiteKey() {
  return `tp_site_${randomBytes(18).toString("base64url")}`
}

export function normalizeHumanGuardOrigin(value: string) {
  const url = new URL(value)
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("HumanGuard origins must use http or https")
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("HumanGuard origins must be scheme + host only")
  }
  return `${url.protocol}//${url.host}`
}

export function normalizeAllowedOrigins(values: string[]) {
  const normalized = values.map((value) => normalizeHumanGuardOrigin(value.trim()))
  return [...new Set(normalized)]
}

export function humanGuardOriginAllowed(origin: string, allowedOrigins: unknown) {
  if (!Array.isArray(allowedOrigins)) return false
  let normalized: string
  try {
    normalized = normalizeHumanGuardOrigin(origin)
  } catch {
    return false
  }
  return allowedOrigins.some((value) => typeof value === "string" && value === normalized)
}

export function normalizeHumanGuardWallet(value?: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.startsWith("0x") ? trimmed.toLowerCase() : trimmed
}

export function computeHumanGuardBootstrapRisk(input: {
  userAgent?: string | null
  acceptLanguage?: string | null
  secChUa?: string | null
  walletProvided?: boolean
  clientSignalCount?: number
}) {
  let risk = 42
  if (!input.userAgent?.trim()) risk += 18
  if (!input.acceptLanguage?.trim()) risk += 8
  if (!input.secChUa?.trim()) risk += 4
  if (!input.walletProvided) risk += 3
  if ((input.clientSignalCount ?? 0) < 2) risk += 7
  return clamp(risk, 0, 100)
}

export function chooseHumanGuardChallenge(seed: string, riskScore: number): HumanGuardChallengeType {
  const next = seededRandom(`${seed}:selector:${Math.round(riskScore)}`)
  const pool: HumanGuardChallengeType[] = riskScore >= 72
    ? ["PACKET_INTERCEPT", "TIME_FRACTURE", "RESONANCE_CORE", "QUANTUM_SEAL"]
    : ["QUANTUM_SEAL", "TIME_FRACTURE", "RESONANCE_CORE", "PACKET_INTERCEPT"]
  return pool[randomInt(next, 0, pool.length - 1)]
}

export function derivePacketSuspect(renderSeed: string, packetCount: number) {
  const next = seededRandom(`${renderSeed}:suspect`)
  return randomInt(next, 0, Math.max(0, packetCount - 1))
}

export function createHumanGuardChallenge(
  type: HumanGuardChallengeType,
  seed = createHumanGuardSeed()
): GeneratedHumanGuardChallenge {
  const next = seededRandom(`${seed}:${type}`)

  if (type === "QUANTUM_SEAL") {
    const targetAngle = randomBetween(next, -Math.PI, Math.PI)
    const initialAngles = [0, 1, 2].map(() => {
      const direction = next() > 0.5 ? 1 : -1
      return targetAngle + direction * randomBetween(next, 0.75, 2.25)
    })
    return {
      type,
      seed,
      publicConfig: {
        version: 1,
        alignmentAxisAngle: targetAngle,
        initialAngles,
        coupling: [
          [0, 0.16, -0.05],
          [0.1, 0, 0.12],
          [-0.04, 0.1, 0],
        ],
      },
      expectedAnswer: {
        targetAngle,
        tolerance: 0.095,
        minDurationMs: 700,
        minMoves: 5,
      },
    }
  }

  if (type === "PACKET_INTERCEPT") {
    const packetCount = randomInt(next, 9, 12)
    const renderSeed = `${seed}.${randomInt(next, 10_000, 999_999)}`
    const suspectPacketId = derivePacketSuspect(renderSeed, packetCount)
    const anomalyAtMs = randomInt(next, 1_100, 1_900)
    const anomalyDurationMs = randomInt(next, 480, 760)
    const anomalyTypes = ["JITTER", "SURGE", "PULSE"] as const
    const anomalyType = anomalyTypes[randomInt(next, 0, anomalyTypes.length - 1)]
    return {
      type,
      seed,
      publicConfig: {
        version: 1,
        renderSeed,
        packetCount,
        laneCount: 4,
        anomalyAtMs,
        anomalyDurationMs,
        anomalyType,
        deadlineMs: 4_800,
      },
      expectedAnswer: {
        suspectPacketId,
        anomalyAtMs,
        anomalyDurationMs,
        deadlineMs: 4_800,
      },
    }
  }

  if (type === "TIME_FRACTURE") {
    const targetT = randomBetween(next, -0.72, 0.72)
    const layers = Array.from({ length: 5 }, (_, index) => {
      const xA = randomBetween(next, 20, 62) * (index % 2 ? -1 : 1)
      const yA = randomBetween(next, 12, 38) * (index % 3 ? 1 : -1)
      const rotA = randomBetween(next, 0.18, 0.55) * (index % 2 ? 1 : -1)
      const scaleA = randomBetween(next, 0.015, 0.055) * (index % 2 ? -1 : 1)
      return {
        colorIndex: index,
        xA,
        xB: -xA * targetT,
        yA,
        yB: -yA * targetT,
        rotA,
        rotB: -rotA * targetT,
        scaleA,
        scaleB: -scaleA * targetT,
      }
    })
    let initialT = clamp(targetT + randomBetween(next, -1.05, 1.05), -1, 1)
    if (Math.abs(initialT - targetT) < 0.22) initialT = clamp(targetT + (targetT > 0 ? -0.55 : 0.55), -1, 1)
    return {
      type,
      seed,
      publicConfig: { version: 1, initialT, minT: -1, maxT: 1, layers },
      expectedAnswer: {
        targetT,
        tolerance: 0.035,
        minDurationMs: 650,
        minScrubMoves: 5,
      },
    }
  }

  const baseFrequency = randomBetween(next, 0.23, 0.31)
  const frequencies = [
    baseFrequency,
    baseFrequency * randomBetween(next, 0.89, 0.95),
    baseFrequency * randomBetween(next, 1.06, 1.12),
  ]
  const syncAtMs = randomInt(next, 2_100, 4_100)
  const targetPhase = randomBetween(next, 0.08, 0.92)
  const syncSeconds = syncAtMs / 1000
  const phases = frequencies.map((frequency) => {
    const raw = targetPhase - frequency * syncSeconds
    return ((raw % 1) + 1) % 1
  })
  return {
    type,
    seed,
    publicConfig: {
      version: 1,
      frequencies,
      phases,
      expectedFirstWindowMs: syncAtMs,
      visualRadii: [92, 126, 160],
    },
    expectedAnswer: {
      frequencies,
      phases,
      minCoherence: 0.88,
      minElapsedMs: 650,
      maxElapsedMs: 10_000,
    },
  }
}

function telemetryScore(telemetry: HumanGuardTelemetry) {
  let score = 0
  const duration = telemetry.durationMs
  if (finite(duration) && duration >= 550 && duration <= 20_000) score += 7
  if (finite(telemetry.pointerMoves) && telemetry.pointerMoves >= 3 && telemetry.pointerMoves <= 4_000) score += 5
  if (finite(telemetry.clicks) && telemetry.clicks >= 1 && telemetry.clicks <= 20) score += 4
  if (finite(telemetry.corrections) && telemetry.corrections >= 0 && telemetry.corrections <= 500) score += 4
  return score
}

function resonanceCoherence(frequencies: number[], phases: number[], elapsedMs: number) {
  const t = elapsedMs / 1000
  const values = frequencies.map((frequency, index) => {
    const raw = phases[index] + frequency * t
    return ((raw % 1) + 1) % 1
  })
  const circularDiff = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b))
  const average = (
    circularDiff(values[0], values[1]) +
    circularDiff(values[1], values[2]) +
    circularDiff(values[2], values[0])
  ) / 3
  return clamp(1 - average / 0.16, 0, 1)
}

export function verifyHumanGuardSubmission(input: {
  type: HumanGuardChallengeType
  expectedAnswer: Record<string, unknown>
  result: Record<string, unknown>
  telemetry?: HumanGuardTelemetry
}): HumanGuardVerificationResult {
  const telemetry = input.telemetry ?? {}
  const reasons: string[] = []
  let accuracyScore = 0
  let evidence: Record<string, unknown> = {}

  if (input.type === "QUANTUM_SEAL") {
    const angles = finiteArray(input.result.angles, 3)
    const targetAngle = input.expectedAnswer.targetAngle
    const tolerance = input.expectedAnswer.tolerance
    const minDurationMs = input.expectedAnswer.minDurationMs
    const minMoves = input.expectedAnswer.minMoves
    if (!finite(targetAngle) || !finite(tolerance) || !angles) {
      reasons.push("HUMANGUARD_QUANTUM_RESULT_INVALID")
    } else {
      const errors = angles.map((angle) => circularError(angle, targetAngle))
      const maxError = Math.max(...errors)
      if (maxError > tolerance) reasons.push("HUMANGUARD_QUANTUM_ALIGNMENT_MISS")
      if (finite(minDurationMs) && (!finite(telemetry.durationMs) || telemetry.durationMs < minDurationMs)) {
        reasons.push("HUMANGUARD_INTERACTION_TOO_SHORT")
      }
      if (finite(minMoves) && (!finite(telemetry.pointerMoves) || telemetry.pointerMoves < minMoves)) {
        reasons.push("HUMANGUARD_INTERACTION_INSUFFICIENT")
      }
      accuracyScore = clamp(80 * (1 - maxError / Math.max(tolerance, 0.001)), 0, 80)
      evidence = { maxAngularError: maxError }
    }
  } else if (input.type === "PACKET_INTERCEPT") {
    const expectedId = input.expectedAnswer.suspectPacketId
    const selectedId = input.result.selectedPacketId
    const elapsedMs = input.result.elapsedMs
    const anomalyAtMs = input.expectedAnswer.anomalyAtMs
    const deadlineMs = input.expectedAnswer.deadlineMs
    if (
      !finite(expectedId) || !finite(selectedId) || !finite(elapsedMs) ||
      !finite(anomalyAtMs) || !finite(deadlineMs)
    ) {
      reasons.push("HUMANGUARD_PACKET_RESULT_INVALID")
    } else {
      if (selectedId !== expectedId) reasons.push("HUMANGUARD_PACKET_WRONG_TARGET")
      if (elapsedMs < Math.max(300, anomalyAtMs - 180) || elapsedMs > deadlineMs) {
        reasons.push("HUMANGUARD_PACKET_TIMING_INVALID")
      }
      accuracyScore = selectedId === expectedId ? 80 : 0
      evidence = { selectedPacketId: selectedId, elapsedMs }
    }
  } else if (input.type === "TIME_FRACTURE") {
    const targetT = input.expectedAnswer.targetT
    const tolerance = input.expectedAnswer.tolerance
    const position = input.result.timePosition
    const minDurationMs = input.expectedAnswer.minDurationMs
    const minScrubMoves = input.expectedAnswer.minScrubMoves
    if (!finite(targetT) || !finite(tolerance) || !finite(position)) {
      reasons.push("HUMANGUARD_TIME_RESULT_INVALID")
    } else {
      const error = Math.abs(position - targetT)
      if (error > tolerance) reasons.push("HUMANGUARD_TIME_ALIGNMENT_MISS")
      if (finite(minDurationMs) && (!finite(telemetry.durationMs) || telemetry.durationMs < minDurationMs)) {
        reasons.push("HUMANGUARD_INTERACTION_TOO_SHORT")
      }
      if (finite(minScrubMoves) && (!finite(telemetry.scrubMoves) || telemetry.scrubMoves < minScrubMoves)) {
        reasons.push("HUMANGUARD_INTERACTION_INSUFFICIENT")
      }
      accuracyScore = clamp(80 * (1 - error / Math.max(tolerance, 0.001)), 0, 80)
      evidence = { temporalError: error }
    }
  } else {
    const elapsedMs = input.result.elapsedMs
    const frequencies = finiteArray(input.expectedAnswer.frequencies, 3)
    const phases = finiteArray(input.expectedAnswer.phases, 3)
    const minCoherence = input.expectedAnswer.minCoherence
    const minElapsedMs = input.expectedAnswer.minElapsedMs
    const maxElapsedMs = input.expectedAnswer.maxElapsedMs
    if (
      !finite(elapsedMs) || !frequencies || !phases ||
      !finite(minCoherence) || !finite(minElapsedMs) || !finite(maxElapsedMs)
    ) {
      reasons.push("HUMANGUARD_RESONANCE_RESULT_INVALID")
    } else {
      const coherence = resonanceCoherence(frequencies, phases, elapsedMs)
      if (coherence < minCoherence) reasons.push("HUMANGUARD_RESONANCE_MISS")
      if (elapsedMs < minElapsedMs || elapsedMs > maxElapsedMs) reasons.push("HUMANGUARD_RESONANCE_TIMING_INVALID")
      accuracyScore = clamp(coherence * 80, 0, 80)
      evidence = { coherence, elapsedMs }
    }
  }

  const humanScore = clamp(Math.round((accuracyScore + telemetryScore(telemetry)) * 100) / 100, 0, 100)
  return {
    ok: reasons.length === 0,
    humanScore,
    reasonCodes: reasons.length ? reasons : ["HUMANGUARD_CHALLENGE_VERIFIED"],
    evidence,
  }
}
