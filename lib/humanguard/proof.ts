import { randomBytes } from "node:crypto"
import { SignJWT, jwtVerify } from "jose"

export type HumanGuardProofClaims = {
  tokenId: string
  siteId: string
  sessionId: string
  action: string
  origin: string
  walletAddress: string | null
  walletChain: string | null
  challengeType: string
  humanScore: number
  expiresAt: Date
}

const issuer = "triproof-humanguard"

function secretKey(secret: string) {
  return new TextEncoder().encode(secret)
}

export function createHumanGuardTokenId() {
  return `hg_${randomBytes(18).toString("base64url")}`
}

export async function signHumanGuardProof(claims: HumanGuardProofClaims, secret: string) {
  const issuedAt = Math.floor(Date.now() / 1000)
  const expiresAt = Math.floor(claims.expiresAt.getTime() / 1000)

  return new SignJWT({
    siteId: claims.siteId,
    sessionId: claims.sessionId,
    action: claims.action,
    origin: claims.origin,
    walletAddress: claims.walletAddress,
    walletChain: claims.walletChain,
    challengeType: claims.challengeType,
    humanScore: claims.humanScore,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(claims.siteId)
    .setSubject(claims.sessionId)
    .setJti(claims.tokenId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(secretKey(secret))
}

export async function verifyHumanGuardProofToken(token: string, secret: string) {
  const verified = await jwtVerify(token, secretKey(secret), {
    issuer,
    algorithms: ["HS256"],
  })

  const payload = verified.payload
  if (
    typeof payload.jti !== "string" ||
    typeof payload.siteId !== "string" ||
    typeof payload.sessionId !== "string" ||
    typeof payload.action !== "string" ||
    typeof payload.origin !== "string" ||
    typeof payload.challengeType !== "string" ||
    typeof payload.humanScore !== "number"
  ) {
    throw new Error("Invalid HumanGuard proof payload")
  }

  const audience = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud
  if (audience !== payload.siteId) throw new Error("HumanGuard proof audience mismatch")

  return {
    tokenId: payload.jti,
    siteId: payload.siteId,
    sessionId: payload.sessionId,
    action: payload.action,
    origin: payload.origin,
    walletAddress: typeof payload.walletAddress === "string" ? payload.walletAddress : null,
    walletChain: typeof payload.walletChain === "string" ? payload.walletChain : null,
    challengeType: payload.challengeType,
    humanScore: payload.humanScore,
    expiresAt: typeof payload.exp === "number" ? new Date(payload.exp * 1000) : null,
  }
}
