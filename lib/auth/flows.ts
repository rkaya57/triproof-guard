import { sendAuthEmail } from "@/lib/auth/email"
import {
  createOpaqueToken,
  hashOpaqueToken,
} from "@/lib/auth/security"
import {
  createAuthToken,
  revokeActiveTokens,
  type AuthUserRecord,
} from "@/lib/auth/store"

export async function issueEmailVerification(
  user: Pick<AuthUserRecord, "id" | "email" | "name">,
  redirectTo = "/onboarding"
) {
  await revokeActiveTokens(user.id, "EMAIL_VERIFY")
  const token = createOpaqueToken()
  const tokenId = await createAuthToken({
    userId: user.id,
    type: "EMAIL_VERIFY",
    tokenHash: hashOpaqueToken(token),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    metadata: { email: user.email },
  })
  const delivery = await sendAuthEmail({
    kind: "verify-email",
    to: user.email,
    name: user.name,
    token,
    redirectTo,
    idempotencyKey: `verify-${tokenId}`,
  })
  return delivery
}

export async function issuePasswordReset(
  user: Pick<AuthUserRecord, "id" | "email" | "name">
) {
  await revokeActiveTokens(user.id, "PASSWORD_RESET")
  const token = createOpaqueToken()
  const tokenId = await createAuthToken({
    userId: user.id,
    type: "PASSWORD_RESET",
    tokenHash: hashOpaqueToken(token),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    metadata: { email: user.email },
  })
  const delivery = await sendAuthEmail({
    kind: "reset-password",
    to: user.email,
    name: user.name,
    token,
    idempotencyKey: `reset-${tokenId}`,
  })
  return delivery
}
