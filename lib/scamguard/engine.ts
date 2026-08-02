import { findScamGuardIntelEntry } from "@/lib/scamguard/intelligence"
import { findScamDnaMatch, persistScamDna, scamDnaSignal, type ScamDnaMetadata } from "@/lib/scamguard/scam-dna"
import { inspectUrlSandbox } from "@/lib/scamguard/url-sandbox"
import { inspectDomainAge } from "@/lib/scamguard/domain-age"

export type ScamGuardScanType = "url" | "wallet" | "token" | "transaction"

export type ScamGuardChain = "solana" | "evm" | "unknown"

export type ScamGuardRiskLevel = "SAFE" | "CAUTION" | "HIGH_RISK" | "CRITICAL"

export type ScamGuardSignalSeverity = "info" | "low" | "medium" | "high" | "critical"

export type ScamGuardSignal = {
  code: string
  severity: ScamGuardSignalSeverity
  title: string
  detail: string
}

export type ScamGuardScanInput = {
  type: ScamGuardScanType
  value: string
  walletAddress?: string
  chain?: ScamGuardChain
  sourceUrl?: string
  deepScan?: boolean
  clientSignals?: Array<{
    code?: string
    severity?: ScamGuardSignalSeverity
    title?: string
    detail?: string
  }>
}

export type ScamGuardScanResult = {
  id: string
  type: ScamGuardScanType
  score: number
  riskLevel: ScamGuardRiskLevel
  summary: string
  confidence: "LOW" | "MEDIUM" | "HIGH"
  explanation: string
  signals: ScamGuardSignal[]
  actions: string[]
  metadata: {
    chain: ScamGuardChain
    rpcStatus: "checked" | "skipped" | "failed" | "not_applicable"
    rpcError?: string
    domain?: string
    walletAddress?: string
    ownerProgram?: string | null
    lamports?: number
    signatureCount?: number
    tokenMint?: {
      decimals?: number
      supply?: string
      mintAuthority: string | null
      freezeAuthority: string | null
      initialized?: boolean
    }
    simulation?: {
      attempted: boolean
      ok: boolean
      chain?: "solana" | "evm"
      mode?: "transaction" | "call"
      error?: string
      logs?: string[]
    }
    decodedIntent?: {
      method?: string
      category?: "transfer" | "approval" | "signature" | "authority" | "mint" | "account_close" | "unknown"
      assetChange?: string
      spender?: string
      recipient?: string
      amount?: string
      instructionCount?: number
      programs?: string[]
      typedData?: {
        primaryType?: string
        domainName?: string
        verifyingContract?: string
        messageFields: string[]
        highImpact: boolean
        action?: "permit" | "asset_order" | "delegation" | "authorization" | "message"
        spender?: string
        recipient?: string
        amount?: string
        deadline?: string
      }
      batch?: {
        totalCalls: number
        atomicRequired: boolean
        calls: Array<{
          index: number
          to?: string
          method?: string
          category: "transfer" | "approval" | "authority" | "unknown"
          spender?: string
          recipient?: string
          amount?: string
          value?: string
          risk: "low" | "medium" | "high"
        }>
      }
      warnings: string[]
    }
    reputation?: {
      verdict: "trusted" | "unknown" | "suspicious" | "known_bad"
      source: string
      notes: string[]
    }
    domainIntelligence?: {
      host?: string
      root?: string
      tld?: string
      sourceUrl?: string
      features: string[]
    }
    extensionSignals?: string[]
    domainAge?: {
      status: "available" | "unavailable"
      createdAt?: string
      ageDays?: number
      source: "rdap"
    }
    sandbox?: {
      status: "complete" | "blocked" | "failed" | "unsupported" | "disabled"
      sourceUrl: string
      finalUrl?: string
      httpStatus?: number
      contentType?: string
      contentBytes?: number
      elapsedMs: number
      redirectChain: string[]
      resolvedAddressCount: number
      blockReason?: string
      error?: string
      behaviorFlags: string[]
      stats?: {
        tagCount: number
        scriptCount: number
        formCount: number
        iframeCount: number
        externalScriptCount: number
      }
    }
    scamDna?: ScamDnaMetadata
    contractIntelligence?: {
      target?: string
      checked: boolean
      isContract?: boolean
      verified?: boolean
      proxy?: boolean
      deployer?: string
      implementation?: string
      source: "rpc" | "etherscan" | "skipped"
      notes: string[]
    }
    decision?: {
      primaryReason: string
      trustContext: string
      riskDrivers: string[]
      userMessage: string
    }
    feedback?: {
      enabled: boolean
      endpoint: string
    }
  }
  scannedAt: string
}

type RpcResponse<T> = {
  result?: T
  error?: { message?: string }
}

type ParsedAccountInfo = {
  value?: {
    data?:
      | string
      | [string, string]
      | {
          program?: string
          parsed?: {
            type?: string
            info?: Record<string, unknown>
          }
        }
    executable?: boolean
    lamports?: number
    owner?: string
  } | null
}

type SignaturesResult = Array<{ signature: string; blockTime?: number | null; err?: unknown }>

type SimulateResult = {
  value?: {
    err?: unknown
    logs?: string[] | null
  }
}

type SimulationMetadata = NonNullable<ScamGuardScanResult["metadata"]["simulation"]>

const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const tokenProgramId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const token2022ProgramId = "TokenzQdBNbLqP5VEhdkAS6EPF1SMH1dbKqP6Xk6mN"
const systemProgramId = "11111111111111111111111111111111"

const officialDomains = new Set([
  "phantom.app",
  "solflare.com",
  "jup.ag",
  "jupiter.ag",
  "magiceden.io",
  "tensor.trade",
  "backpack.app",
  "zerg.app",
  "nestusd.com",
  "allox.ai",
  "shiftrwa.xyz",
  "grass.io",
  "grassfoundation.io",
  "grass-foundation.gitbook.io",
])

const verifiedProjectDomains = new Set([
  ...officialDomains,
  "triproofprotocol.com",
])

const shortenerDomains = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "cutt.ly",
  "is.gd",
  "rebrand.ly",
])

const highRiskWords = [
  "airdrop",
  "claim",
  "bonus",
  "free",
  "presale",
  "mint",
  "whitelist",
  "reward",
]

const seedPhraseWords = [
  "seed phrase",
  "recovery phrase",
  "private key",
  "mnemonic",
  "secret phrase",
]

const knownDrainerFragments = [
  "drain",
  "sweep",
  "walletconnect-claim",
  "phantom-airdrop",
  "free-solana",
  "claim-bonus",
]

function bootstrapKnownBadDomains() {
  const configured = (process.env.SCAMGUARD_BOOTSTRAP_KNOWN_BAD_DOMAINS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
    .filter((value) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value))

  // Keep the fixture available for deterministic tests, but never ship an
  // unreviewed real-world domain as a production stop signal in source code.
  const isTestRuntime =
    process.env.NODE_ENV === "test" ||
    process.env.npm_lifecycle_event?.startsWith("test") ||
    process.execArgv.includes("--test") ||
    process.argv.some((value) => /\.test\.[cm]?[jt]sx?$/i.test(value))
  if (isTestRuntime) {
    configured.push("phantom-airdrop-claim.example")
  }

  return new Set(configured)
}

const defaultThreatFeedUrls = [
  "https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/master/src/config.json",
]

type ThreatFeedCache = {
  loadedAt: number
  domains: Set<string>
  evmAddresses: Set<string>
}

let threatFeedCache: ThreatFeedCache | null = null
const threatFeedTtlMs = 60 * 60 * 1000

const suspiciousTlds = new Set(["zip", "mov", "cam", "click", "top", "xyz"])
const sensitiveQueryKeys = new Set(["redirect", "return", "returnurl", "next", "target", "url", "continue"])
const walletProtocolPattern = /(?:phantom|solflare|walletconnect|metamask|coinbase|backpack):\/\//i

const knownBadWallets = new Set([
  "9xQeWvG816bUx9EPfFNtN5B2kWfdrain11111111111111111111".toLowerCase(),
])

const trustedPrograms = new Map([
  [systemProgramId, "Solana System Program"],
  [tokenProgramId, "SPL Token Program"],
  [token2022ProgramId, "SPL Token-2022 Program"],
])

const evmAddressRegex = /^0x[a-fA-F0-9]{40}$/
const evmWordRegex = /^[a-fA-F0-9]{64}$/
const maxUint256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935"

const evmFunctionSelectors = new Map([
  ["0xa9059cbb", { method: "transfer(address,uint256)", category: "transfer" as const }],
  ["0x23b872dd", { method: "transferFrom(address,address,uint256)", category: "transfer" as const }],
  ["0x095ea7b3", { method: "approve(address,uint256)", category: "approval" as const }],
  ["0xa22cb465", { method: "setApprovalForAll(address,bool)", category: "approval" as const }],
  ["0xd505accf", { method: "permit(...)", category: "approval" as const }],
])

const knownBadEvmCounterparties = new Set([
  "0x000000000000000000000000000000000000bad1",
])

const trustedEvmCounterparties = new Map([
  ["0x000000000022d473030f116ddee9f6b43ac78ba3", "Uniswap Permit2"],
])

const campaignSurfaceWords = [
  "season",
  "quest",
  "points",
  "campaign",
  "allowlist",
  "whitelist",
  "leaderboard",
  "rewards",
]

function getSolanaRpcUrl() {
  const explicit = process.env.SOLANA_RPC_URL?.trim()
  if (explicit) return explicit
  const helius = process.env.HELIUS_API_KEY?.trim()
  if (helius) return `https://mainnet.helius-rpc.com/?api-key=${helius}`
  return null
}

async function solanaRpc<T>(method: string, params: unknown[]): Promise<T> {
  const rpcUrl = getSolanaRpcUrl()
  if (!rpcUrl) throw new Error("SOLANA_RPC_URL or HELIUS_API_KEY is not configured")

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    }),
    cache: "no-store",
  })
  const payload = (await response.json()) as RpcResponse<T>
  if (!response.ok || payload.error) throw new Error(payload.error?.message ?? `${method} failed`)
  return payload.result as T
}

function getEvmRpcUrl() {
  const explicit =
    process.env.EVM_RPC_URL?.trim() ||
    process.env.ETH_RPC_URL?.trim() ||
    process.env.ETHEREUM_RPC_URL?.trim()
  if (explicit) return explicit
  const alchemy = process.env.ALCHEMY_API_KEY?.trim()
  if (alchemy) return `https://eth-mainnet.g.alchemy.com/v2/${alchemy}`
  return null
}

async function evmRpc<T>(method: string, params: unknown[]): Promise<T> {
  const rpcUrl = getEvmRpcUrl()
  if (!rpcUrl) throw new Error("EVM_RPC_URL, ETH_RPC_URL, ETHEREUM_RPC_URL, or ALCHEMY_API_KEY is not configured")

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    }),
    cache: "no-store",
  })
  const payload = (await response.json()) as RpcResponse<T>
  if (!response.ok || payload.error) throw new Error(payload.error?.message ?? `${method} failed`)
  return payload.result as T
}

function getEtherscanApiKey() {
  return process.env.ETHERSCAN_API_KEY?.trim() || null
}

async function etherscanRequest(params: Record<string, string>) {
  const apiKey = getEtherscanApiKey()
  if (!apiKey) return null
  const search = new URLSearchParams({
    chainid: "1",
    apikey: apiKey,
    ...params,
  })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)
  try {
    const response = await fetch(`https://api.etherscan.io/v2/api?${search.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
    if (!response.ok) return null
    return (await response.json()) as { status?: string; message?: string; result?: unknown }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function etherscanContractMetadata(address: string) {
  const [source, creation] = await Promise.all([
    etherscanRequest({ module: "contract", action: "getsourcecode", address }),
    etherscanRequest({ module: "contract", action: "getcontractcreation", contractaddresses: address }),
  ])
  const sourceRow = Array.isArray(source?.result) ? (source.result[0] as Record<string, unknown> | undefined) : undefined
  const creationRow = Array.isArray(creation?.result) ? (creation.result[0] as Record<string, unknown> | undefined) : undefined
  const sourceCode = typeof sourceRow?.SourceCode === "string" ? sourceRow.SourceCode : ""
  const abi = typeof sourceRow?.ABI === "string" ? sourceRow.ABI : ""
  const proxy = sourceRow?.Proxy === "1"
  const implementation = typeof sourceRow?.Implementation === "string" ? normalizeEvmAddress(sourceRow.Implementation) : undefined
  const deployer = typeof creationRow?.contractCreator === "string" ? normalizeEvmAddress(creationRow.contractCreator) : undefined
  const verified = Boolean(sourceCode.trim()) || (Boolean(abi) && abi !== "Contract source code not verified")
  if (!sourceRow && !creationRow) return null
  return { verified, proxy, implementation, deployer }
}

async function evmContractIntelligence(target?: string): Promise<NonNullable<ScamGuardScanResult["metadata"]["contractIntelligence"]>> {
  const normalized = normalizeEvmAddress(target)
  if (!normalized) {
    return { checked: false, source: "skipped", notes: ["No EVM counterparty was available for contract intelligence."] }
  }
  if (!getEvmRpcUrl() && !getEtherscanApiKey()) {
    return { target: normalized, checked: false, source: "skipped", notes: ["EVM RPC or Etherscan API is not configured, so live contract checks were skipped."] }
  }
  try {
    const [codeResult, etherscan] = await Promise.all([
      getEvmRpcUrl() ? evmRpc<string>("eth_getCode", [normalized, "latest"]).catch(() => null) : Promise.resolve(null),
      etherscanContractMetadata(normalized),
    ])
    const isContract = codeResult ? codeResult !== "0x" : undefined
    const notes = codeResult
      ? [isContract ? "EVM RPC returned bytecode for this counterparty." : "EVM RPC returned no bytecode; this counterparty appears to be an EOA."]
      : ["EVM RPC code check was unavailable; using available explorer evidence."]
    if (etherscan) {
      notes.push(etherscan.verified ? "Etherscan reports verified contract source or ABI." : "Etherscan does not report verified source for this contract.")
      if (etherscan.proxy) notes.push("Etherscan marks this contract as a proxy.")
      if (etherscan.deployer) notes.push(`Contract deployer: ${etherscan.deployer}.`)
    }
    return {
      target: normalized,
      checked: true,
      isContract,
      verified: etherscan?.verified,
      proxy: etherscan?.proxy,
      implementation: etherscan?.implementation,
      deployer: etherscan?.deployer,
      source: etherscan ? "etherscan" : "rpc",
      notes,
    }
  } catch (error) {
    return {
      target: normalized,
      checked: false,
      source: "rpc",
      notes: [error instanceof Error ? error.message : "EVM contract-code check failed."],
    }
  }
}

function normalizeValue(value: string) {
  return value.trim()
}

function normalizeEvmAddress(value?: string) {
  const trimmed = value?.trim()
  if (!trimmed || !evmAddressRegex.test(trimmed)) return undefined
  return trimmed.toLowerCase()
}

function normalizeChain(chain?: ScamGuardChain): ScamGuardChain {
  if (chain === "solana" || chain === "evm") return chain
  return "unknown"
}

function domainMatchesSet(domain: string | undefined, domains: Set<string>) {
  if (!domain) return false
  return [...domains].some((knownDomain) => domain === knownDomain || domain.endsWith(`.${knownDomain}`))
}

function shouldLoadExternalThreatFeeds() {
  if (process.env.SCAMGUARD_DISABLE_THREAT_FEEDS === "1") return false
  if (process.env.NODE_ENV === "test" || process.env.npm_lifecycle_event?.startsWith("test")) return false
  return true
}

function threatFeedUrls() {
  const configured = (process.env.SCAMGUARD_THREAT_FEED_URLS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  return configured.length ? configured : defaultThreatFeedUrls
}

function collectThreatStrings(value: unknown, out: string[] = []) {
  if (typeof value === "string") {
    out.push(value)
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) collectThreatStrings(item, out)
    return out
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectThreatStrings(item, out)
  }
  return out
}

function addThreatCandidate(raw: string, domains: Set<string>, evmAddresses: Set<string>) {
  const cleaned = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")
  if (!cleaned || cleaned.length > 180) return
  if (evmAddressRegex.test(cleaned)) {
    evmAddresses.add(cleaned)
    return
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleaned) && !cleaned.includes(" ")) domains.add(cleaned)
}

async function fetchThreatFeed(url: string, domains: Set<string>, evmAddresses: Set<string>) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2500)
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal })
    if (!response.ok) return
    const text = await response.text()
    try {
      const json = JSON.parse(text) as unknown
      for (const item of collectThreatStrings(json)) addThreatCandidate(item, domains, evmAddresses)
    } catch {
      for (const line of text.split(/\r?\n/)) addThreatCandidate(line, domains, evmAddresses)
    }
  } catch {
    return
  } finally {
    clearTimeout(timeout)
  }
}

async function loadThreatFeeds() {
  if (!shouldLoadExternalThreatFeeds()) return { domains: new Set<string>(), evmAddresses: new Set<string>() }
  if (threatFeedCache && Date.now() - threatFeedCache.loadedAt < threatFeedTtlMs) return threatFeedCache

  const domains = new Set<string>()
  const evmAddresses = new Set<string>()
  await Promise.all(threatFeedUrls().map((url) => fetchThreatFeed(url, domains, evmAddresses)))
  threatFeedCache = { loadedAt: Date.now(), domains, evmAddresses }
  return threatFeedCache
}

async function externalDomainReputation(domain?: string): Promise<NonNullable<ScamGuardScanResult["metadata"]["reputation"]>> {
  if (!domain) return defaultReputation()
  const dbEntry = await findScamGuardIntelEntry("DOMAIN", domain)
  if (dbEntry) {
    return {
      verdict: dbEntry.verdict === "TRUSTED" ? "trusted" : dbEntry.verdict === "KNOWN_BAD" ? "known_bad" : "suspicious",
      source: dbEntry.source,
      notes: [`${domain} matched admin intelligence: ${dbEntry.label}${dbEntry.notes ? ` - ${dbEntry.notes}` : ""}`],
    }
  }
  const feeds = await loadThreatFeeds()
  if (domainMatchesSet(domain, feeds.domains)) {
    return { verdict: "known_bad", source: "external_threat_feed", notes: [`${domain} matched an external phishing domain feed.`] }
  }
  return defaultReputation()
}

async function externalEvmReputation(address?: string): Promise<NonNullable<ScamGuardScanResult["metadata"]["reputation"]>> {
  const normalized = normalizeEvmAddress(address)
  if (!normalized) return defaultReputation()
  const dbEntry =
    (await findScamGuardIntelEntry("EVM_ADDRESS", normalized, "evm")) ??
    (await findScamGuardIntelEntry("CONTRACT", normalized, "evm"))
  if (dbEntry) {
    return {
      verdict: dbEntry.verdict === "TRUSTED" ? "trusted" : dbEntry.verdict === "KNOWN_BAD" ? "known_bad" : "suspicious",
      source: dbEntry.source,
      notes: [`${normalized} matched admin intelligence: ${dbEntry.label}${dbEntry.notes ? ` - ${dbEntry.notes}` : ""}`],
    }
  }
  const feeds = await loadThreatFeeds()
  if (feeds.evmAddresses.has(normalized)) {
    return { verdict: "known_bad", source: "external_threat_feed", notes: [`${normalized} matched an external EVM address feed.`] }
  }
  return defaultReputation()
}

async function adminSolanaReputation(address: string): Promise<NonNullable<ScamGuardScanResult["metadata"]["reputation"]>> {
  const dbEntry =
    (await findScamGuardIntelEntry("SOLANA_ADDRESS", address, "solana")) ??
    (await findScamGuardIntelEntry("WALLET", address, "solana")) ??
    (await findScamGuardIntelEntry("TOKEN", address, "solana"))
  if (!dbEntry) return defaultReputation()
  return {
    verdict: dbEntry.verdict === "TRUSTED" ? "trusted" : dbEntry.verdict === "KNOWN_BAD" ? "known_bad" : "suspicious",
    source: dbEntry.source,
    notes: [`${address} matched admin intelligence: ${dbEntry.label}${dbEntry.notes ? ` - ${dbEntry.notes}` : ""}`],
  }
}

function strongestReputation(
  ...items: Array<NonNullable<ScamGuardScanResult["metadata"]["reputation"]>>
): NonNullable<ScamGuardScanResult["metadata"]["reputation"]> {
  const rank = { known_bad: 4, suspicious: 3, trusted: 2, unknown: 1 }
  return items.reduce((best, item) => (rank[item.verdict] > rank[best.verdict] ? item : best), defaultReputation())
}

function inferChain(value: string, chain?: ScamGuardChain): ScamGuardChain {
  const explicit = normalizeChain(chain)
  if (explicit !== "unknown") return explicit
  const trimmed = value.trim()
  if (evmAddressRegex.test(trimmed) || /^0x[a-fA-F0-9]{8,}/.test(trimmed)) return "evm"
  if (solanaAddressRegex.test(trimmed)) return "solana"
  if (/eth_sendtransaction|personal_sign|eth_signtypeddata|wallet_switchethereumchain|eip-712/i.test(trimmed)) return "evm"
  return "solana"
}

function inferUrlChain(
  requestedChain: ScamGuardChain,
  fingerprint?: { chainHints: Array<"solana" | "evm"> }
): ScamGuardChain {
  if (requestedChain !== "unknown") return requestedChain
  const hints = fingerprint?.chainHints ?? []
  if (hints.length === 1) return hints[0]
  return "unknown"
}

function confidenceFor(signals: ScamGuardSignal[], metadata: ScamGuardScanResult["metadata"]) {
  if (signals.some((signal) => signal.severity === "critical" || signal.code.startsWith("KNOWN_"))) return "HIGH"
  if (metadata.rpcStatus === "checked" || metadata.decodedIntent?.category !== "unknown") return "MEDIUM"
  if (signals.some((signal) => ["high", "medium"].includes(signal.severity))) return "MEDIUM"
  return "LOW"
}

function explanationFor(level: ScamGuardRiskLevel, signals: ScamGuardSignal[], metadata: ScamGuardScanResult["metadata"]) {
  const topSignals = signals.filter((signal) => signal.severity !== "info").slice(0, 2)
  const signalText = topSignals.length
    ? topSignals.map((signal) => signal.title.toLowerCase()).join(" and ")
    : "no high-confidence rule"
  const chainText = metadata.chain === "evm" ? "EVM" : metadata.chain === "solana" ? "Solana" : "Web3"
  const rpcText =
    metadata.rpcStatus === "checked"
      ? "with live RPC evidence"
      : metadata.rpcStatus === "failed"
        ? "with RPC unavailable"
        : "from local rules"
  if (level === "CRITICAL") return `${chainText} scan found ${signalText}; treat this as a stop signal ${rpcText}.`
  if (level === "HIGH_RISK") return `${chainText} scan found ${signalText}; verify independently before continuing ${rpcText}.`
  if (level === "CAUTION") return `${chainText} scan found ${signalText}; slow down and confirm the source ${rpcText}.`
  return `${chainText} scan found ${signalText}; this lowers risk but does not guarantee safety.`
}

function defaultReputation(): NonNullable<ScamGuardScanResult["metadata"]["reputation"]> {
  return { verdict: "unknown", source: "seed_intelligence", notes: [] }
}

function domainReputation(domain?: string): NonNullable<ScamGuardScanResult["metadata"]["reputation"]> {
  if (!domain) return defaultReputation()
  if (domainMatchesSet(domain, bootstrapKnownBadDomains())) {
    return { verdict: "known_bad", source: "emergency_blocklist", notes: [`${domain} is in the emergency known-bad domain blocklist.`] }
  }
  if (domainMatchesSet(domain, verifiedProjectDomains)) {
    return { verdict: "trusted", source: "verified_project_registry", notes: [`${domain} is in the local verified project registry.`] }
  }
  return defaultReputation()
}

function walletReputation(value: string): NonNullable<ScamGuardScanResult["metadata"]["reputation"]> {
  const normalized = value.toLowerCase()
  if (knownBadWallets.has(normalized) || knownDrainerFragments.some((fragment) => normalized.includes(fragment))) {
    return { verdict: "known_bad", source: "seed_intelligence", notes: ["Wallet matches a known bad or drainer-like seed pattern."] }
  }
  return defaultReputation()
}

function evmCounterpartyReputation(address?: string): NonNullable<ScamGuardScanResult["metadata"]["reputation"]> {
  const normalized = normalizeEvmAddress(address)
  if (!normalized) return defaultReputation()
  if (knownBadEvmCounterparties.has(normalized)) {
    return { verdict: "known_bad", source: "counterparty_intelligence", notes: [`${normalized} matches a known bad EVM spender seed.`] }
  }
  const trustedName = trustedEvmCounterparties.get(normalized)
  if (trustedName) {
    return { verdict: "trusted", source: "counterparty_registry", notes: [`${normalized} is recognized as ${trustedName}. Review approval amount before signing.`] }
  }
  return { verdict: "unknown", source: "counterparty_intelligence", notes: [`${normalized} has no local EVM counterparty reputation.`] }
}

function metadataWithDefaults(metadata: ScamGuardScanResult["metadata"]): ScamGuardScanResult["metadata"] {
  return {
    ...metadata,
    chain: metadata.chain ?? "unknown",
    reputation: metadata.reputation ?? defaultReputation(),
    feedback: metadata.feedback ?? { enabled: true, endpoint: "/api/scamguard/feedback" },
  }
}

function signalWeight(severity: ScamGuardSignalSeverity) {
  if (severity === "critical") return 44
  if (severity === "high") return 28
  if (severity === "medium") return 16
  if (severity === "low") return 8
  return 0
}

function riskLevel(score: number): ScamGuardRiskLevel {
  if (score >= 86) return "CRITICAL"
  if (score >= 61) return "HIGH_RISK"
  if (score >= 31) return "CAUTION"
  return "SAFE"
}

function minimumScoreForSignals(signals: ScamGuardSignal[]) {
  if (signals.some((signal) => signal.severity === "critical")) return 86
  if (signals.some((signal) => signal.severity === "high")) return 61
  if (signals.some((signal) => signal.severity === "medium")) return 31
  if (signals.some((signal) => signal.severity === "low")) return 18
  return 0
}

function summaryFor(level: ScamGuardRiskLevel, signals: ScamGuardSignal[]) {
  if (level === "CRITICAL") return "Critical drain or account-takeover indicators were found. Do not sign or interact."
  if (level === "HIGH_RISK") {
    const hasSevereSignal = signals.some((signal) => signal.severity === "critical" || signal.severity === "high")
    return hasSevereSignal
      ? "Strong risk signals were found. Treat this as unsafe until independently verified."
      : "Several unverified campaign signals stacked together. Verify the official source before continuing."
  }
  if (level === "CAUTION") return "This surface needs source verification before you click or sign."
  return "No major ScamGuard rule fired. This reduces risk, but it is not a safety guarantee."
}

function decisionFor(
  level: ScamGuardRiskLevel,
  signals: ScamGuardSignal[],
  metadata: ScamGuardScanResult["metadata"]
): NonNullable<ScamGuardScanResult["metadata"]["decision"]> {
  const rankedSignals = signals
    .filter((signal) => signal.severity !== "info")
    .sort((a, b) => signalWeight(b.severity) - signalWeight(a.severity))
  const primary = rankedSignals[0]
  const trusted = metadata.reputation?.verdict === "trusted"
  const knownBad = metadata.reputation?.verdict === "known_bad"
  const hasSevereSignal = rankedSignals.some((signal) => signal.severity === "critical" || signal.severity === "high")
  const source = metadata.domain ? `Source: ${metadata.domain}. ` : ""
  const trustContext = knownBad
    ? "Known-bad intelligence overrides normal trust signals."
    : trusted
      ? "The source or counterparty is recognized, but wallet intent still controls the final decision."
      : "The source or counterparty is not verified by local intelligence."
  const userMessage =
    level === "CRITICAL"
      ? `${source}Do not sign. ScamGuard found a stop-level risk signal.`
      : level === "HIGH_RISK"
        ? hasSevereSignal
          ? `${source}Do not continue until the project and wallet action are independently verified.`
          : `${source}Several unverified campaign signals are stacked together. Continue only after official source verification.`
        : level === "CAUTION"
          ? `${source}Pause and compare the wallet prompt against the action you expected.`
          : `${source}No stop-level risk surfaced. Still check the wallet prompt before signing.`
  return {
    primaryReason: primary?.title ?? "No high-confidence risk driver",
    trustContext,
    riskDrivers: rankedSignals.slice(0, 4).map((signal) => `${signal.title}: ${signal.detail}`),
    userMessage,
  }
}

function createResult(
  type: ScamGuardScanType,
  signals: ScamGuardSignal[],
  metadata: ScamGuardScanResult["metadata"]
): ScamGuardScanResult {
  const safeMetadata = metadataWithDefaults(metadata)
  const weightedScore = 8 + signals.reduce((sum, signal) => sum + signalWeight(signal.severity), 0)
  const reputationFloor =
    safeMetadata.reputation?.verdict === "known_bad" ? 86 : safeMetadata.reputation?.verdict === "suspicious" ? 61 : 0
  const trustedAdjustment = safeMetadata.reputation?.verdict === "trusted" ? -8 : 0
  const score = Math.min(100, Math.max(minimumScoreForSignals(signals), reputationFloor, weightedScore + trustedAdjustment))
  const level = riskLevel(score)
  const renderedSignals = signals.length
    ? signals
    : [
        {
          code: "NO_HIGH_CONFIDENCE_MATCH",
          severity: "info" as const,
          title: "No high-confidence rule matched",
          detail: "Still verify the official source and expected wallet changes before signing.",
        },
      ]
  safeMetadata.decision = decisionFor(level, renderedSignals, safeMetadata)
  return {
    id: crypto.randomUUID(),
    type,
    score,
    riskLevel: level,
    summary: summaryFor(level, renderedSignals),
    confidence: confidenceFor(renderedSignals, safeMetadata),
    explanation: explanationFor(level, renderedSignals, safeMetadata),
    signals: renderedSignals,
    actions: actionsFor(level),
    metadata: safeMetadata,
    scannedAt: new Date().toISOString(),
  }
}

function actionsFor(level: ScamGuardRiskLevel) {
  if (level === "CRITICAL") {
    return [
      "Reject the transaction or close the page.",
      "Open the project manually from an official bookmark or verified profile.",
      "Move funds to a fresh wallet if a seed phrase or private key was entered.",
    ]
  }
  if (level === "HIGH_RISK") {
    return [
      "Do not sign until the project team or a trusted security reviewer confirms it.",
      "Compare token mints and program IDs with official documentation.",
      "Use a burner wallet for unavoidable testing.",
    ]
  }
  if (level === "CAUTION") {
    return [
      "Confirm the domain, token mint, and transaction instructions before proceeding.",
      "Check expected asset balance changes in the wallet preview.",
    ]
  }
  return ["Proceed only after confirming the source and wallet popup match your intent."]
}

function hostFromUrl(value: string) {
  try {
    const url = new URL(value)
    return url.hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return null
  }
}

function parsedUrl(value: string) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function rootDomain(domain?: string) {
  if (!domain) return undefined
  const parts = domain.split(".").filter(Boolean)
  if (parts.length <= 2) return domain
  return parts.slice(-2).join(".")
}

function hasSensitiveRedirect(url: URL | null) {
  if (!url) return false
  for (const [key, value] of url.searchParams.entries()) {
    if (!sensitiveQueryKeys.has(key.toLowerCase())) continue
    if (/^https?:\/\//i.test(value) || walletProtocolPattern.test(value)) return true
  }
  return false
}

function hasEncodedPayload(value: string) {
  return /%[0-9a-f]{2}/i.test(value) || /(?:[A-Za-z0-9+/]{32,}={0,2})/.test(value)
}

function domainIntelligenceFor(value: string) {
  const url = parsedUrl(value)
  const host = hostFromUrl(value) ?? undefined
  const features: string[] = []
  if (url?.username || url?.password || /^https?:\/\/[^/\s]+@/i.test(value)) features.push("url_credentials")
  if (host?.startsWith("xn--") || host?.includes(".xn--") || /(^|[./@])xn--/i.test(value)) features.push("punycode_domain")
  if (host && host.split(".").length >= 4) features.push("deep_subdomain")
  if (url && hasSensitiveRedirect(url)) features.push("sensitive_redirect")
  if (!url && /[?&](?:redirect|return|returnurl|next|target|url|continue)=/i.test(value)) features.push("sensitive_redirect")
  if (hasEncodedPayload(url?.pathname ?? value)) features.push("encoded_payload")
  if (url && walletProtocolPattern.test(`${url.protocol}//${url.host}${url.pathname}${url.search}`)) features.push("wallet_deep_link")
  return {
    host,
    root: rootDomain(host),
    tld: host?.split(".").at(-1),
    sourceUrl: value,
    features,
  }
}

const hardUrlRiskFeatures = new Set(["url_credentials", "punycode_domain", "sensitive_redirect", "encoded_payload"])

function hasHardUrlRiskFeature(features: string[]) {
  return features.some((feature) => hardUrlRiskFeatures.has(feature))
}

function brandMentioned(text: string) {
  return ["phantom", "solflare", "jupiter", "magiceden", "tensor", "backpack"].find((brand) =>
    text.includes(brand)
  )
}

function normalizedExtensionSignals(input: ScamGuardScanInput["clientSignals"]) {
  const allowedCodes = new Map([
    ["SEED_PHRASE_FORM", { severity: "critical" as const, title: "Seed phrase form detected" }],
    ["PRIVATE_KEY_FORM", { severity: "critical" as const, title: "Private key form detected" }],
    ["SUSPICIOUS_WALLET_DEEPLINK", { severity: "medium" as const, title: "Wallet deep link detected" }],
    ["HIDDEN_CROSS_ORIGIN_IFRAME", { severity: "low" as const, title: "Hidden cross-origin frame" }],
    ["CLIPBOARD_WRITE_HANDLER", { severity: "low" as const, title: "Clipboard write behavior" }],
  ])
  return (input ?? []).slice(0, 8).flatMap((item) => {
    const code = typeof item?.code === "string" ? item.code.trim().toUpperCase() : ""
    const template = allowedCodes.get(code)
    if (!template) return []
    const detail = typeof item?.detail === "string" ? item.detail.replace(/\s+/g, " ").trim().slice(0, 280) : ""
    return [{
      code: `EXTENSION_${code}`,
      severity: template.severity,
      title: template.title,
      detail: detail || "ScamGuard observed this signal in the currently rendered page. Verify independently before interacting.",
    }]
  })
}

async function scanUrl(value: string, chain: ScamGuardChain, deepScan = false, clientSignals?: ScamGuardScanInput["clientSignals"]) {
  const text = value.toLowerCase()
  const url = parsedUrl(value)
  const domain = hostFromUrl(value)
  const domainIntel = domainIntelligenceFor(value)
  const path = url?.pathname.toLowerCase() ?? ""
  const tld = domain?.split(".").at(-1) ?? ""
  const reputation = strongestReputation(domainReputation(domain ?? undefined), await externalDomainReputation(domain ?? undefined))
  const domainAge = deepScan ? await inspectDomainAge(domain ?? undefined) : { status: "unavailable" as const, source: "rdap" as const }
  const signals: ScamGuardSignal[] = []
  const extensionSignals = normalizedExtensionSignals(clientSignals)
  signals.push(...extensionSignals)
  const brand = brandMentioned(text)
  const hasClaimLanguage = highRiskWords.some((word) => text.includes(word))
  const hasCampaignSurface = campaignSurfaceWords.some((word) => path.includes(word))
  const isAppSurface = Boolean(domain?.startsWith("app.") || domain?.startsWith("dapp."))
  const isKnownScamDomain = domainMatchesSet(domain ?? undefined, bootstrapKnownBadDomains())
  const isOfficialDomain = domainMatchesSet(domain ?? undefined, officialDomains)
  const isVerifiedProjectDomain = domainMatchesSet(domain ?? undefined, verifiedProjectDomains)
  const hasKnownBadWording = knownDrainerFragments.some((fragment) => text.includes(fragment))
  const hasRiskyClaimTld = Boolean(domain && suspiciousTlds.has(tld) && hasClaimLanguage)
  const hasHardUrlRisk = hasHardUrlRiskFeature(domainIntel.features)
    || Boolean(domain && shortenerDomains.has(domain))
    || Boolean(brand && !isOfficialDomain)
    || hasRiskyClaimTld
    || hasKnownBadWording
  const isCleanUnknownProjectSurface = Boolean(
    domain
      && !isOfficialDomain
      && !isVerifiedProjectDomain
      && reputation.verdict === "unknown"
      && !hasHardUrlRisk
      && (hasClaimLanguage || hasCampaignSurface || isAppSurface)
  )

  if (!domain) {
    signals.push({
      code: "MALFORMED_URL",
      severity: "medium",
      title: "URL is malformed",
      detail: "A malformed URL can hide the real destination or be copied from a suspicious prompt.",
    })
  }
  if (domainIntel.features.includes("url_credentials")) {
    signals.push({
      code: "URL_CREDENTIALS_OBFUSCATION",
      severity: "high",
      title: "URL hides destination with credentials",
      detail: "The URL contains username or password syntax before the host. Phishing links use this to make the visible text look like a trusted domain.",
    })
  }
  if (domainIntel.features.includes("punycode_domain") && !isVerifiedProjectDomain) {
    signals.push({
      code: "PUNYCODE_DOMAIN",
      severity: "high",
      title: "Punycode domain detected",
      detail: `${domain ?? "The URL"} uses punycode. This can be legitimate, but it is also common in homograph phishing.`,
    })
  }
  if (domainIntel.features.includes("sensitive_redirect") && !isVerifiedProjectDomain) {
    signals.push({
      code: "SENSITIVE_REDIRECT_PARAMETER",
      severity: "medium",
      title: "Redirect parameter in Web3 link",
      detail: "This URL carries a redirect-style parameter that can send users to another site or wallet deep link after the first click.",
    })
  }
  if (domainIntel.features.includes("encoded_payload") && hasClaimLanguage && !isVerifiedProjectDomain) {
    signals.push({
      code: "ENCODED_CLAIM_PAYLOAD",
      severity: "medium",
      title: "Encoded payload in claim link",
      detail: "The path contains encoded or base64-like data near claim/reward language. Scam kits often hide routing or signer state this way.",
    })
  }
  if (domainIntel.features.includes("deep_subdomain") && hasClaimLanguage && !isVerifiedProjectDomain) {
    signals.push({
      code: "DEEP_SUBDOMAIN_REWARD_LINK",
      severity: "low",
      title: "Deep reward subdomain",
      detail: `${domain} uses several subdomain levels with reward or claim language. Verify the exact host from official channels.`,
    })
  }
  if (domain && isKnownScamDomain) {
    signals.push({
      code: "KNOWN_SCAM_DOMAIN",
      severity: "critical",
      title: "Known suspicious domain",
      detail: `${domain} is in ScamGuard's emergency known-bad domain blocklist.`,
    })
  }
  if (domain && reputation.verdict === "known_bad" && !isKnownScamDomain) {
    signals.push({
      code: "EXTERNAL_THREAT_FEED_DOMAIN",
      severity: "critical",
      title: "Domain matched threat intelligence",
      detail: `${domain} matched ScamGuard admin intelligence or an external phishing feed.`,
    })
  } else if (domain && reputation.verdict === "suspicious") {
    signals.push({
      code: "ADMIN_SUSPICIOUS_DOMAIN",
      severity: "high",
      title: "Domain marked suspicious",
      detail: `${domain} is marked suspicious in ScamGuard intelligence. Verify from official project channels before signing.`,
    })
  }
  if (domain && isVerifiedProjectDomain) {
    signals.push({
      code: "VERIFIED_PROJECT_DOMAIN",
      severity: "info",
      title: "Verified project domain",
      detail: `${domain} is in the verified project registry. This helps reduce false positives but does not guarantee every wallet action is safe.`,
    })
  }
  if (domain && shortenerDomains.has(domain)) {
    signals.push({
      code: "SHORTENED_URL",
      severity: "medium",
      title: "Shortened URL",
      detail: "Shorteners and redirects hide the final destination from the signer.",
    })
  }
  if (brand && domain && !isOfficialDomain) {
    signals.push({
      code: "BRAND_IMPERSONATION",
      severity: "high",
      title: "Known Solana brand appears on an untrusted domain",
      detail: `${brand} is mentioned, but the domain is ${domain}.`,
    })
  }
  if (domain && !isVerifiedProjectDomain && suspiciousTlds.has(tld) && hasClaimLanguage) {
    signals.push({
      code: "SUSPICIOUS_TLD_CLAIM",
      severity: "medium",
      title: "Risky claim link domain pattern",
      detail: `The .${tld} domain appears with claim or reward language. This is not proof of a scam, but it is common in throwaway campaign and phishing infrastructure.`,
    })
  }
  if (domain && /phant[o0]m|s[o0]lflare|jup[i1]ter|mag[i1]ceden/.test(domain) && !isOfficialDomain) {
    signals.push({
      code: "TYPOSQUATTING_PATTERN",
      severity: "high",
      title: "Possible typosquatting domain",
      detail: `${domain} resembles a known Solana brand but is not an official domain.`,
    })
  }
  if (hasClaimLanguage && isVerifiedProjectDomain) {
    signals.push({
      code: "VERIFIED_REWARD_SURFACE",
      severity: "info",
      title: "Verified reward surface",
      detail: `${domain} uses reward, points, claim, or campaign language on a verified project domain. Still confirm the wallet prompt before signing.`,
    })
  } else if (hasClaimLanguage) {
    signals.push({
      code: "CLAIM_LANGUAGE",
      severity: isCleanUnknownProjectSurface ? "low" : "medium",
      title: isCleanUnknownProjectSurface ? "Campaign or rewards wording" : "Claim or airdrop language",
      detail: isCleanUnknownProjectSurface
        ? "Reward, points, campaign, or claim wording is common in real Web3 apps. ScamGuard treats it as context unless paired with stronger risk signals."
        : "Scam campaigns often use urgent claim, mint, presale, whitelist, or reward language.",
    })
  }
  if (domain && hasClaimLanguage && !isOfficialDomain && !isVerifiedProjectDomain) {
    signals.push({
      code: isCleanUnknownProjectSurface ? "UNVERIFIED_PROJECT_CONTEXT" : "UNVERIFIED_CLAIM_DOMAIN",
      severity: isCleanUnknownProjectSurface ? "low" : "medium",
      title: isCleanUnknownProjectSurface ? "Project source not yet verified" : "Unverified claim domain",
      detail: isCleanUnknownProjectSurface
        ? `${domain} is not in the verified project registry yet. This is a source-confidence gap, not a scam verdict. Confirm the official account or docs before signing.`
        : `${domain} is not in the verified project registry for this scan. Confirm it from the project's official website, X account, Discord, or documentation before opening or signing.`,
    })
  }
  if (domain && !isOfficialDomain && !isVerifiedProjectDomain && (hasCampaignSurface || isAppSurface) && !(isCleanUnknownProjectSurface && hasClaimLanguage)) {
    signals.push({
      code: "UNVERIFIED_WEB3_APP_SURFACE",
      severity: isCleanUnknownProjectSurface ? "low" : "medium",
      title: "Unverified Web3 app surface",
      detail: isCleanUnknownProjectSurface
        ? `${domain}${path || "/"} looks like a normal app, quest, points, or rewards surface. Verify the source if a wallet prompt asks for permissions.`
        : `${domain}${path || "/"} looks like a campaign, season, quest, points, or app page. Treat it as unverified until the official project account links to it.`,
    })
  }
  if (domainAge.status === "available" && (domainAge.ageDays ?? Number.MAX_SAFE_INTEGER) < 14 && !isOfficialDomain && !isVerifiedProjectDomain && (hasClaimLanguage || hasCampaignSurface)) {
    signals.push({
      code: "RECENT_DOMAIN_CAMPAIGN_SURFACE",
      severity: "medium",
      title: "Recently registered campaign domain",
      detail: `${domain} was registered less than 14 days ago according to RDAP. New domains are not scams by themselves, but reward or claim flows deserve independent verification.`,
    })
  }
  if (seedPhraseWords.some((word) => text.includes(word))) {
    signals.push({
      code: "SECRET_MATERIAL_REQUEST",
      severity: "critical",
      title: "Seed phrase or private key lure",
      detail: "Any request for recovery phrase, seed phrase, mnemonic, or private key is a critical compromise signal.",
    })
  }
  if (hasKnownBadWording) {
    signals.push({
      code: "DRAINER_PATTERN",
      severity: "high",
      title: "Known drainer wording pattern",
      detail: "The text matches common drain, sweep, fake airdrop, or wallet-claim wording.",
    })
  }

  const sandbox = deepScan && domain ? await inspectUrlSandbox(value) : null
  if (sandbox) signals.push(...sandbox.signals)
  const dnaMatch = sandbox?.fingerprint && domain
    ? await findScamDnaMatch(sandbox.fingerprint, domain)
    : null
  const dnaRiskSignal = dnaMatch ? scamDnaSignal(dnaMatch) : null
  if (dnaRiskSignal) signals.push(dnaRiskSignal)

  const resolvedChain = inferUrlChain(chain, sandbox?.fingerprint)
  const result = createResult("url", signals, {
    chain: resolvedChain,
    rpcStatus: "not_applicable",
    domain: domain ?? undefined,
    domainIntelligence: domainIntel,
    extensionSignals: extensionSignals.map((signal) => signal.code),
    domainAge,
    reputation,
    sandbox: sandbox
      ? {
          status: sandbox.status,
          sourceUrl: sandbox.sourceUrl,
          finalUrl: sandbox.finalUrl,
          httpStatus: sandbox.httpStatus,
          contentType: sandbox.contentType,
          contentBytes: sandbox.contentBytes,
          elapsedMs: sandbox.elapsedMs,
          redirectChain: sandbox.redirectChain,
          resolvedAddressCount: sandbox.resolvedAddressCount,
          blockReason: sandbox.blockReason,
          error: sandbox.error,
          behaviorFlags: sandbox.fingerprint?.behaviorFlags ?? [],
          stats: sandbox.fingerprint?.stats,
        }
      : undefined,
    scamDna: sandbox?.fingerprint && dnaMatch
      ? {
          fingerprintKey: sandbox.fingerprint.fingerprintKey,
          clusterKey: sandbox.fingerprint.clusterKey,
          behaviorFlags: sandbox.fingerprint.behaviorFlags,
          walletTargetCount: sandbox.fingerprint.walletTargets.length,
          programTargetCount: sandbox.fingerprint.programTargets.length,
          stats: sandbox.fingerprint.stats,
          match: dnaMatch,
          persisted: false,
        }
      : undefined,
  })

  if (sandbox?.fingerprint && domain && result.metadata.scamDna) {
    result.metadata.scamDna.persisted = await persistScamDna({
      domain,
      sourceUrl: sandbox.sourceUrl,
      finalUrl: sandbox.finalUrl,
      fingerprint: sandbox.fingerprint,
      sandboxSignals: sandbox.signals,
      riskLevel: result.riskLevel,
      score: result.score,
    })
  }

  return result
}

function parsedInfo(accountInfo: ParsedAccountInfo) {
  const data = accountInfo.value?.data
  if (data && typeof data === "object" && !Array.isArray(data)) return data.parsed?.info ?? {}
  return {}
}

async function scanWallet(value: string, chain: ScamGuardChain) {
  const address = normalizeValue(value)
  const signals: ScamGuardSignal[] = []
  const reputation = chain === "solana"
    ? strongestReputation(walletReputation(address), await adminSolanaReputation(address))
    : strongestReputation(walletReputation(address), evmCounterpartyReputation(address), await externalEvmReputation(address))

  if (chain === "evm") {
    if (!evmAddressRegex.test(address)) {
      signals.push({
        code: "INVALID_EVM_ADDRESS",
        severity: "high",
        title: "Invalid EVM address shape",
        detail: "The value does not match the expected 0x-prefixed 20-byte EVM address format.",
      })
    }
    if (/^0x0{40}$/i.test(address)) {
      signals.push({
        code: "ZERO_ADDRESS",
        severity: "medium",
        title: "Zero address",
        detail: "The zero address is not a normal user wallet and can indicate burns, placeholders, or malformed flows.",
      })
    }
    if (reputation.verdict === "known_bad") {
      signals.push({
        code: "KNOWN_BAD_WALLET",
        severity: "critical",
        title: "Known bad wallet pattern",
        detail: "This wallet matches ScamGuard seed intelligence for suspicious infrastructure.",
      })
    }
    return createResult("wallet", signals, {
      chain,
      rpcStatus: "not_applicable",
      walletAddress: address,
      reputation,
    })
  }

  if (!solanaAddressRegex.test(address)) {
    signals.push({
      code: "INVALID_SOLANA_ADDRESS",
      severity: "high",
      title: "Invalid Solana address shape",
      detail: "The value does not match the expected base58 Solana address length and alphabet.",
    })
    return createResult("wallet", signals, { chain, rpcStatus: "skipped", walletAddress: address, reputation })
  }

  if (reputation.verdict === "known_bad" || address.includes("111111")) {
    signals.push({
      code: reputation.verdict === "known_bad" ? "KNOWN_BAD_WALLET" : "SUSPICIOUS_ADDRESS_PATTERN",
      severity: reputation.verdict === "known_bad" ? "critical" : "medium",
      title: reputation.verdict === "known_bad" ? "Known bad wallet pattern" : "Suspicious address pattern",
      detail: reputation.verdict === "known_bad" ? "This wallet matches ScamGuard seed intelligence for suspicious infrastructure." : "The address or supplied label resembles known drainer/test patterns.",
    })
  }

  try {
    const [accountInfo, balance, signatures] = await Promise.all([
      solanaRpc<ParsedAccountInfo>("getAccountInfo", [address, { encoding: "jsonParsed", commitment: "confirmed" }]),
      solanaRpc<{ value?: number }>("getBalance", [address, { commitment: "confirmed" }]),
      solanaRpc<SignaturesResult>("getSignaturesForAddress", [address, { limit: 25, commitment: "confirmed" }]),
    ])
    const owner = accountInfo.value?.owner ?? null

    if (!accountInfo.value) {
      signals.push({
        code: "MISSING_OR_CLOSED_ACCOUNT",
        severity: "medium",
        title: "Account not found on-chain",
        detail: "Missing or closed accounts are risky when shown as reward, token, or claim destinations.",
      })
    } else if (accountInfo.value.executable) {
      signals.push({
        code: "EXECUTABLE_PROGRAM",
        severity: "high",
        title: "Executable program account",
        detail: "Executable accounts are programs, not ordinary user wallets.",
      })
    } else if (owner && owner !== systemProgramId) {
      signals.push({
        code: "PROGRAM_OWNED_ACCOUNT",
        severity: owner === tokenProgramId || owner === token2022ProgramId ? "medium" : "high",
        title: "Program-owned account",
        detail: `This account is owned by ${owner}, not the Solana system program.`,
      })
    }

    if ((signatures?.length ?? 0) <= 1) {
      signals.push({
        code: "LOW_HISTORY",
        severity: "medium",
        title: "Very low transaction history",
        detail: "Brand-new or nearly unused accounts are common in disposable scam infrastructure.",
      })
    }

    return createResult("wallet", signals, {
      chain,
      rpcStatus: "checked",
      walletAddress: address,
      ownerProgram: owner,
      lamports: balance.value ?? 0,
      signatureCount: signatures.length,
      reputation: owner && trustedPrograms.has(owner)
        ? { verdict: "trusted", source: "program_registry", notes: [`Owned by ${trustedPrograms.get(owner)}.`] }
        : reputation,
    })
  } catch (error) {
    return createResult("wallet", signals, {
      chain,
      rpcStatus: getSolanaRpcUrl() ? "failed" : "skipped",
      rpcError: error instanceof Error ? error.message : "Solana RPC failed",
      walletAddress: address,
      reputation,
    })
  }
}

async function scanToken(value: string, chain: ScamGuardChain) {
  const mint = normalizeValue(value)
  const signals: ScamGuardSignal[] = []
  const text = mint.toLowerCase()

  if (chain === "evm") {
    const evmReputation = strongestReputation(walletReputation(mint), evmCounterpartyReputation(mint), await externalEvmReputation(mint))
    if (!evmAddressRegex.test(mint)) {
      signals.push({
        code: "INVALID_EVM_CONTRACT",
        severity: "high",
        title: "Invalid EVM contract address",
        detail: "An EVM token or contract should be a 0x-prefixed 20-byte address.",
      })
    }
    if (/proxy|upgradeable|admin|mint|blacklist|pause|freeze/.test(text)) {
      signals.push({
        code: "EVM_ADMIN_SURFACE_LANGUAGE",
        severity: "medium",
        title: "Admin-control language detected",
        detail: "Proxy, upgrade, pause, blacklist, mint, or freeze wording can indicate centralized token control risk.",
      })
    }
    const contractIntelligence = await evmContractIntelligence(mint)
    const deployerReputation = contractIntelligence.deployer ? await externalEvmReputation(contractIntelligence.deployer) : defaultReputation()
    if (contractIntelligence.checked && contractIntelligence.isContract === false) {
      signals.push({
        code: "EVM_TOKEN_NOT_CONTRACT",
        severity: "high",
        title: "EVM token is not a contract",
        detail: `${contractIntelligence.target} has no bytecode through EVM RPC. Token contract scans should point to deployed contracts, not EOAs.`,
      })
    } else if (contractIntelligence.checked && contractIntelligence.isContract) {
      signals.push({
        code: "EVM_CONTRACT_CODE_FOUND",
        severity: "info",
        title: "Contract bytecode found",
        detail: "EVM RPC found deployed bytecode for this token or contract target.",
      })
    }
    if (contractIntelligence.isContract && contractIntelligence.verified === false) {
      signals.push({
        code: "UNVERIFIED_EVM_CONTRACT",
        severity: "medium",
        title: "EVM contract source is not verified",
        detail: `${contractIntelligence.target} has bytecode but no verified source evidence from Etherscan.`,
      })
    }
    if (contractIntelligence.proxy) {
      signals.push({
        code: "EVM_PROXY_CONTRACT",
        severity: "low",
        title: "Proxy contract detected",
        detail: "Proxy contracts can change implementation behavior through upgrade controls.",
      })
    }
    if (deployerReputation.verdict === "known_bad" && contractIntelligence.deployer) {
      signals.push({
        code: "KNOWN_BAD_DEPLOYER",
        severity: "critical",
        title: "Known bad deployer",
        detail: `${contractIntelligence.deployer} is marked as known bad in ScamGuard deployer intelligence.`,
      })
    }
    if (evmReputation.verdict === "known_bad") {
      signals.push({
        code: "KNOWN_BAD_EVM_CONTRACT",
        severity: "critical",
        title: "Known bad EVM contract or token",
        detail: "This address matched ScamGuard counterparty intelligence or an external threat feed.",
      })
    } else if (evmReputation.verdict === "suspicious") {
      signals.push({
        code: "SUSPICIOUS_EVM_CONTRACT",
        severity: "high",
        title: "Suspicious EVM contract or token",
        detail: "This address is marked suspicious in ScamGuard intelligence.",
      })
    }
    return createResult("token", signals, {
      chain,
      rpcStatus: contractIntelligence.checked ? "checked" : getEvmRpcUrl() ? "failed" : "skipped",
      ownerProgram: evmAddressRegex.test(mint) ? "evm_contract" : null,
      contractIntelligence,
      reputation: evmReputation,
    })
  }

  if (/fake|usdc|airdrop|claim|reward/.test(text)) {
    signals.push({
      code: "BRANDED_TOKEN_LANGUAGE",
      severity: "medium",
      title: "Branded or claim-token wording",
      detail: "Fake branded token mints often include USDC, reward, claim, or airdrop language around the address.",
    })
  }
  if (!solanaAddressRegex.test(mint)) {
    signals.push({
      code: "INVALID_TOKEN_MINT",
      severity: "high",
      title: "Invalid token mint address",
      detail: "A valid SPL token mint should be a base58 Solana address.",
    })
    return createResult("token", signals, { chain, rpcStatus: "skipped" })
  }
  const adminReputation = strongestReputation(walletReputation(mint), await adminSolanaReputation(mint))

  try {
    const accountInfo = await solanaRpc<ParsedAccountInfo>("getAccountInfo", [
      mint,
      { encoding: "jsonParsed", commitment: "confirmed" },
    ])
    const owner = accountInfo.value?.owner ?? null
    const info = parsedInfo(accountInfo)
    const mintAuthority = typeof info.mintAuthority === "string" ? info.mintAuthority : null
    const freezeAuthority = typeof info.freezeAuthority === "string" ? info.freezeAuthority : null
    const supply = typeof info.supply === "string" ? info.supply : undefined
    const decimals = typeof info.decimals === "number" ? info.decimals : undefined

    if (!accountInfo.value) {
      signals.push({
        code: "MINT_NOT_FOUND",
        severity: "high",
        title: "Mint account not found",
        detail: "The token mint was not found through Solana RPC.",
      })
    } else if (owner !== tokenProgramId && owner !== token2022ProgramId) {
      signals.push({
        code: "NOT_SPL_MINT",
        severity: "high",
        title: "Not an SPL token mint",
        detail: "The account is not owned by the SPL Token or Token-2022 program.",
      })
    }
    if (owner && trustedPrograms.has(owner)) {
      signals.push({
        code: "KNOWN_TOKEN_PROGRAM",
        severity: "info",
        title: "Known token program",
        detail: `The mint is owned by ${trustedPrograms.get(owner)}.`,
      })
    }
    if (mintAuthority) {
      signals.push({
        code: "ACTIVE_MINT_AUTHORITY",
        severity: "high",
        title: "Mint authority is still active",
        detail: "The issuer can potentially mint more supply.",
      })
    }
    if (freezeAuthority) {
      signals.push({
        code: "ACTIVE_FREEZE_AUTHORITY",
        severity: "high",
        title: "Freeze authority is still active",
        detail: "The issuer can potentially freeze token accounts.",
      })
    }

    return createResult("token", signals, {
      chain,
      rpcStatus: "checked",
      ownerProgram: owner,
      reputation: owner && trustedPrograms.has(owner)
        ? strongestReputation(adminReputation, { verdict: "trusted", source: "program_registry", notes: [`Owned by ${trustedPrograms.get(owner)}.`] })
        : adminReputation,
      tokenMint: {
        decimals,
        supply,
        mintAuthority,
        freezeAuthority,
        initialized: Boolean(info.isInitialized),
      },
    })
  } catch (error) {
    return createResult("token", signals, {
      chain,
      rpcStatus: getSolanaRpcUrl() ? "failed" : "skipped",
      rpcError: error instanceof Error ? error.message : "Solana RPC failed",
      reputation: adminReputation,
    })
  }
}

function looksBase64(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 80 && /^[A-Za-z0-9+/=]+$/.test(trimmed)
}

async function maybeSimulateTransaction(value: string): Promise<SimulationMetadata> {
  const parsed = safeJson(value)
  const serializedTransaction = parsed && typeof parsed === "object"
    ? (parsed as Record<string, unknown>).serializedTransaction
    : undefined
  const encodedTransaction = typeof serializedTransaction === "string" ? serializedTransaction : value
  if (!looksBase64(encodedTransaction)) return { attempted: false, ok: false }
  try {
    const result = await solanaRpc<SimulateResult>("simulateTransaction", [
      encodedTransaction.trim(),
      { encoding: "base64", commitment: "processed", sigVerify: false, replaceRecentBlockhash: true },
    ])
    return {
      attempted: true,
      ok: !result.value?.err,
      chain: "solana",
      mode: "transaction",
      error: result.value?.err ? JSON.stringify(result.value.err) : undefined,
      logs: result.value?.logs?.slice(0, 20) ?? [],
    }
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      chain: "solana",
      mode: "transaction",
      error: error instanceof Error ? error.message : "Simulation failed",
    }
  }
}

async function maybeSimulateEvmTransaction(value: string): Promise<SimulationMetadata> {
  const parsed = safeJson(value)
  const context = evmRequestContext(parsed)
  const requests = context.batchCalls.length ? context.batchCalls : context.transaction ? [context.transaction] : []
  if (!requests.length || !getEvmRpcUrl()) return { attempted: false, ok: false, chain: "evm", mode: "call" }
  const calls = requests.slice(0, 8).map((transaction) => {
    const to = typeof transaction.to === "string" ? normalizeEvmAddress(transaction.to) : undefined
    const data = typeof transaction.data === "string" ? transaction.data : typeof transaction.input === "string" ? transaction.input : undefined
    const from = typeof transaction.from === "string" ? normalizeEvmAddress(transaction.from) : undefined
    const call: Record<string, string> = {}
    if (to) call.to = to
    if (data) call.data = data
    if (from) call.from = from
    if (typeof transaction.value === "string" && /^0x[0-9a-f]+$/i.test(transaction.value)) call.value = transaction.value
    return call
  }).filter((call) => Object.keys(call).length)
  if (!calls.length) return { attempted: false, ok: false, chain: "evm", mode: "call" }
  try {
    const results = await Promise.allSettled(calls.map((call) => evmRpc<string>("eth_call", [call, "latest"])))
    const failed = results.filter((result) => result.status === "rejected")
    if (failed.length) {
      const first = failed[0]
      throw first.status === "rejected" ? first.reason : new Error("EVM call simulation failed")
    }
    return { attempted: true, ok: true, chain: "evm", mode: "call" }
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      chain: "evm",
      mode: "call",
      error: error instanceof Error ? error.message : "EVM call simulation failed",
    }
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function findStringField(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  for (const key of keys) {
    const item = record[key]
    if (typeof item === "string") return item
  }
  for (const item of Object.values(record)) {
    if (item && typeof item === "object") {
      const nested = findStringField(item, keys)
      if (nested) return nested
    }
  }
  return undefined
}

function evmWordAt(data: string | undefined, index: number) {
  if (!data?.startsWith("0x")) return undefined
  const body = data.slice(10)
  const word = body.slice(index * 64, index * 64 + 64)
  return evmWordRegex.test(word) ? word : undefined
}

function addressFromEvmWord(word?: string) {
  if (!word) return undefined
  return normalizeEvmAddress(`0x${word.slice(24)}`)
}

function uintFromEvmWord(word?: string) {
  if (!word) return undefined
  try {
    return BigInt(`0x${word}`).toString()
  } catch {
    return undefined
  }
}

function decodeEvmCalldata(data?: string) {
  const selector = data?.slice(0, 10).toLowerCase()
  if (!selector) return null
  const first = evmWordAt(data, 0)
  const second = evmWordAt(data, 1)
  const third = evmWordAt(data, 2)

  if (selector === "0x095ea7b3") {
    return { spender: addressFromEvmWord(first), amount: uintFromEvmWord(second) }
  }
  if (selector === "0xa22cb465") {
    return { spender: addressFromEvmWord(first), amount: uintFromEvmWord(second) === "1" ? "all assets" : "disabled" }
  }
  if (selector === "0xd505accf") {
    return { spender: addressFromEvmWord(second), amount: uintFromEvmWord(third) }
  }
  if (selector === "0xa9059cbb") {
    return { recipient: addressFromEvmWord(first), amount: uintFromEvmWord(second) }
  }
  if (selector === "0x23b872dd") {
    return { recipient: addressFromEvmWord(second), amount: uintFromEvmWord(third) }
  }
  return null
}

function scalarField(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  for (const key of keys) {
    const item = record[key]
    if (typeof item === "string" || typeof item === "number" || typeof item === "bigint") return String(item)
  }
  for (const item of Object.values(record)) {
    const nested = scalarField(item, keys)
    if (nested) return nested
  }
  return undefined
}

function parseTypedData(value: unknown) {
  const raw = typeof value === "string" ? value : value && typeof value === "object" ? JSON.stringify(value) : ""
  if (!raw || raw.length > 100_000) return undefined
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const domain = parsed.domain && typeof parsed.domain === "object" ? parsed.domain as Record<string, unknown> : {}
    const message = parsed.message && typeof parsed.message === "object" ? parsed.message as Record<string, unknown> : {}
    const primaryType = typeof parsed.primaryType === "string" ? parsed.primaryType : undefined
    const domainName = typeof domain.name === "string" ? domain.name : undefined
    const verifyingContract = typeof domain.verifyingContract === "string" ? normalizeEvmAddress(domain.verifyingContract) : undefined
    const semanticText = `${primaryType ?? ""} ${Object.keys(message).join(" ")}`.toLowerCase()
    const action: "permit" | "asset_order" | "delegation" | "authorization" | "message" = /permit/.test(semanticText)
      ? "permit"
      : /order|offer|listing|seaport|consideration/.test(semanticText)
        ? "asset_order"
        : /delegate|operator/.test(semanticText)
          ? "delegation"
          : /authorization|transferwithauthorization/.test(semanticText)
            ? "authorization"
            : "message"
    const highImpact = action !== "message"
    return {
      primaryType,
      domainName,
      verifyingContract,
      messageFields: Object.keys(message).slice(0, 8),
      highImpact,
      action,
      spender: scalarField(message, ["spender", "operator", "delegate"]),
      recipient: scalarField(message, ["recipient", "to", "receiver"]),
      amount: scalarField(message, ["amount", "value", "tokenId"]),
      deadline: scalarField(message, ["deadline", "expiry", "expiration"]),
    }
  } catch {
    return undefined
  }
}

function evmRequestContext(parsed: unknown) {
  if (!parsed || typeof parsed !== "object") return { transaction: undefined, typedData: undefined, batchCalls: [] as Array<Record<string, unknown>>, atomicRequired: false }
  const record = parsed as Record<string, unknown>
  const params = Array.isArray(record.params) ? record.params : []
  const batch = params.find((item) => item && typeof item === "object" && !Array.isArray(item) && Array.isArray((item as Record<string, unknown>).calls)) as Record<string, unknown> | undefined
  const transaction = params.find((item) => item && typeof item === "object" && !Array.isArray(item) && (typeof (item as Record<string, unknown>).to === "string" || typeof (item as Record<string, unknown>).data === "string" || typeof (item as Record<string, unknown>).input === "string")) as Record<string, unknown> | undefined
  const typedCandidate = [...params].reverse().find((item) => {
    if (typeof item === "string") return item.includes("\"types\"")
    return Boolean(item && typeof item === "object" && !Array.isArray(item) && ((item as Record<string, unknown>).types || (item as Record<string, unknown>).primaryType || (item as Record<string, unknown>).message))
  })
  const batchCalls = Array.isArray(batch?.calls)
    ? batch.calls.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).slice(0, 12)
    : []
  return { transaction, typedData: parseTypedData(typedCandidate), batchCalls, atomicRequired: batch?.atomicRequired === true }
}

function decodeEvmCall(call: Record<string, unknown>, index = 0) {
  const data = typeof call.data === "string" ? call.data : typeof call.input === "string" ? call.input : undefined
  const selector = data?.slice(0, 10).toLowerCase()
  const selectorMatch = selector ? evmFunctionSelectors.get(selector) : undefined
  const decoded = decodeEvmCalldata(data)
  const category: "approval" | "transfer" | "unknown" = selectorMatch?.category === "approval" || selectorMatch?.category === "transfer"
    ? selectorMatch.category
    : "unknown"
  const amount = decoded?.amount
  const isUnlimited = amount === maxUint256 || amount === "all assets"
  return {
    index,
    to: typeof call.to === "string" ? normalizeEvmAddress(call.to) : undefined,
    method: selectorMatch?.method ?? (selector ? `Unknown call ${selector}` : "Native value call"),
    category,
    spender: decoded?.spender,
    recipient: decoded?.recipient,
    amount,
    value: typeof call.value === "string" ? uintFromEvmWord(call.value.replace(/^0x/, "").padStart(64, "0")) : undefined,
    risk: isUnlimited || category === "approval" ? "high" as const : category === "transfer" ? "medium" as const : "low" as const,
  }
}

function collectInstructionLikeObjects(value: unknown, out: Array<Record<string, unknown>> = []) {
  if (!value || typeof value !== "object") return out
  if (Array.isArray(value)) {
    for (const item of value) collectInstructionLikeObjects(item, out)
    return out
  }
  const record = value as Record<string, unknown>
  const hasInstructionShape =
    typeof record.programId === "string" ||
    typeof record.program === "string" ||
    typeof record.type === "string" ||
    typeof record.instruction === "string"
  if (hasInstructionShape) out.push(record)
  for (const item of Object.values(record)) collectInstructionLikeObjects(item, out)
  return out
}

function decodeSolanaStructuredIntent(parsed: unknown, fallbackText: string, fallbackMethod?: string) {
  const instructions = collectInstructionLikeObjects(parsed)
  const instructionText = [
    fallbackText,
    ...instructions.flatMap((instruction) =>
      Object.entries(instruction).map(([key, value]) => `${key}:${typeof value === "string" ? value : JSON.stringify(value)}`)
    ),
  ].join(" ").toLowerCase()
  const instructionMethod =
    instructions
      .map((instruction) => instruction.type ?? instruction.instruction ?? instruction.program)
      .find((value) => typeof value === "string") as string | undefined
  const method = fallbackMethod ?? instructionMethod
  const declaredInstructionCount =
    parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).instructionCount === "number"
      ? Math.max(0, Math.min(64, Math.floor((parsed as Record<string, unknown>).instructionCount as number)))
      : undefined
  const instructionCount = declaredInstructionCount ?? instructions.length
  const programs = Array.from(new Set(
    instructions
      .map((instruction) => instruction.programLabel ?? instruction.programId)
      .filter((value): value is string => typeof value === "string" && Boolean(value))
  )).slice(0, 4)
  const context = {
    ...(instructionCount ? { instructionCount } : {}),
    ...(programs.length ? { programs } : {}),
  }
  const warnings: string[] = []

  if (/approvechecked|approve|delegate/.test(instructionText)) {
    warnings.push("Structured Solana instructions include delegate approval.")
    return { method, category: "approval" as const, warnings, ...context }
  }
  if (/setauthority|set authority|authoritytype/.test(instructionText)) {
    warnings.push("Structured Solana instructions include an authority change.")
    return { method, category: "authority" as const, warnings, ...context }
  }
  if (/closeaccount|close account/.test(instructionText)) {
    warnings.push("Structured Solana instructions include account close behavior.")
    return { method, category: "account_close" as const, warnings, ...context }
  }
  if (/mintto|mint to/.test(instructionText)) {
    warnings.push("Structured Solana instructions include mint behavior.")
    return { method, category: "mint" as const, warnings, ...context }
  }
  if (/transferchecked|transfer/.test(instructionText)) {
    warnings.push("Structured Solana instructions include asset transfer behavior.")
    return { method, category: "transfer" as const, warnings, ...context }
  }
  if (instructionCount) {
    warnings.push(`ScamGuard identified ${instructionCount} Solana instruction${instructionCount === 1 ? "" : "s"}, but no high-impact token or system action was decoded.`)
    return { method, category: "unknown" as const, warnings, ...context }
  }
  return null
}

function isUnlimitedEvmApproval(decodedIntent: NonNullable<ScamGuardScanResult["metadata"]["decodedIntent"]>, text: string) {
  return (
    decodedIntent.category === "approval" &&
    (decodedIntent.amount === maxUint256 ||
      /0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff|unlimited|maxuint/i.test(text))
  )
}

function decodeIntent(value: string, chain: ScamGuardChain): NonNullable<ScamGuardScanResult["metadata"]["decodedIntent"]> {
  const text = value.toLowerCase()
  const parsed = safeJson(value)
  const requestContext = evmRequestContext(parsed)
  const leadingMethod = /^[a-z][a-z0-9_]{0,64}$/i.exec(value.trim())?.[0]
  const safeLeadingMethod = leadingMethod && /^(sign|transfer|approve|delegate|setauthority|closeaccount|mintto|wallet_|eth_|personal_)/i.test(leadingMethod)
    ? leadingMethod
    : undefined
  const method = findStringField(parsed, ["method", "functionName", "name"]) ?? safeLeadingMethod
  const data =
    (typeof requestContext.transaction?.data === "string" ? requestContext.transaction.data : undefined) ??
    (typeof requestContext.transaction?.input === "string" ? requestContext.transaction.input : undefined) ??
    findStringField(parsed, ["data", "input"]) ??
    (/0x[a-fA-F0-9]{8,}/.exec(value)?.[0])
  const warnings: string[] = []

  if (chain === "evm") {
    if (requestContext.batchCalls.length) {
      const calls = requestContext.batchCalls.map((call, index) => decodeEvmCall(call, index))
      const actionable = calls.filter((call) => call.category !== "unknown")
      const highestRisk = [...calls].sort((left, right) => ({ low: 0, medium: 1, high: 2 }[right.risk] - { low: 0, medium: 1, high: 2 }[left.risk]))[0]
      const category = actionable.find((call) => call.category === "approval")?.category
        ?? actionable.find((call) => call.category === "transfer")?.category
        ?? "unknown"
      warnings.push(`Wallet Call API batch contains ${calls.length} call${calls.length === 1 ? "" : "s"}${requestContext.atomicRequired ? " and requires atomic execution" : ""}.`)
      if (calls.some((call) => call.category === "approval")) warnings.push("At least one batch step grants token or NFT approval.")
      if (calls.some((call) => call.amount === maxUint256 || call.amount === "all assets")) warnings.push("At least one batch step creates an unlimited or all-assets approval.")
      return {
        method: method ?? "wallet_sendCalls",
        category,
        spender: highestRisk?.spender,
        recipient: highestRisk?.recipient,
        amount: highestRisk?.amount,
        batch: {
          totalCalls: calls.length,
          atomicRequired: requestContext.atomicRequired,
          calls,
        },
        warnings,
      }
    }
    const selector = data?.slice(0, 10).toLowerCase()
    const selectorMatch = selector ? evmFunctionSelectors.get(selector) : undefined
    const decodedCalldata = decodeEvmCalldata(data)
    const methodText = method ?? selectorMatch?.method
    const isSignMethod = /personal_sign|eth_sign|eth_signtypeddata|sign/i.test(methodText ?? "")
    if (isSignMethod) {
      const typedData = requestContext.typedData
      warnings.push(typedData?.highImpact
        ? "Typed data resembles a permit, order, authorization, or transfer-capable signature."
        : "Message signatures can authorize off-chain approvals, login challenges, orders, or permit flows.")
      return {
        method: methodText,
        category: "signature",
        spender: typedData?.verifyingContract,
        typedData,
        warnings,
      }
    }
    if (selectorMatch?.category === "approval" || /approve|setapprovalforall|permit/.test(text)) {
      warnings.push("Approval-style EVM call can allow another address or contract to move assets.")
      return {
        method: methodText ?? selectorMatch?.method,
        category: "approval",
        spender: decodedCalldata?.spender ?? findStringField(parsed, ["spender", "operator"]),
        amount: decodedCalldata?.amount ?? findStringField(parsed, ["value", "amount"]),
        warnings,
      }
    }
    if (selectorMatch?.category === "transfer" || /transferfrom|transfer\(/.test(text)) {
      warnings.push("Transfer-style EVM call may move tokens or native assets.")
      return {
        method: methodText ?? selectorMatch?.method,
        category: "transfer",
        recipient: decodedCalldata?.recipient ?? findStringField(parsed, ["to", "recipient"]),
        amount: decodedCalldata?.amount ?? findStringField(parsed, ["value", "amount"]),
        warnings,
      }
    }
    return { method: methodText, category: "unknown", warnings }
  }

  const structuredSolanaIntent = decodeSolanaStructuredIntent(parsed, text, method)
  if (structuredSolanaIntent) return structuredSolanaIntent

  if (/approve|delegate|approvechecked/.test(text)) {
    warnings.push("Delegate approval can let another account move tokens.")
    return { method, category: "approval", warnings }
  }
  if (/set authority|setauthority|authority/.test(text)) {
    warnings.push("Authority changes can transfer control of token accounts or mints.")
    return { method, category: "authority", warnings }
  }
  if (/close.*account|closeaccount|close token/.test(text)) {
    warnings.push("Account close instructions can hide sweeping behavior.")
    return { method, category: "account_close", warnings }
  }
  if (/transfer all|all sol|drain|sweep|empty wallet|transfer/.test(text)) {
    warnings.push("Transfer language suggests asset movement.")
    return { method, category: "transfer", warnings }
  }
  if (/signmessage|sign message/.test(text)) {
    warnings.push("Message signatures can authorize off-chain access, login challenges, orders, or permit-like flows.")
    return { method, category: "signature", warnings }
  }
  return { method, category: "unknown", warnings }
}

async function scanTransaction(value: string, walletAddress: string | undefined, chain: ScamGuardChain, sourceUrl?: string) {
  const text = value.toLowerCase()
  const signals: ScamGuardSignal[] = []
  const decodedIntent = decodeIntent(value, chain)
  const counterpartyAddress = chain === "evm" ? normalizeEvmAddress(decodedIntent.spender ?? decodedIntent.recipient) : undefined
  const counterpartyReputation = chain === "evm"
    ? strongestReputation(evmCounterpartyReputation(counterpartyAddress), await externalEvmReputation(counterpartyAddress))
    : defaultReputation()
  const contractIntelligence = chain === "evm" ? await evmContractIntelligence(counterpartyAddress) : undefined
  const deployerReputation = contractIntelligence?.deployer ? await externalEvmReputation(contractIntelligence.deployer) : defaultReputation()
  const sourceDomain = sourceUrl ? (hostFromUrl(sourceUrl) ?? undefined) : undefined
  const sourceDomainIntel = sourceUrl ? domainIntelligenceFor(sourceUrl) : undefined
  const sourceReputation = sourceDomain ? domainReputation(sourceDomain) : defaultReputation()
  const unlimitedApproval = chain === "evm" && !decodedIntent.batch && isUnlimitedEvmApproval(decodedIntent, text)
  const knownBadCounterparty = counterpartyReputation.verdict === "known_bad"
  const sourceTrusted = sourceReputation.verdict === "trusted"
  const sourceKnownBad = sourceReputation.verdict === "known_bad"

  if (decodedIntent.category === "approval" || /approve|delegate|approvechecked|setapprovalforall|permit/.test(text)) {
    signals.push({
      code: chain === "evm" ? "EVM_APPROVAL" : "DELEGATE_APPROVAL",
      severity: chain === "evm" && decodedIntent.spender && !unlimitedApproval && !knownBadCounterparty ? "medium" : "high",
      title: chain === "evm" ? "EVM approval detected" : "Delegate approval detected",
      detail: chain === "evm"
        ? `Approval-style call detected${decodedIntent.spender ? ` for spender ${decodedIntent.spender}` : " without a decoded spender"}. Review amount and counterparty before signing.`
        : "Delegate approvals can allow another account to move tokens.",
    })
  }
  if (chain === "evm" && decodedIntent.batch?.totalCalls) {
    const approvals = decodedIntent.batch.calls.filter((call) => call.category === "approval")
    const transfers = decodedIntent.batch.calls.filter((call) => call.category === "transfer")
    signals.push({
      code: "EVM_CALL_BATCH",
      severity: approvals.length ? "medium" : "info",
      title: `EVM batch contains ${decodedIntent.batch.totalCalls} call${decodedIntent.batch.totalCalls === 1 ? "" : "s"}`,
      detail: `${approvals.length} approval${approvals.length === 1 ? "" : "s"} and ${transfers.length} transfer${transfers.length === 1 ? "" : "s"} were decoded. Review each step before signing${decodedIntent.batch.atomicRequired ? "; this batch requests atomic execution" : ""}.`,
    })
    if (approvals.some((call) => call.amount === maxUint256 || call.amount === "all assets")) {
      signals.push({
        code: "UNLIMITED_EVM_APPROVAL",
        severity: "critical",
        title: "Unlimited approval inside a batch",
        detail: "One batch step grants an unlimited or all-assets approval. The full batch should be treated as high impact.",
      })
    }
  }
  if (sourceDomain && sourceTrusted) {
    signals.push({
      code: "VERIFIED_TRANSACTION_SOURCE",
      severity: "info",
      title: "Verified transaction source",
      detail: `${sourceDomain} is a verified project domain. ScamGuard still prioritizes the wallet action over domain trust.`,
    })
  }
  if (sourceDomain && sourceKnownBad) {
    signals.push({
      code: "KNOWN_BAD_TRANSACTION_SOURCE",
      severity: "critical",
      title: "Known bad signing source",
      detail: `${sourceDomain} is in ScamGuard threat intelligence and produced or hosted this signing flow.`,
    })
  } else if (sourceDomainIntel?.features.includes("sensitive_redirect") && !sourceTrusted) {
    signals.push({
      code: "TRANSACTION_FROM_REDIRECT_FLOW",
      severity: "medium",
      title: "Signing flow came from redirect URL",
      detail: "The source URL contains redirect-style parameters. Verify the final signing site and wallet prompt carefully.",
    })
  }
  if (chain === "evm" && decodedIntent.category === "approval" && !decodedIntent.spender) {
    signals.push({
      code: "UNKNOWN_APPROVAL_SPENDER",
      severity: "high",
      title: "Approval spender was not decoded",
      detail: "ScamGuard could not identify who would receive approval rights. Treat this as unsafe until the wallet shows the counterparty clearly.",
    })
  }
  if (chain === "evm" && decodedIntent.category === "approval" && !decodedIntent.amount && /0x(095ea7b3|a22cb465|d505accf)/i.test(text)) {
    signals.push({
      code: "INCOMPLETE_EVM_APPROVAL_CALLDATA",
      severity: "high",
      title: "Incomplete approval calldata",
      detail: "The approval selector was detected, but ScamGuard could not decode the expected approval amount. Treat the wallet preview as the source of truth before signing.",
    })
  }
  if (chain === "evm" && decodedIntent.category === "approval" && contractIntelligence?.checked && contractIntelligence.isContract === false) {
    signals.push({
      code: "APPROVAL_TO_EOA",
      severity: "high",
      title: "Approval spender appears to be an EOA",
      detail: `${contractIntelligence.target} has no contract bytecode through EVM RPC. Token approvals to EOAs are unusual and risky.`,
    })
  } else if (chain === "evm" && contractIntelligence?.checked && contractIntelligence.isContract) {
    signals.push({
      code: "COUNTERPARTY_CONTRACT_CODE_FOUND",
      severity: "info",
      title: "Counterparty contract bytecode found",
      detail: `${contractIntelligence.target} has deployed bytecode. Contract code presence reduces EOA uncertainty but does not guarantee safety.`,
    })
  }
  if (chain === "evm" && contractIntelligence?.isContract && contractIntelligence.verified === false) {
    signals.push({
      code: "UNVERIFIED_EVM_CONTRACT",
      severity: decodedIntent.category === "approval" ? "medium" : "low",
      title: "EVM contract source is not verified",
      detail: `${contractIntelligence.target} has bytecode but no verified source evidence from Etherscan.`,
    })
  }
  if (chain === "evm" && contractIntelligence?.proxy) {
    signals.push({
      code: "EVM_PROXY_CONTRACT",
      severity: "low",
      title: "Proxy contract detected",
      detail: "Proxy contracts can change implementation behavior through upgrade controls. Verify the implementation and admin path.",
    })
  }
  if (chain === "evm" && deployerReputation.verdict === "known_bad" && contractIntelligence?.deployer) {
    signals.push({
      code: "KNOWN_BAD_DEPLOYER",
      severity: "critical",
      title: "Known bad deployer",
      detail: `${contractIntelligence.deployer} is marked as known bad in ScamGuard deployer intelligence.`,
    })
  } else if (chain === "evm" && deployerReputation.verdict === "suspicious" && contractIntelligence?.deployer) {
    signals.push({
      code: "SUSPICIOUS_DEPLOYER",
      severity: "high",
      title: "Suspicious deployer",
      detail: `${contractIntelligence.deployer} is marked suspicious in ScamGuard deployer intelligence.`,
    })
  }
  if (chain === "evm" && knownBadCounterparty && counterpartyAddress) {
    signals.push({
      code: "KNOWN_BAD_COUNTERPARTY",
      severity: "critical",
      title: "Known bad spender or recipient",
      detail: `${counterpartyAddress} matches ScamGuard counterparty intelligence for suspicious EVM infrastructure.`,
    })
  } else if (chain === "evm" && counterpartyReputation.verdict === "trusted" && counterpartyAddress) {
    signals.push({
      code: "TRUSTED_COUNTERPARTY",
      severity: "info",
      title: "Recognized EVM counterparty",
      detail: `${counterpartyAddress} is recognized locally. This reduces counterparty uncertainty but does not make the approval amount safe by itself.`,
    })
  } else if (chain === "evm" && decodedIntent.category === "approval" && counterpartyAddress) {
    signals.push({
      code: "UNKNOWN_EVM_COUNTERPARTY",
      severity: "low",
      title: "Unknown EVM approval spender",
      detail: `${counterpartyAddress} has no local reputation. Verify it against the project's official contract addresses before signing.`,
    })
  }
  if (decodedIntent.category === "authority" || /set authority|setauthority|authority/.test(text)) {
    signals.push({
      code: "AUTHORITY_CHANGE",
      severity: "high",
      title: "Authority change detected",
      detail: "Authority changes can transfer control of token accounts or mints.",
    })
  }
  if (decodedIntent.category === "account_close" || /close.*account|closeaccount|close token/.test(text)) {
    signals.push({
      code: "CLOSE_ACCOUNT",
      severity: "medium",
      title: "Close account instruction detected",
      detail: "Account close instructions can be legitimate, but drainers often pair them with sweeping behavior.",
    })
  }
  if (/transfer all|all sol|drain|sweep|empty wallet/.test(text)) {
    signals.push({
      code: "SWEEP_LANGUAGE",
      severity: "critical",
      title: "Sweep or transfer-all intent",
      detail: "The transaction text suggests moving all SOL or assets.",
    })
  }
  if (unlimitedApproval) {
    signals.push({
      code: "UNLIMITED_EVM_APPROVAL",
      severity: "critical",
      title: "Unlimited approval pattern",
      detail: decodedIntent.spender
        ? `This approval appears unlimited for spender ${decodedIntent.spender}. Unlimited approvals are a common path for token drains.`
        : "The transaction resembles an unlimited approval, a common path for token drains.",
    })
  }
  if (chain === "evm" && /wallet_switchethereumchain|switch chain|chainid/.test(text)) {
    signals.push({
      code: "CHAIN_SWITCH_REQUEST",
      severity: "low",
      title: "Chain switch request",
      detail: "Scam flows sometimes ask users to switch networks before a second signing step.",
    })
  }
  if (chain === "evm" && decodedIntent.category === "signature") {
    signals.push({
      code: "EVM_MESSAGE_SIGNATURE",
      severity: /permit|seaport|order|approval/.test(text) ? "high" : "low",
      title: "EVM message signature",
      detail: "Message signatures can be safe login prompts, but they can also authorize orders, permits, or off-chain approvals.",
    })
  }
  if (chain === "evm" && decodedIntent.typedData?.highImpact) {
    signals.push({
      code: "HIGH_IMPACT_TYPED_DATA",
      severity: "high",
      title: "High-impact typed-data signature",
      detail: `${decodedIntent.typedData.primaryType ?? "Typed data"} can authorize a permit, order, transfer, or delegated action without a direct on-chain transfer prompt.`,
    })
  }
  if (chain === "evm" && decodedIntent.typedData?.action === "permit" && decodedIntent.typedData.deadline) {
    signals.push({
      code: "TYPED_DATA_PERMIT_WINDOW",
      severity: "medium",
      title: "Permit signature includes an expiry",
      detail: `This typed-data permit includes expiry ${decodedIntent.typedData.deadline}. Confirm the spender, amount, and expiry in the wallet request.`,
    })
  }
  if (seedPhraseWords.some((word) => text.includes(word))) {
    signals.push({
      code: "SECRET_MATERIAL_IN_TRANSACTION_PROMPT",
      severity: "critical",
      title: "Secret material request",
      detail: "Transaction prompts should never request seed phrase or private key material.",
    })
  }

  const simulation = chain === "evm" ? await maybeSimulateEvmTransaction(value) : await maybeSimulateTransaction(value)
  if (simulation.attempted && !simulation.ok) {
    signals.push({
      code: "SIMULATION_FAILED",
      severity: "medium",
      title: "Transaction simulation failed",
      detail: simulation.error ?? "Solana RPC could not simulate the transaction.",
    })
  }

  return createResult("transaction", signals, {
    chain,
    rpcStatus: contractIntelligence?.checked
      ? "checked"
      : simulation.attempted
        ? getSolanaRpcUrl()
          ? "checked"
          : "skipped"
        : "not_applicable",
    walletAddress,
    simulation,
    decodedIntent,
    domain: sourceDomain,
    domainIntelligence: sourceDomainIntel,
    contractIntelligence,
    reputation: chain === "evm" ? counterpartyReputation : walletAddress ? walletReputation(walletAddress) : defaultReputation(),
  })
}

export async function scanScamGuard(input: ScamGuardScanInput): Promise<ScamGuardScanResult> {
  const value = normalizeValue(input.value)
  // A URL alone does not reliably identify a blockchain. Keep it neutral until
  // the passive sandbox finds a single-chain integration hint.
  const chain = input.type === "url" && normalizeChain(input.chain) === "unknown"
    ? "unknown"
    : inferChain(value, input.chain)
  if (!value) {
    return createResult(input.type, [], { chain, rpcStatus: "not_applicable" })
  }

  if (input.type === "url") return scanUrl(value, chain, input.deepScan ?? false, input.clientSignals)
  if (input.type === "wallet") return scanWallet(value, chain)
  if (input.type === "token") return scanToken(value, chain)
  return scanTransaction(value, input.walletAddress, chain, input.sourceUrl)
}

export function combinedSecurityScore({
  sybilRiskScore,
  scamRiskScore,
}: {
  sybilRiskScore: number
  scamRiskScore: number
}) {
  const sybilSafety = 100 - Math.max(0, Math.min(100, sybilRiskScore))
  const scamSafety = 100 - Math.max(0, Math.min(100, scamRiskScore))
  return Math.round(sybilSafety * 0.62 + scamSafety * 0.38)
}
