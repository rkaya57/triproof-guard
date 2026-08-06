export type TelegramOnchainEntityKind =
  | "url"
  | "domain"
  | "wallet"
  | "token"
  | "contract"
  | "program"

export type TelegramOnchainEntity = {
  kind: TelegramOnchainEntityKind
  value: string
  chain: string | null
  confidence: number
  evidence: string
  parentUrl: string | null
}

export type TelegramStoredObservation = {
  target: string
  domain?: string | null
  scanType?: string | null
  chain?: string | null
}

const evmAddressRegex = /0x[a-fA-F0-9]{40}/g
const solanaAddressRegex = /(?<![0-9A-Za-z])([1-9A-HJ-NP-Za-km-z]{32,44})(?![0-9A-Za-z])/g
const directEvmAddressRegex = /^0x[a-fA-F0-9]{40}$/
const directSolanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const tokenContextRegex = /(?:^|[^a-z])(token|mint|asset|ca|coin)(?:[^a-z]|$)/i
const contractContextRegex = /(?:^|[^a-z])(contract|spender|router|pool|pair)(?:[^a-z]|$)/i
const programContextRegex = /(?:^|[^a-z])(program|programid|program_id)(?:[^a-z]|$)/i

function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "")
}

function normalizeEntityValue(kind: TelegramOnchainEntityKind, value: string, chain: string | null) {
  const trimmed = value.trim()
  if (kind === "domain") return normalizeDomain(trimmed)
  if (kind === "url") {
    try {
      return new URL(trimmed).toString()
    } catch {
      return trimmed
    }
  }
  if ((chain ?? "").toLowerCase() === "evm") return trimmed.toLowerCase()
  return trimmed
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function addEntity(
  entities: Map<string, TelegramOnchainEntity>,
  entity: TelegramOnchainEntity
) {
  const value = normalizeEntityValue(entity.kind, entity.value, entity.chain)
  if (!value) return
  const key = `${entity.kind}:${entity.chain ?? ""}:${value}`
  const current = entities.get(key)
  if (!current || entity.confidence > current.confidence) {
    entities.set(key, { ...entity, value })
  }
}

function classifyAddress(
  chain: "evm" | "solana",
  context: string,
  directScanType = ""
): TelegramOnchainEntityKind {
  const combined = `${directScanType} ${context}`
  if (programContextRegex.test(combined)) return "program"
  if (tokenContextRegex.test(combined)) return "token"
  if (chain === "evm" && contractContextRegex.test(combined)) return "contract"
  if (directScanType.toLowerCase().includes("token")) return "token"
  if (directScanType.toLowerCase().includes("contract")) return "contract"
  if (directScanType.toLowerCase().includes("program")) return "program"
  return chain === "evm" ? "contract" : "wallet"
}

function urlContext(url: URL) {
  const pairs: Array<{ value: string; context: string }> = []
  const decodedPath = safeDecode(url.pathname)
  pairs.push({ value: decodedPath, context: decodedPath })
  for (const [key, value] of url.searchParams.entries()) {
    pairs.push({ value, context: `${key} ${value}` })
  }
  if (url.hash) {
    const decodedHash = safeDecode(url.hash.slice(1))
    pairs.push({ value: decodedHash, context: decodedHash })
  }
  return pairs
}

function extractFromUrl(
  entities: Map<string, TelegramOnchainEntity>,
  rawUrl: string,
  scanType: string
) {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return

  const normalizedUrl = normalizeEntityValue("url", rawUrl, null)
  const domain = normalizeDomain(url.hostname)
  addEntity(entities, {
    kind: "url",
    value: normalizedUrl,
    chain: null,
    confidence: 100,
    evidence: "Telegram Guardian stored this URL as a scanned target.",
    parentUrl: null,
  })
  if (domain) {
    addEntity(entities, {
      kind: "domain",
      value: domain,
      chain: null,
      confidence: 100,
      evidence: "Domain was parsed from the stored Telegram URL.",
      parentUrl: normalizedUrl,
    })
  }

  for (const part of urlContext(url)) {
    for (const match of part.value.matchAll(evmAddressRegex)) {
      const address = match[0]
      addEntity(entities, {
        kind: classifyAddress("evm", part.context, scanType),
        value: address,
        chain: "evm",
        confidence: tokenContextRegex.test(part.context) || contractContextRegex.test(part.context) ? 95 : 82,
        evidence: "EVM address was parsed from the URL path, query, or fragment.",
        parentUrl: normalizedUrl,
      })
    }
    for (const match of part.value.matchAll(solanaAddressRegex)) {
      const address = match[1]
      if (!address) continue
      addEntity(entities, {
        kind: classifyAddress("solana", part.context, scanType),
        value: address,
        chain: "solana",
        confidence: tokenContextRegex.test(part.context) || programContextRegex.test(part.context) ? 95 : 78,
        evidence: "Solana Base58 address was parsed from the URL path, query, or fragment.",
        parentUrl: normalizedUrl,
      })
    }
  }
}

export function extractTelegramOnchainEntities(
  observation: TelegramStoredObservation
): TelegramOnchainEntity[] {
  const entities = new Map<string, TelegramOnchainEntity>()
  const target = observation.target.trim()
  const scanType = observation.scanType?.trim().toLowerCase() ?? ""
  const chain = observation.chain?.trim().toLowerCase() ?? ""

  if (/^https?:\/\//i.test(target)) {
    extractFromUrl(entities, target, scanType)
  } else if (directEvmAddressRegex.test(target)) {
    addEntity(entities, {
      kind: classifyAddress("evm", "", scanType),
      value: target,
      chain: "evm",
      confidence: 100,
      evidence: "Telegram Guardian stored this EVM address as the scanned target.",
      parentUrl: null,
    })
  } else if (directSolanaAddressRegex.test(target)) {
    addEntity(entities, {
      kind: classifyAddress("solana", "", scanType),
      value: target,
      chain: "solana",
      confidence: 100,
      evidence: "Telegram Guardian stored this Solana address as the scanned target.",
      parentUrl: null,
    })
  }

  if (observation.domain) {
    addEntity(entities, {
      kind: "domain",
      value: observation.domain,
      chain: null,
      confidence: 100,
      evidence: "Domain was stored with the Telegram scan result.",
      parentUrl: /^https?:\/\//i.test(target)
        ? normalizeEntityValue("url", target, null)
        : null,
    })
  }

  if (chain === "evm" || chain === "solana") {
    for (const entity of entities.values()) {
      if (!entity.chain && ["wallet", "token", "contract", "program"].includes(entity.kind)) {
        entity.chain = chain
      }
    }
  }

  return Array.from(entities.values()).sort((a, b) => {
    const kindCompare = a.kind.localeCompare(b.kind)
    return kindCompare || a.value.localeCompare(b.value)
  })
}

export function telegramObservationMatchesCampaign(
  entities: TelegramOnchainEntity[],
  campaignAddresses: Iterable<string>
) {
  const exact = new Set<string>()
  for (const value of campaignAddresses) {
    const trimmed = value.trim()
    if (!trimmed) continue
    exact.add(trimmed)
    if (directEvmAddressRegex.test(trimmed)) exact.add(trimmed.toLowerCase())
  }

  return entities.some((entity) => {
    if (!["wallet", "token", "contract", "program"].includes(entity.kind)) return false
    const value = entity.chain === "evm" ? entity.value.toLowerCase() : entity.value
    return exact.has(value)
  })
}
