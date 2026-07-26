export type ScamGuardScanType = "url" | "wallet" | "token" | "transaction"

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
}

export type ScamGuardScanResult = {
  id: string
  type: ScamGuardScanType
  score: number
  riskLevel: ScamGuardRiskLevel
  summary: string
  signals: ScamGuardSignal[]
  actions: string[]
  metadata: {
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
  const score = Math.min(100, Math.max(0, 8 + signals.reduce((sum, signal) => sum + signalWeight(signal.severity), 0)))
  const level = riskLevel(score)
  return {
    id: crypto.randomUUID(),
    type,
    score,
    riskLevel: level,
    summary: summaryFor(level),
    signals: signals.length
      ? signals
      : [
          {
            code: "NO_HIGH_CONFIDENCE_MATCH",
            severity: "info",
            title: "No high-confidence rule matched",
            detail: "Still verify the official source and expected wallet changes before signing.",
          },
        ],
    actions: actionsFor(level),
    metadata,
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

function brandMentioned(text: string) {
  return ["phantom", "solflare", "jupiter", "magiceden", "tensor", "backpack"].find((brand) =>
    text.includes(brand)
  )
}

function scanUrl(value: string) {
  const text = value.toLowerCase()
  const domain = hostFromUrl(value)
  const signals: ScamGuardSignal[] = []
  const brand = brandMentioned(text)

  if (!domain) {
    signals.push({
      code: "MALFORMED_URL",
      severity: "medium",
      title: "URL is malformed",
      detail: "A malformed URL can hide the real destination or be copied from a suspicious prompt.",
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
  if (brand && domain && !officialDomains.has(domain)) {
    signals.push({
      code: "BRAND_IMPERSONATION",
      severity: "high",
      title: "Known Solana brand appears on an untrusted domain",
      detail: `${brand} is mentioned, but the domain is ${domain}.`,
    })
  }
  if (highRiskWords.some((word) => text.includes(word))) {
    signals.push({
      code: "CLAIM_LANGUAGE",
      severity: "medium",
      title: "Claim or airdrop language",
      detail: "Scam campaigns often use urgent claim, mint, presale, whitelist, or reward language.",
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

  return createResult("url", signals, { rpcStatus: "not_applicable", domain: domain ?? undefined })
}

function parsedInfo(accountInfo: ParsedAccountInfo) {
  const data = accountInfo.value?.data
  if (data && typeof data === "object" && !Array.isArray(data)) return data.parsed?.info ?? {}
  return {}
}

async function scanWallet(value: string) {
  const address = normalizeValue(value)
  const signals: ScamGuardSignal[] = []

  if (!solanaAddressRegex.test(address)) {
    signals.push({
      code: "INVALID_SOLANA_ADDRESS",
      severity: "high",
      title: "Invalid Solana address shape",
      detail: "The value does not match the expected base58 Solana address length and alphabet.",
    })
    return createResult("wallet", signals, { rpcStatus: "skipped", walletAddress: address })
  }

  if (knownDrainerFragments.some((fragment) => address.toLowerCase().includes(fragment)) || address.includes("111111")) {
    signals.push({
      code: "SUSPICIOUS_ADDRESS_PATTERN",
      severity: "medium",
      title: "Suspicious address pattern",
      detail: "The address or supplied label resembles known drainer/test patterns.",
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
      rpcStatus: "checked",
      walletAddress: address,
      ownerProgram: owner,
      lamports: balance.value ?? 0,
      signatureCount: signatures.length,
    })
  } catch (error) {
    return createResult("wallet", signals, {
      rpcStatus: getSolanaRpcUrl() ? "failed" : "skipped",
      rpcError: error instanceof Error ? error.message : "Solana RPC failed",
      walletAddress: address,
    })
  }
}

async function scanToken(value: string) {
  const mint = normalizeValue(value)
  const signals: ScamGuardSignal[] = []
  const text = mint.toLowerCase()

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
    return createResult("token", signals, { rpcStatus: "skipped" })
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
      rpcStatus: "checked",
      ownerProgram: owner,
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

async function scanTransaction(value: string, walletAddress?: string) {
  const text = value.toLowerCase()
  const signals: ScamGuardSignal[] = []

  if (/approve|delegate|approvechecked/.test(text)) {
    signals.push({
      code: "DELEGATE_APPROVAL",
      severity: "high",
      title: "Delegate approval detected",
      detail: "Delegate approvals can allow another account to move tokens.",
    })
  }
  if (/set authority|setauthority|authority/.test(text)) {
    signals.push({
      code: "AUTHORITY_CHANGE",
      severity: "high",
      title: "Authority change detected",
      detail: "Authority changes can transfer control of token accounts or mints.",
    })
  }
  if (/close.*account|closeaccount|close token/.test(text)) {
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
    rpcStatus: simulation.attempted ? (getSolanaRpcUrl() ? "checked" : "skipped") : "not_applicable",
    walletAddress,
    simulation,
  })
}

export async function scanScamGuard(input: ScamGuardScanInput): Promise<ScamGuardScanResult> {
  const value = normalizeValue(input.value)
  if (!value) {
    return createResult(input.type, [], { rpcStatus: "not_applicable" })
  }

  if (input.type === "url") return scanUrl(value)
  if (input.type === "wallet") return scanWallet(value)
  if (input.type === "token") return scanToken(value)
  return scanTransaction(value, input.walletAddress)
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
