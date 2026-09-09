import {
  consumeHumanityRateLimit,
  deriveHumanityNetworkSubject,
  type HumanityAbuseAction,
  type HumanityRateLimitRule,
} from "@/lib/humanity/v2/abuse-defense"

const MINUTE = 60_000

export async function enforceHumanGuardRateLimit(input: {
  request: Request
  siteId: string
  action: "CHALLENGE_START" | "SUBMIT"
  secret: string
  wallet?: string | null
  sessionId?: string | null
}) {
  const network = deriveHumanityNetworkSubject(input.request, input.secret)
  const rules: HumanityRateLimitRule[] = []

  if (input.action === "CHALLENGE_START") {
    rules.push({ dimension: "principal", subject: input.siteId, limit: 5_000, windowMs: 10 * MINUTE })
    if (network) rules.push({ dimension: "network", subject: `${input.siteId}:${network}`, limit: 40, windowMs: 10 * MINUTE })
    if (input.wallet) rules.push({ dimension: "wallet", subject: `${input.siteId}:${input.wallet}`, limit: 12, windowMs: 60 * MINUTE })
  } else {
    rules.push({ dimension: "principal", subject: input.siteId, limit: 10_000, windowMs: 10 * MINUTE })
    if (network) rules.push({ dimension: "network", subject: `${input.siteId}:${network}`, limit: 80, windowMs: 10 * MINUTE })
    if (input.sessionId) rules.push({ dimension: "session", subject: input.sessionId, limit: 5, windowMs: 10 * MINUTE })
  }

  for (const rule of rules) {
    const result = await consumeHumanityRateLimit({
      action: input.action as HumanityAbuseAction,
      rule,
      secret: input.secret,
    })
    if (!result.allowed) return result
  }

  return null
}
