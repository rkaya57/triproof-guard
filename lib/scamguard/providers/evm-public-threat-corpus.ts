export type EvmThreatCorpusSource = "real-cats" | "rug-pull-dataset" | "mew-darklist"

export type EvmPublicThreatCorpusEvidence = {
  status: "available" | "unavailable" | "disabled"
  source: "evm-public-threat-corpus"
  address: string
  matched: boolean
  matchedSources: EvmThreatCorpusSource[]
  availableSources: EvmThreatCorpusSource[]
  independentSourceCount: number
  checkedAt: string
  error?: string
}

type CorpusCache = {
  expiresAt: number
  sources: Record<EvmThreatCorpusSource, Set<string>>
  availableSources: EvmThreatCorpusSource[]
}

type CorpusConfig = {
  enabled: boolean
  timeoutMs: number
  ttlMs: number
  urls: Record<EvmThreatCorpusSource, string>
}

let corpusCache: CorpusCache | null = null

const evmAddressPattern = /^0x[a-fA-F0-9]{40}$/
const defaultTimeoutMs = 5_000
const defaultTtlMs = 60 * 60 * 1000
const maxTtlMs = 60 * 60 * 1000
const maxCorpusBytes = 12 * 1024 * 1024

const defaultUrls: Record<EvmThreatCorpusSource, string> = {
  "real-cats": "https://raw.githubusercontent.com/sjdseu/Real-CATS/master/CE.tsv",
  "rug-pull-dataset": "https://raw.githubusercontent.com/dianxiang-sun/rug_pull_dataset/main/rugpull_full_dataset_new.csv",
  "mew-darklist": "https://raw.githubusercontent.com/MyEtherWallet/ethereum-lists/master/src/addresses/addresses-darklist.json",
}

function config(): CorpusConfig {
  const enabled = (process.env.EVM_PUBLIC_THREAT_CORPUS_ENABLED ?? "true").trim().toLowerCase() !== "false"
  const timeoutMs = Math.max(500, Number(process.env.EVM_PUBLIC_THREAT_CORPUS_TIMEOUT_MS ?? defaultTimeoutMs) || defaultTimeoutMs)
  const requestedTtl = Number(process.env.EVM_PUBLIC_THREAT_CORPUS_CACHE_TTL_MS ?? defaultTtlMs) || defaultTtlMs
  const ttlMs = Math.max(60_000, Math.min(requestedTtl, maxTtlMs))
  return {
    enabled,
    timeoutMs,
    ttlMs,
    urls: {
      "real-cats": process.env.EVM_REAL_CATS_FEED_URL?.trim() || defaultUrls["real-cats"],
      "rug-pull-dataset": process.env.EVM_RUG_PULL_FEED_URL?.trim() || defaultUrls["rug-pull-dataset"],
      "mew-darklist": process.env.EVM_MEW_DARKLIST_FEED_URL?.trim() || defaultUrls["mew-darklist"],
    },
  }
}

function normalizeAddress(value: string) {
  const trimmed = value.trim()
  return evmAddressPattern.test(trimmed) ? trimmed.toLowerCase() : ""
}

function maliciousRealCatsLabel(label: string) {
  const normalized = label.trim().toLowerCase()
  return /(hack|scam|phish|fraud|drain|ransom|ponzi|malware|exploit|heist|criminal)/.test(normalized)
}

export function parseRealCatsCriminalAddresses(text: string) {
  const addresses = new Set<string>()
  const lines = text.split(/\r?\n/)
  for (let index = 1; index < lines.length; index += 1) {
    const [rawAddress = "", rawLabel = ""] = lines[index].split("\t", 3)
    const address = normalizeAddress(rawAddress)
    if (address && maliciousRealCatsLabel(rawLabel)) addresses.add(address)
  }
  return addresses
}

function csvCells(line: string) {
  const cells: string[] = []
  let current = ""
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else quoted = !quoted
    } else if (char === "," && !quoted) {
      cells.push(current)
      current = ""
    } else current += char
  }
  cells.push(current)
  return cells
}

export function parseValidatedEthereumRugPullAddresses(text: string) {
  const addresses = new Set<string>()
  const lines = text.split(/\r?\n/)
  for (let index = 1; index < lines.length; index += 1) {
    const cells = csvCells(lines[index])
    const chain = (cells[1] ?? "").trim().toUpperCase()
    const address = normalizeAddress(cells[2] ?? "")
    if (chain === "ETH" && address) addresses.add(address)
  }
  return addresses
}

export function parseMewDarklistAddresses(text: string) {
  const addresses = new Set<string>()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return addresses
  }
  if (!Array.isArray(parsed)) return addresses
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue
    const address = normalizeAddress(String((item as Record<string, unknown>).address ?? ""))
    if (address) addresses.add(address)
  }
  return addresses
}

async function loadOne(source: EvmThreatCorpusSource, url: string, timeoutMs: number) {
  const response = await fetch(url, {
    headers: { Accept: "text/plain,text/csv,application/json,*/*" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`EVM threat corpus request failed with HTTP ${response.status}`)
  const declaredLength = Number(response.headers.get("content-length") ?? 0)
  if (declaredLength > maxCorpusBytes) throw new Error("EVM threat corpus exceeded size limit")
  const text = await response.text()
  if (Buffer.byteLength(text, "utf8") > maxCorpusBytes) throw new Error("EVM threat corpus exceeded size limit")
  if (source === "real-cats") return parseRealCatsCriminalAddresses(text)
  if (source === "rug-pull-dataset") return parseValidatedEthereumRugPullAddresses(text)
  return parseMewDarklistAddresses(text)
}

async function loadCorpora() {
  const cfg = config()
  if (corpusCache && corpusCache.expiresAt > Date.now()) return corpusCache

  const entries = await Promise.allSettled((Object.entries(cfg.urls) as Array<[EvmThreatCorpusSource, string]>).map(async ([source, url]) => {
    const addresses = await loadOne(source, url, cfg.timeoutMs)
    return [source, addresses] as const
  }))

  const sources: Record<EvmThreatCorpusSource, Set<string>> = {
    "real-cats": new Set<string>(),
    "rug-pull-dataset": new Set<string>(),
    "mew-darklist": new Set<string>(),
  }
  const availableSources: EvmThreatCorpusSource[] = []
  for (const entry of entries) {
    if (entry.status !== "fulfilled") continue
    sources[entry.value[0]] = entry.value[1]
    availableSources.push(entry.value[0])
  }
  if (availableSources.length === 0) throw new Error("All EVM public threat corpora were unavailable")

  corpusCache = { sources, availableSources, expiresAt: Date.now() + cfg.ttlMs }
  return corpusCache
}

export async function inspectEvmPublicThreatCorpus(address: string): Promise<EvmPublicThreatCorpusEvidence> {
  const normalized = normalizeAddress(address)
  const checkedAt = new Date().toISOString()
  const { enabled } = config()
  if (!enabled) return { status: "disabled", source: "evm-public-threat-corpus", address: normalized, matched: false, matchedSources: [], availableSources: [], independentSourceCount: 0, checkedAt }
  if (!normalized) return { status: "unavailable", source: "evm-public-threat-corpus", address: normalized, matched: false, matchedSources: [], availableSources: [], independentSourceCount: 0, checkedAt, error: "Invalid EVM address" }

  try {
    const corpora = await loadCorpora()
    const matchedSources = corpora.availableSources.filter((source) => corpora.sources[source].has(normalized))
    return {
      status: "available",
      source: "evm-public-threat-corpus",
      address: normalized,
      matched: matchedSources.length > 0,
      matchedSources,
      availableSources: corpora.availableSources,
      independentSourceCount: matchedSources.length,
      checkedAt,
    }
  } catch (error) {
    return {
      status: "unavailable",
      source: "evm-public-threat-corpus",
      address: normalized,
      matched: false,
      matchedSources: [],
      availableSources: [],
      independentSourceCount: 0,
      checkedAt,
      error: error instanceof Error ? error.message.slice(0, 240) : "EVM threat corpus lookup failed",
    }
  }
}

export function resetEvmPublicThreatCorpusCacheForTests() {
  corpusCache = null
}
