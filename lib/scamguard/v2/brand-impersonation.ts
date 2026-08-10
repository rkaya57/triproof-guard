export type BrandImpersonationFinding = {
  brand: string
  officialDomains: string[]
  observedHost: string
  observedLabel: string
  normalizedLabel: string
  matchType: "homoglyph" | "typosquat" | "embedded_brand"
  confidence: "medium" | "high"
  distance?: number
  note: string
}

const brandRegistry = [
  { brand: "phantom", domains: ["phantom.app"] },
  { brand: "solflare", domains: ["solflare.com"] },
  { brand: "jupiter", domains: ["jup.ag", "jupiter.ag"] },
  { brand: "magiceden", domains: ["magiceden.io"] },
  { brand: "tensor", domains: ["tensor.trade"] },
  { brand: "backpack", domains: ["backpack.app"] },
  { brand: "triproof", domains: ["triproofprotocol.com"] },
] as const

const confusables: Record<string, string> = {
  "а": "a", "ɑ": "a", "α": "a",
  "е": "e", "ε": "e",
  "і": "i", "ι": "i", "ӏ": "i",
  "о": "o", "ο": "o", "օ": "o",
  "р": "p", "ρ": "p",
  "с": "c", "ϲ": "c",
  "х": "x", "χ": "x",
  "у": "y", "γ": "y",
  "к": "k", "κ": "k",
  "м": "m", "м": "m",
  "т": "t", "τ": "t",
  "в": "b", "β": "b",
  "ѕ": "s",
  "ӏ": "l", "ⅼ": "l", "Ι": "l",
}

function hostOnly(value: string) {
  try {
    const url = value.includes("://") ? new URL(value) : new URL(`https://${value}`)
    return url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "")
  } catch {
    return ""
  }
}

function labels(host: string) {
  return host.split(".").filter(Boolean)
}

function skeleton(value: string) {
  return Array.from(value.normalize("NFKC").toLowerCase())
    .map((character) => confusables[character] ?? character)
    .join("")
    .replace(/[^a-z0-9-]/g, "")
}

function editDistance(left: string, right: string) {
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  const current = new Array<number>(right.length + 1)
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      )
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j]
  }
  return previous[right.length]
}

function isOfficialHost(host: string, domains: readonly string[]) {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
}

export function detectBrandImpersonation(value: string): BrandImpersonationFinding[] {
  const host = hostOnly(value)
  if (!host) return []
  const hostLabels = labels(host)
  const findings: BrandImpersonationFinding[] = []

  for (const entry of brandRegistry) {
    if (isOfficialHost(host, entry.domains)) continue
    for (const observedLabel of hostLabels) {
      const normalizedLabel = skeleton(observedLabel)
      if (!normalizedLabel) continue
      const brand = entry.brand
      const rawLower = observedLabel.toLowerCase()
      const changedBySkeleton = normalizedLabel !== rawLower.replace(/[^a-z0-9-]/g, "")

      if (normalizedLabel === brand && changedBySkeleton) {
        findings.push({
          brand,
          officialDomains: [...entry.domains],
          observedHost: host,
          observedLabel,
          normalizedLabel,
          matchType: "homoglyph",
          confidence: "high",
          note: `A Unicode lookalike label normalizes to the ${brand} brand while the host is outside official domains.`,
        })
        break
      }

      const distance = editDistance(normalizedLabel.replace(/-/g, ""), brand)
      if (distance === 1 && normalizedLabel.length >= Math.max(4, brand.length - 1)) {
        findings.push({
          brand,
          officialDomains: [...entry.domains],
          observedHost: host,
          observedLabel,
          normalizedLabel,
          matchType: "typosquat",
          confidence: "high",
          distance,
          note: `A hostname label is one edit away from the ${brand} brand while using a non-official domain.`,
        })
        break
      }

      if (normalizedLabel !== brand && normalizedLabel.includes(brand) && /(?:claim|airdrop|wallet|verify|secure|login|app|support)/.test(normalizedLabel.replace(brand, ""))) {
        findings.push({
          brand,
          officialDomains: [...entry.domains],
          observedHost: host,
          observedLabel,
          normalizedLabel,
          matchType: "embedded_brand",
          confidence: "medium",
          note: `A non-official hostname embeds the ${brand} brand together with a security, wallet, or claim lure term.`,
        })
        break
      }
    }
  }

  return findings.slice(0, 4)
}
