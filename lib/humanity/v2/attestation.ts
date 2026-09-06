import { createHash } from "node:crypto"
import { importJWK, jwtVerify, type JWK } from "jose"
import { z } from "zod"

import { normalizeWalletAddress } from "./core"

const HUMANITY_ATTESTATION_CLAIM = "https://triproofprotocol.com/humanity/v2"
const SUPPORTED_ALGORITHMS = ["ES256", "EdDSA", "RS256"] as const

const attestationClaimSchema = z.object({
  sessionId: z.string().min(1).max(200),
  campaignId: z.string().min(1).max(200),
  nonce: z.string().min(32).max(256),
  walletAddress: z.string().min(10).max(200),
  walletChain: z.string().min(1).max(32).nullable().optional(),
  passed: z.boolean(),
  livenessScore: z.number().finite().min(0).max(100),
  antiSpoofScore: z.number().finite().min(0).max(100),
  providerSessionId: z.string().min(1).max(300).optional(),
})

export type HumanityAttestationConfig = {
  publicJwk: JWK
  issuer: string
  audience: string
  minLivenessScore?: number
  minAntiSpoofScore?: number
}

export type HumanityAttestationExpectation = {
  sessionId: string
  campaignId: string
  nonce: string
  walletAddress: string
  walletChain?: string | null
}

export type VerifiedHumanityAttestation = {
  verified: true
  issuer: string
  jtiHash: string
  providerSessionId?: string
  passed: boolean
  livenessScore: number
  antiSpoofScore: number
}

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim()
  return value ? value : null
}

function parsePublicJwk(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown
    return z.record(z.string(), z.unknown()).parse(parsed) as JWK
  } catch {
    throw new Error("HUMANITY_ATTESTATION_PUBLIC_JWK must contain a valid public JWK JSON object")
  }
}

export function getHumanityAttestationConfigFromEnv(): HumanityAttestationConfig | null {
  const rawJwk = readOptionalEnv("HUMANITY_ATTESTATION_PUBLIC_JWK")
  const issuer = readOptionalEnv("HUMANITY_ATTESTATION_ISSUER")
  const audience = readOptionalEnv("HUMANITY_ATTESTATION_AUDIENCE")
  const configuredCount = [rawJwk, issuer, audience].filter(Boolean).length

  if (configuredCount === 0) return null
  if (configuredCount !== 3 || !rawJwk || !issuer || !audience) {
    throw new Error(
      "Humanity attestation is partially configured. Set HUMANITY_ATTESTATION_PUBLIC_JWK, HUMANITY_ATTESTATION_ISSUER and HUMANITY_ATTESTATION_AUDIENCE together."
    )
  }

  return {
    publicJwk: parsePublicJwk(rawJwk),
    issuer,
    audience,
    minLivenessScore: 80,
    minAntiSpoofScore: 80,
  }
}

function tokenIdentifierHash(jti: string, issuer: string) {
  return createHash("sha256").update(`${issuer}:${jti}`).digest("hex").slice(0, 24)
}

function assertExpectedBinding(
  claim: z.infer<typeof attestationClaimSchema>,
  expected: HumanityAttestationExpectation
) {
  if (claim.sessionId !== expected.sessionId) throw new Error("Attestation session does not match Humanity session")
  if (claim.campaignId !== expected.campaignId) throw new Error("Attestation campaign does not match Humanity campaign")
  if (claim.nonce !== expected.nonce) throw new Error("Attestation nonce does not match server-issued Humanity nonce")

  const expectedWallet = normalizeWalletAddress(expected.walletAddress, expected.walletChain)
  const claimedWallet = normalizeWalletAddress(claim.walletAddress, claim.walletChain ?? expected.walletChain)
  if (expectedWallet !== claimedWallet) throw new Error("Attestation wallet does not match Humanity wallet")

  const expectedChain = (expected.walletChain ?? "").trim().toLowerCase()
  const claimedChain = (claim.walletChain ?? expected.walletChain ?? "").trim().toLowerCase()
  if (expectedChain && claimedChain && expectedChain !== claimedChain) {
    throw new Error("Attestation wallet chain does not match Humanity session")
  }
}

export async function verifyHumanityAttestationToken({
  token,
  expected,
  config,
}: {
  token: string
  expected: HumanityAttestationExpectation
  config?: HumanityAttestationConfig | null
}): Promise<VerifiedHumanityAttestation> {
  const effectiveConfig = config === undefined ? getHumanityAttestationConfigFromEnv() : config
  if (!effectiveConfig) throw new Error("Humanity provider attestation is not configured")

  const algorithm = typeof effectiveConfig.publicJwk.alg === "string" ? effectiveConfig.publicJwk.alg : undefined
  if (algorithm && !SUPPORTED_ALGORITHMS.includes(algorithm as (typeof SUPPORTED_ALGORITHMS)[number])) {
    throw new Error(`Unsupported Humanity attestation JWK algorithm: ${algorithm}`)
  }

  const key = await importJWK(effectiveConfig.publicJwk, algorithm)
  const { payload, protectedHeader } = await jwtVerify(token, key, {
    issuer: effectiveConfig.issuer,
    audience: effectiveConfig.audience,
    algorithms: [...SUPPORTED_ALGORITHMS],
    clockTolerance: 5,
  })

  if (!protectedHeader.alg || !SUPPORTED_ALGORITHMS.includes(protectedHeader.alg as (typeof SUPPORTED_ALGORITHMS)[number])) {
    throw new Error("Humanity attestation used an unsupported signing algorithm")
  }
  if (!payload.jti || typeof payload.jti !== "string") throw new Error("Humanity attestation must include jti")
  if (!payload.iat || typeof payload.iat !== "number") throw new Error("Humanity attestation must include iat")
  if (!payload.exp || typeof payload.exp !== "number") throw new Error("Humanity attestation must include exp")
  if (payload.exp - payload.iat > 10 * 60) throw new Error("Humanity attestation lifetime must not exceed 10 minutes")

  const parsedClaim = attestationClaimSchema.safeParse(payload[HUMANITY_ATTESTATION_CLAIM])
  if (!parsedClaim.success) throw new Error("Humanity attestation claim payload is invalid")
  assertExpectedBinding(parsedClaim.data, expected)

  const minLiveness = effectiveConfig.minLivenessScore ?? 80
  const minAntiSpoof = effectiveConfig.minAntiSpoofScore ?? 80
  if (!parsedClaim.data.passed) throw new Error("Liveness provider did not pass the Humanity session")
  if (parsedClaim.data.livenessScore < minLiveness) throw new Error("Liveness provider score is below the configured threshold")
  if (parsedClaim.data.antiSpoofScore < minAntiSpoof) throw new Error("Anti-spoof provider score is below the configured threshold")

  return {
    verified: true,
    issuer: effectiveConfig.issuer,
    jtiHash: tokenIdentifierHash(payload.jti, effectiveConfig.issuer),
    providerSessionId: parsedClaim.data.providerSessionId,
    passed: parsedClaim.data.passed,
    livenessScore: Math.round(parsedClaim.data.livenessScore),
    antiSpoofScore: Math.round(parsedClaim.data.antiSpoofScore),
  }
}

export { HUMANITY_ATTESTATION_CLAIM }
