import { db } from "@/lib/db/prisma"
import { extensionBearerToken, verifyExtensionAccessToken, type ExtensionTokenClaims } from "@/lib/extension/auth"

export async function getExtensionSession(request: Request): Promise<(ExtensionTokenClaims & { user: { id: string; name: string; email: string } }) | null> {
  const token = extensionBearerToken(request)
  if (!token) return null
  const claims = await verifyExtensionAccessToken(token)
  if (!claims) return null

  const connection = await db.extensionConnectRequest.findUnique({
    where: { id: claims.requestId },
    select: {
      userId: true,
      status: true,
      extensionTokenId: true,
      extensionTokenExpiresAt: true,
      revokedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  })
  if (
    !connection ||
    connection.status !== "APPROVED" ||
    connection.userId !== claims.userId ||
    connection.extensionTokenId !== claims.tokenId ||
    connection.revokedAt ||
    !connection.extensionTokenExpiresAt ||
    connection.extensionTokenExpiresAt <= new Date() ||
    !connection.user
  ) {
    return null
  }
  return { ...claims, user: connection.user }
}
