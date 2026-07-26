export type SecretGroup = {
  name: string
  aliases?: string[]
  purpose: string
}

const devSecretOptIn = "DEV_ALLOW_INSECURE_SECRETS"

export const requiredProductionSecretGroups: Record<string, SecretGroup> = {
  session: {
    name: "NEXTAUTH_SECRET",
    purpose: "session token signing",
  },
  accessPass: {
    name: "ACCESS_PASS_SIGNING_SECRET",
    purpose: "access pass cookie signing",
  },
  worker: {
    name: "WORKER_SECRET",
    aliases: ["ANALYSIS_WORKER_SECRET", "CRON_SECRET"],
    purpose: "background worker authorization",
  },
}

function isProduction() {
  return process.env.NODE_ENV === "production"
}

export function allowsInsecureDevSecrets() {
  return !isProduction() && process.env[devSecretOptIn] === "true"
}

function readSecret(name: string) {
  const value = process.env[name]?.trim()
  return value ? value : null
}

function displayNames(group: SecretGroup) {
  return [group.name, ...(group.aliases ?? [])].join(" or ")
}

function missingSecretError(group: SecretGroup) {
  const names = displayNames(group)
  const devHint = isProduction()
    ? ""
    : ` For local development only, set ${devSecretOptIn}=true to use the explicit insecure dev fallback.`
  return new Error(
    `Missing required secret for ${group.purpose}: ${names}.${devHint}`
  )
}

export function requireSecret(
  group: SecretGroup,
  {
    devFallback,
  }: {
    devFallback?: string
  } = {}
) {
  const names = [group.name, ...(group.aliases ?? [])]
  for (const name of names) {
    const value = readSecret(name)
    if (value) return value
  }

  if (allowsInsecureDevSecrets() && devFallback) return devFallback

  throw missingSecretError(group)
}

export function requireAnyConfiguredSecret(
  group: SecretGroup,
  {
    allowInsecureDevMissing = false,
  }: {
    allowInsecureDevMissing?: boolean
  } = {}
) {
  const values = [group.name, ...(group.aliases ?? [])]
    .map(readSecret)
    .filter((value): value is string => Boolean(value))

  if (values.length) return values
  if (allowInsecureDevMissing && allowsInsecureDevSecrets()) return []

  throw missingSecretError(group)
}

export function getSessionSigningSecret() {
  return requireSecret(requiredProductionSecretGroups.session, {
    devFallback: "development-secret-change-me",
  })
}

export function getAccessPassSigningSecret() {
  return requireSecret(requiredProductionSecretGroups.accessPass, {
    devFallback: "development-access-pass-secret-change-me",
  })
}

export function configuredProductionSecretStatus() {
  return Object.values(requiredProductionSecretGroups).map((group) => {
    const names = [group.name, ...(group.aliases ?? [])]
    const configured = names.some((name) => Boolean(readSecret(name)))
    return {
      name: group.name,
      aliases: group.aliases ?? [],
      purpose: group.purpose,
      configured,
      displayName: displayNames(group),
    }
  })
}
