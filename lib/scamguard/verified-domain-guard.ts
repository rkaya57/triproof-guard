import type { ScamGuardRiskLevel, ScamGuardScanResult, ScamGuardSignal } from "@/lib/scamguard/engine"

const verifiedCurrentWeb3Domains = new Set([
  "phantom.com",
  "metamask.io",
  "uniswap.org",
  "raydium.io",
])

const nonDowngradableCodes = new Set([
  "KNOWN_SCAM_DOMAIN",
  "EXTERNAL_THREAT_FEED_DOMAIN",
  "ADMIN_SUSPICIOUS_DOMAIN",
  "URL_CREDENTIALS_OBFUSCATION",
  "PUNYCODE_DOMAIN",
  "SENSITIVE_REDIRECT_PARAMETER",
  "ENCODED_CLAIM_PAYLOAD",
  "SECRET_MATERIAL_REQUEST",
  "EXTENSION_SEED_PHRASE_FORM",
  "EXTENSION_PRIVATE_KEY_FORM",
])

const heuristicOnlyCodes = new Set([
  "BRAND_IMPERSONATION",
  "TYPOSQUATTING_PATTERN",
  "CLAIM_LANGUAGE",
  "UNVERIFIED_CLAIM_DOMAIN",
  "UNVERIFIED_PROJECT_CONTEXT",
  "UNVERIFIED_WEB3_APP_SURFACE",
  "SUSPICIOUS_TLD_CLAIM",
  "DRAINER_PATTERN",
  "DEEP_SUBDOMAIN_REWARD_LINK",
])

function hostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return null
  }
}

function domainMatches(domain: string, root: string) {
  return domain === root || domain.endsWith(`.${root}`)
}

function isVerifiedCurrentDomain(value: string) {
  const host = hostname(value)
  if (!host) return false
  return [...verifiedCurrentWeb3Domains].some((root) => domainMatches(host, root))
}

function heuristicRiskSignal(signal: ScamGuardSignal) {
  return heuristicOnlyCodes.has(signal.code)
}

function stopLevelSignal(signal: ScamGuardSignal) {
  if (nonDowngradableCodes.has(signal.code)) return true
  if (signal.severity === "critical") return true
  return signal.severity === "high" && !heuristicRiskSignal(signal)
}

function riskLevel(score: number): ScamGuardRiskLevel {
  if (score >= 86) return "CRITICAL"
  if (score >= 61) return "HIGH_RISK"
  if (score >= 31) return "CAUTION"
  return "SAFE"
}

/**
 * Narrow production guard for verified project domains that migrated or were
 * missing from the historical V1 registry. It never overrides threat intel,
 * explicit browser stop signals, or non-heuristic medium/high evidence.
 */
export function applyVerifiedDomainFalsePositiveGuard(value: string, result: ScamGuardScanResult): ScamGuardScanResult {
  if (result.type !== "url" || !isVerifiedCurrentDomain(value)) return result
  if (result.metadata.reputation?.verdict === "known_bad" || result.metadata.reputation?.verdict === "suspicious") return result
  if (result.signals.some(stopLevelSignal)) return result

  const riskSignals = result.signals.filter((signal) => signal.severity !== "info")
  if (!riskSignals.length || !riskSignals.every(heuristicRiskSignal)) return result

  const keptSignals = result.signals.filter((signal) => !heuristicRiskSignal(signal))
  const renderedSignals = [
    ...keptSignals,
    {
      code: "CURRENT_VERIFIED_PROJECT_DOMAIN",
      severity: "info" as const,
      title: "Current verified project domain",
      detail: "The hostname matches a currently verified official Web3 project domain. Registry-gap heuristics were suppressed, but threat-intelligence and wallet-intent checks remain authoritative.",
    },
  ]
  const score = Math.min(result.score, 22)
  const level = riskLevel(score)

  return {
    ...result,
    score,
    riskLevel: level,
    summary: level === "SAFE"
      ? "No stop-level risk surfaced on this verified project domain. Still confirm the wallet prompt before signing."
      : result.summary,
    signals: renderedSignals,
    metadata: {
      ...result.metadata,
      reputation: {
        verdict: "trusted",
        source: "verified-current-domain-registry",
        notes: ["The hostname matched a currently verified official Web3 project domain. Threat-intelligence and explicit browser stop signals are never overridden by this trust context."],
      },
      decision: {
        primaryReason: "Current verified project domain",
        trustContext: "The source is currently verified, but wallet intent and independent threat intelligence still control stop-level decisions.",
        riskDrivers: [],
        userMessage: "The site domain is verified. Continue only if the wallet prompt matches the action you intended.",
      },
    },
  }
}

export function isCurrentVerifiedWeb3Domain(value: string) {
  return isVerifiedCurrentDomain(value)
}
