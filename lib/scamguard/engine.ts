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
      warnings: string[]
    }
    reputation?: {
      verdict: "trusted" | "unknown" | "suspicious" | "known_bad"
      source: string
      notes: string[]
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

const knownScamDomains = new Set([
  "phantom-airdrop-claim.example",
  "airdrop.orbition.network",
])

const suspiciousTlds = new Set(["zip", "mov", "cam", "click", "top", "xyz"])

const knownBadWallets = new Set([
  "9xQeWvG816bUx9EPfFNtN5B2kWfdrain11111111111111111111".toLowerCase(),
])

const trustedPrograms = new Map([
  [systemProgramId, "Solana System Program"],
  [tokenProgramId, "SPL Token Program"],
  [token2022ProgramId, "SPL Token-2022 Program"],
])

const evmAddressRegex = /^0x[a-fA-F0-9]{40}$/

const evmFunctionSelectors = new Map([
  ["0xa9059cbb", { method: "transfer(address,uint256)", category: "transfer" as const }],
  ["0x23b872dd", { method: "transferFrom(address,address,uint256)", category: "transfer" as const }],
  ["0x095ea7b3", { method: "approve(address,uint256)", category: "approval" as const }],
  ["0xa22cb465", { method: "setApprovalForAll(address,bool)", category: "approval" as const }],
  ["0xd505accf", { method: "permit(...)", category: "approval" as const }],
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

function normalizeValue(value: string) {
  return value.trim()
}

function normalizeChain(chain?: ScamGuardChain): ScamGuardChain {
  if (chain === "solana" || chain === "evm") return chain
  return "unknown"
}

function domainMatchesSet(domain: string | undefined, domains: Set<string>) {
  if (!domain) return false
  return [...domains].some((knownDomain) => domain === knownDomain || domain.endsWith(`.${knownDomain}`))
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
  const chainText = metadata.chain === "evm" ? "EVM" : metadata.chain === "solana" ? "Solana" : "multichain"
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
  if (domainMatchesSet(domain, knownScamDomains)) {
    return { verdict: "known_bad", source: "seed_intelligence", notes: [`${domain} is in the known suspicious domain seed list.`] }
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

function summaryFor(level: ScamGuardRiskLevel) {
  if (level === "CRITICAL") return "Critical drain or account-takeover indicators were found. Do not sign or interact."
  if (level === "HIGH_RISK") return "Multiple serious risk signals were found. Treat this as unsafe until independently verified."
  if (level === "CAUTION") return "Some warning signs were found. Verify the source, wallet popup, and expected asset changes."
  return "No major ScamGuard rule fired. This reduces risk, but it is not a safety guarantee."
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
  return {
    id: crypto.randomUUID(),
    type,
    score,
    riskLevel: level,
    summary: summaryFor(level),
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

function brandMentioned(text: string) {
  return ["phantom", "solflare", "jupiter", "magiceden", "tensor", "backpack"].find((brand) =>
    text.includes(brand)
  )
}

function scanUrl(value: string, chain: ScamGuardChain) {
  const text = value.toLowerCase()
  const url = parsedUrl(value)
  const domain = hostFromUrl(value)
  const path = url?.pathname.toLowerCase() ?? ""
  const tld = domain?.split(".").at(-1) ?? ""
  const reputation = domainReputation(domain ?? undefined)
  const signals: ScamGuardSignal[] = []
  const brand = brandMentioned(text)
  const hasClaimLanguage = highRiskWords.some((word) => text.includes(word))
  const hasCampaignSurface = campaignSurfaceWords.some((word) => path.includes(word))
  const isAppSurface = Boolean(domain?.startsWith("app.") || domain?.startsWith("dapp."))
  const isKnownScamDomain = domainMatchesSet(domain ?? undefined, knownScamDomains)
  const isOfficialDomain = domainMatchesSet(domain ?? undefined, officialDomains)
  const isVerifiedProjectDomain = domainMatchesSet(domain ?? undefined, verifiedProjectDomains)

  if (!domain) {
    signals.push({
      code: "MALFORMED_URL",
      severity: "medium",
      title: "URL is malformed",
      detail: "A malformed URL can hide the real destination or be copied from a suspicious prompt.",
    })
  }
  if (domain && isKnownScamDomain) {
    signals.push({
      code: "KNOWN_SCAM_DOMAIN",
      severity: "critical",
      title: "Known suspicious domain",
      detail: `${domain} is in ScamGuard's seed threat intelligence list.`,
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
      detail: `The .${tld} domain appears with claim or reward language. This combination is common in throwaway scam campaigns.`,
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
      severity: "medium",
      title: "Claim or airdrop language",
      detail: "Scam campaigns often use urgent claim, mint, presale, whitelist, or reward language.",
    })
  }
  if (domain && hasClaimLanguage && !isOfficialDomain && !isVerifiedProjectDomain) {
    signals.push({
      code: "UNVERIFIED_CLAIM_DOMAIN",
      severity: "medium",
      title: "Unverified claim domain",
      detail: `${domain} is not in the trusted Solana domain list. Verify it from the project's official channels before opening or signing.`,
    })
  }
  if (domain && !isOfficialDomain && !isVerifiedProjectDomain && (hasCampaignSurface || isAppSurface)) {
    signals.push({
      code: "UNVERIFIED_WEB3_APP_SURFACE",
      severity: "medium",
      title: "Unverified Web3 app surface",
      detail: `${domain}${path || "/"} looks like a campaign, season, quest, points, or app page. Treat it as unverified until the official project account links to it.`,
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
  if (knownDrainerFragments.some((fragment) => text.includes(fragment))) {
    signals.push({
      code: "DRAINER_PATTERN",
      severity: "high",
      title: "Known drainer wording pattern",
      detail: "The text matches common drain, sweep, fake airdrop, or wallet-claim wording.",
    })
  }

  return createResult("url", signals, {
    chain,
    rpcStatus: "not_applicable",
    domain: domain ?? undefined,
    reputation,
  })
}

function parsedInfo(accountInfo: ParsedAccountInfo) {
  const data = accountInfo.value?.data
  if (data && typeof data === "object" && !Array.isArray(data)) return data.parsed?.info ?? {}
  return {}
}

async function scanWallet(value: string, chain: ScamGuardChain) {
  const address = normalizeValue(value)
  const signals: ScamGuardSignal[] = []
  const reputation = walletReputation(address)

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
    return createResult("token", signals, {
      chain,
      rpcStatus: "not_applicable",
      ownerProgram: evmAddressRegex.test(mint) ? "evm_contract" : null,
      reputation: walletReputation(mint),
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
        ? { verdict: "trusted", source: "program_registry", notes: [`Owned by ${trustedPrograms.get(owner)}.`] }
        : defaultReputation(),
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
    })
  }
}

function looksBase64(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 80 && /^[A-Za-z0-9+/=]+$/.test(trimmed)
}

async function maybeSimulateTransaction(value: string): Promise<SimulationMetadata> {
  if (!looksBase64(value)) return { attempted: false, ok: false }
  try {
    const result = await solanaRpc<SimulateResult>("simulateTransaction", [
      value.trim(),
      { encoding: "base64", commitment: "processed", sigVerify: false, replaceRecentBlockhash: true },
    ])
    return {
      attempted: true,
      ok: !result.value?.err,
      error: result.value?.err ? JSON.stringify(result.value.err) : undefined,
      logs: result.value?.logs?.slice(0, 20) ?? [],
    }
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      error: error instanceof Error ? error.message : "Simulation failed",
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

function decodeIntent(value: string, chain: ScamGuardChain): NonNullable<ScamGuardScanResult["metadata"]["decodedIntent"]> {
  const text = value.toLowerCase()
  const parsed = safeJson(value)
  const method = findStringField(parsed, ["method", "functionName", "name"]) ?? (/^[a-z_]+/i.exec(value.trim())?.[0])
  const data = findStringField(parsed, ["data", "input"]) ?? (/0x[a-fA-F0-9]{8,}/.exec(value)?.[0])
  const warnings: string[] = []

  if (chain === "evm") {
    const selector = data?.slice(0, 10).toLowerCase()
    const selectorMatch = selector ? evmFunctionSelectors.get(selector) : undefined
    const methodText = method ?? selectorMatch?.method
    const isSignMethod = /personal_sign|eth_sign|eth_signtypeddata|sign/i.test(methodText ?? "")
    if (selectorMatch?.category === "approval" || /approve|setapprovalforall|permit/.test(text)) {
      warnings.push("Approval-style EVM call can allow another address or contract to move assets.")
      return { method: methodText ?? selectorMatch?.method, category: "approval", spender: findStringField(parsed, ["spender", "operator", "to"]), warnings }
    }
    if (selectorMatch?.category === "transfer" || /transferfrom|transfer\(/.test(text)) {
      warnings.push("Transfer-style EVM call may move tokens or native assets.")
      return { method: methodText ?? selectorMatch?.method, category: "transfer", recipient: findStringField(parsed, ["to", "recipient"]), amount: findStringField(parsed, ["value", "amount"]), warnings }
    }
    if (isSignMethod) {
      warnings.push("Message signatures can authorize off-chain approvals, login challenges, orders, or permit flows.")
      return { method: methodText, category: "signature", warnings }
    }
    return { method: methodText, category: "unknown", warnings }
  }

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
  return { method, category: "unknown", warnings }
}

async function scanTransaction(value: string, walletAddress: string | undefined, chain: ScamGuardChain) {
  const text = value.toLowerCase()
  const signals: ScamGuardSignal[] = []
  const decodedIntent = decodeIntent(value, chain)

  if (decodedIntent.category === "approval" || /approve|delegate|approvechecked|setapprovalforall|permit/.test(text)) {
    signals.push({
      code: chain === "evm" ? "EVM_APPROVAL" : "DELEGATE_APPROVAL",
      severity: "high",
      title: chain === "evm" ? "EVM approval detected" : "Delegate approval detected",
      detail: chain === "evm" ? "Approvals and permit flows can allow another address or contract to move assets." : "Delegate approvals can allow another account to move tokens.",
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
  if (chain === "evm" && /0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff|unlimited|maxuint/.test(text)) {
    signals.push({
      code: "UNLIMITED_EVM_APPROVAL",
      severity: "critical",
      title: "Unlimited approval pattern",
      detail: "The transaction resembles an unlimited approval, a common path for token drains.",
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
  if (seedPhraseWords.some((word) => text.includes(word))) {
    signals.push({
      code: "SECRET_MATERIAL_IN_TRANSACTION_PROMPT",
      severity: "critical",
      title: "Secret material request",
      detail: "Transaction prompts should never request seed phrase or private key material.",
    })
  }

  const simulation = await maybeSimulateTransaction(value)
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
    rpcStatus: simulation.attempted ? (getSolanaRpcUrl() ? "checked" : "skipped") : "not_applicable",
    walletAddress,
    simulation,
    decodedIntent,
    reputation: walletAddress ? walletReputation(walletAddress) : defaultReputation(),
  })
}

export async function scanScamGuard(input: ScamGuardScanInput): Promise<ScamGuardScanResult> {
  const value = normalizeValue(input.value)
  const chain = inferChain(value, input.chain)
  if (!value) {
    return createResult(input.type, [], { chain, rpcStatus: "not_applicable" })
  }

  if (input.type === "url") return scanUrl(value, chain)
  if (input.type === "wallet") return scanWallet(value, chain)
  if (input.type === "token") return scanToken(value, chain)
  return scanTransaction(value, input.walletAddress, chain)
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
