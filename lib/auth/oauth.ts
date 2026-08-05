import { createHash, randomBytes } from "node:crypto"

import { hashPassword } from "@/lib/auth/password"
import { safePostAuthPath } from "@/lib/auth/redirects"
import {
  authAppUrl,
  createOpaqueToken,
  hashOpaqueToken,
} from "@/lib/auth/security"
import {
  consumeAuthToken,
  createAuthToken,
  createAuthUser,
  findAuthUserByEmail,
  findAuthUserById,
  findUserByExternalAccount,
  upsertExternalAccount,
} from "@/lib/auth/store"

export type OAuthProviderName = "google" | "discord"
export type OAuthIntent = "login" | "register"

type OAuthProviderConfig = {
  name: OAuthProviderName
  clientId: string
  clientSecret: string
  authorizationEndpoint: string
  tokenEndpoint: string
  userEndpoint: string
  scopes: string[]
}

type OAuthProfile = {
  providerAccountId: string
  email: string
  name: string
  emailVerified: boolean
}

function providerConfig(provider: OAuthProviderName): OAuthProviderConfig | null {
  if (provider === "google") {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
    if (!clientId || !clientSecret) return null
    return {
      name: provider,
      clientId,
      clientSecret,
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      userEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
      scopes: ["openid", "email", "profile"],
    }
  }

  const clientId = process.env.DISCORD_CLIENT_ID?.trim()
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return {
    name: provider,
    clientId,
    clientSecret,
    authorizationEndpoint: "https://discord.com/oauth2/authorize",
    tokenEndpoint: "https://discord.com/api/oauth2/token",
    userEndpoint: "https://discord.com/api/users/@me",
    scopes: ["identify", "email"],
  }
}

export function configuredOAuthProviders() {
  return (["google", "discord"] as const).filter((provider) => Boolean(providerConfig(provider)))
}

export function parseOAuthProvider(value: string): OAuthProviderName | null {
  return value === "google" || value === "discord" ? value : null
}

function redirectUri(provider: OAuthProviderName) {
  return `${authAppUrl()}/api/auth/oauth/${provider}/callback`
}

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url")
}

export async function beginOAuth(input: {
  provider: OAuthProviderName
  intent: OAuthIntent
  redirectTo?: string
  termsAccepted?: boolean
}) {
  const config = providerConfig(input.provider)
  if (!config) throw new Error("OAuth provider is not configured.")
  if (input.intent === "register" && !input.termsAccepted) {
    throw new Error("Terms and privacy acceptance are required to create an account.")
  }

  const state = createOpaqueToken()
  const codeVerifier = randomBytes(48).toString("base64url")
  await createAuthToken({
    type: "OAUTH_STATE",
    tokenHash: hashOpaqueToken(state),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    metadata: {
      provider: input.provider,
      intent: input.intent,
      redirectTo: safePostAuthPath(input.redirectTo),
      codeVerifier,
      termsAccepted: Boolean(input.termsAccepted),
    },
  })

  const url = new URL(config.authorizationEndpoint)
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("redirect_uri", redirectUri(input.provider))
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", config.scopes.join(" "))
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", pkceChallenge(codeVerifier))
  url.searchParams.set("code_challenge_method", "S256")
  if (input.provider === "google") {
    url.searchParams.set("prompt", "select_account")
    url.searchParams.set("access_type", "online")
  } else {
    url.searchParams.set("prompt", "consent")
  }
  return url.toString()
}

async function exchangeCode(
  config: OAuthProviderConfig,
  code: string,
  codeVerifier: string
) {
  const form = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(config.name),
    code_verifier: codeVerifier,
  })
  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(10_000),
  })
  const token = (await response.json().catch(() => null)) as { access_token?: string } | null
  if (!response.ok || !token?.access_token) throw new Error("OAuth token exchange failed.")
  return token.access_token
}

async function loadProfile(config: OAuthProviderConfig, accessToken: string): Promise<OAuthProfile> {
  const response = await fetch(config.userEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  })
  const raw = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok || !raw) throw new Error("OAuth profile could not be loaded.")

  if (config.name === "google") {
    const id = typeof raw.sub === "string" ? raw.sub : ""
    const email = typeof raw.email === "string" ? raw.email : ""
    const name = typeof raw.name === "string" ? raw.name : email.split("@")[0]
    if (!id || !email || raw.email_verified !== true) throw new Error("Google email is not verified.")
    return { providerAccountId: id, email, name, emailVerified: true }
  }

  const id = typeof raw.id === "string" ? raw.id : ""
  const email = typeof raw.email === "string" ? raw.email : ""
  const globalName = typeof raw.global_name === "string" ? raw.global_name : ""
  const username = typeof raw.username === "string" ? raw.username : ""
  if (!id || !email || raw.verified !== true) throw new Error("Discord email is not verified.")
  return { providerAccountId: id, email, name: globalName || username || email.split("@")[0], emailVerified: true }
}

export async function completeOAuth(input: {
  provider: OAuthProviderName
  code: string
  state: string
}) {
  const config = providerConfig(input.provider)
  if (!config) throw new Error("OAuth provider is not configured.")
  const stateToken = await consumeAuthToken({
    tokenHash: hashOpaqueToken(input.state),
    type: "OAUTH_STATE",
    maxAttempts: 1,
  })
  const metadata = stateToken?.metadata
  if (
    !metadata ||
    metadata.provider !== input.provider ||
    (metadata.intent !== "login" && metadata.intent !== "register") ||
    typeof metadata.codeVerifier !== "string"
  ) {
    throw new Error("OAuth state is invalid or expired.")
  }

  const accessToken = await exchangeCode(config, input.code, metadata.codeVerifier)
  const profile = await loadProfile(config, accessToken)
  const linkedUserId = await findUserByExternalAccount(input.provider, profile.providerAccountId)
  let user = linkedUserId ? await findAuthUserById(linkedUserId) : await findAuthUserByEmail(profile.email)

  if (!user) {
    if (metadata.intent !== "register" || metadata.termsAccepted !== true) {
      throw new Error("No account is linked to this provider. Create an account first.")
    }
    const now = new Date()
    user = await createAuthUser({
      name: profile.name,
      email: profile.email,
      passwordHash: await hashPassword(createOpaqueToken(48)),
      termsAcceptedAt: now,
      privacyAcceptedAt: now,
      emailVerifiedAt: now,
    })
  }
  if (!user) throw new Error("OAuth account could not be created.")

  await upsertExternalAccount({
    userId: user.id,
    provider: input.provider,
    providerAccountId: profile.providerAccountId,
    email: profile.email,
  })
  return {
    user,
    redirectTo: user.onboardingCompletedAt
      ? safePostAuthPath(metadata.redirectTo)
      : `/onboarding?next=${encodeURIComponent(safePostAuthPath(metadata.redirectTo))}`,
  }
}
