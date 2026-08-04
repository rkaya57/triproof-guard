import { jwtVerify, SignJWT } from "jose"

import { getSessionSigningSecret } from "@/lib/env/validation"

const extensionAudience = "tri-proof-extension"
const extensionTokenLifetime = "30d"

function secretKey() {
  return new TextEncoder().encode(getSessionSigningSecret())
}

export type ExtensionTokenClaims = {
  userId: string
  requestId: string
  tokenId: string
}

export async function createExtensionAccessToken(claims: ExtensionTokenClaims) {
  return new SignJWT({ requestId: claims.requestId, tokenId: claims.tokenId, scope: "extension_access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setAudience(extensionAudience)
    .setIssuedAt()
    .setExpirationTime(extensionTokenLifetime)
    .sign(secretKey())
}

export async function verifyExtensionAccessToken(token: string): Promise<ExtensionTokenClaims | null> {
  try {
    const verified = await jwtVerify(token, secretKey(), { audience: extensionAudience })
    const userId = verified.payload.sub
    const requestId = verified.payload.requestId
    const tokenId = verified.payload.tokenId
    if (
      typeof userId !== "string" ||
      typeof requestId !== "string" ||
      typeof tokenId !== "string" ||
      verified.payload.scope !== "extension_access"
    ) {
      return null
    }
    return { userId, requestId, tokenId }
  } catch {
    return null
  }
}

export function extensionBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? ""
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}
