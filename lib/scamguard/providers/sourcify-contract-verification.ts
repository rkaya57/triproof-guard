const evmAddressPattern = /^0x[a-fA-F0-9]{40}$/
const CACHE_TTL_MS = 30 * 60 * 1000
const REQUEST_TIMEOUT_MS = 3500

type CacheEntry = {
  loadedAt: number
  evidence: SourcifyContractVerificationEvidence
}

const cache = new Map<string, CacheEntry>()

export type SourcifyContractVerificationEvidence = {
  source: "sourcify-contract-verification"
  status: "available" | "unavailable"
  checkedAt: string
  address: string
  chainId: "1"
  isContract?: boolean
  verifiedBySourcify?: boolean
  match?: string
  note: string
}

function evmRpcUrl() {
  return process.env.EVM_RPC_URL?.trim()
    || process.env.ETH_RPC_URL?.trim()
    || process.env.ETHEREUM_RPC_URL?.trim()
    || null
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fn(controller.signal)
  } finally {
    clearTimeout(timeout)
  }
}

async function hasContractCode(address: string) {
  const rpcUrl = evmRpcUrl()
  if (!rpcUrl) return null
  try {
    return await withTimeout(async (signal) => {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] }),
        cache: "no-store",
        signal,
      })
      if (!response.ok) return null
      const payload = await response.json() as { result?: unknown; error?: unknown }
      if (payload.error || typeof payload.result !== "string") return null
      return payload.result !== "0x" && payload.result !== "0x0"
    })
  } catch {
    return null
  }
}

async function lookupSourcify(address: string) {
  try {
    return await withTimeout(async (signal) => {
      const response = await fetch(`https://sourcify.dev/server/v2/contract/1/${address}`, {
        cache: "no-store",
        signal,
        headers: { Accept: "application/json" },
      })
      if (response.status === 404) return { available: true as const, verified: false as const }
      if (!response.ok) return { available: false as const, verified: false as const }
      const payload = await response.json() as { match?: unknown }
      return {
        available: true as const,
        verified: true as const,
        match: typeof payload.match === "string" ? payload.match : undefined,
      }
    })
  } catch {
    return { available: false as const, verified: false as const }
  }
}

export async function inspectSourcifyContractVerification(rawAddress: string): Promise<SourcifyContractVerificationEvidence> {
  const address = rawAddress.trim().toLowerCase()
  const checkedAt = new Date().toISOString()
  if (!evmAddressPattern.test(address)) {
    return {
      source: "sourcify-contract-verification",
      status: "unavailable",
      checkedAt,
      address,
      chainId: "1",
      note: "The supplied value is not a valid EVM address.",
    }
  }

  const cached = cache.get(address)
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.evidence

  const isContract = await hasContractCode(address)
  if (isContract === null) {
    const evidence: SourcifyContractVerificationEvidence = {
      source: "sourcify-contract-verification",
      status: "unavailable",
      checkedAt,
      address,
      chainId: "1",
      note: "EVM RPC contract-code inspection was unavailable, so Sourcify absence is not interpreted as contract-integrity evidence.",
    }
    cache.set(address, { loadedAt: Date.now(), evidence })
    return evidence
  }

  if (!isContract) {
    const evidence: SourcifyContractVerificationEvidence = {
      source: "sourcify-contract-verification",
      status: "available",
      checkedAt,
      address,
      chainId: "1",
      isContract: false,
      note: "EVM RPC reports no bytecode at this address. Sourcify verification absence is therefore not used as a risk signal.",
    }
    cache.set(address, { loadedAt: Date.now(), evidence })
    return evidence
  }

  const sourcify = await lookupSourcify(address)
  const evidence: SourcifyContractVerificationEvidence = sourcify.available
    ? {
        source: "sourcify-contract-verification",
        status: "available",
        checkedAt,
        address,
        chainId: "1",
        isContract: true,
        verifiedBySourcify: sourcify.verified,
        match: sourcify.match,
        note: sourcify.verified
          ? `RPC confirms contract bytecode and Sourcify reports${sourcify.match ? ` ${sourcify.match}` : " a"} verification record.`
          : "RPC confirms contract bytecode, but Sourcify v2 has no verification record for this address. This is weak contract-integrity context and is only risk-bearing when independently corroborated.",
      }
    : {
        source: "sourcify-contract-verification",
        status: "unavailable",
        checkedAt,
        address,
        chainId: "1",
        isContract: true,
        note: "RPC confirms contract bytecode, but the Sourcify lookup was unavailable. No verification-absence signal is emitted.",
      }
  cache.set(address, { loadedAt: Date.now(), evidence })
  return evidence
}
