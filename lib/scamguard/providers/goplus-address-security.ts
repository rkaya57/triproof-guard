import { createHash } from "node:crypto"

export type GoPlusAddressSecurityEvidence = {
  status: "available" | "unavailable" | "disabled"
  source: "goplus-address-security"
  address: string
  chainId: string
  matched: boolean
  maliciousBehaviors: string[]
  dataSource?: string
  checkedAt: string
  error?: string
}

type TokenCache = { token: string; expiresAt: number }
let tokenCache: TokenCache | null = null

const addressPattern = /^0x[a-fA-F0-9]{40}$/
const tokenEndpoint = "https://api.gopluslabs.io/api/v1/token"
const addressEndpoint = "https://api.gopluslabs.io/api/v1/address_security"
const timeoutMs = 5_000
const maliciousFlags = [
  "honeypot_related_address",
  "phishing_activities",
  "blackmail_activities",
  "stealing_attack",
  "fake_kyc",
  "malicious_mining_activities",
  "darkweb_transactions",
  "cybercrime",
  "money_laundering",
  "financial_crime",
  "blacklist_doubt",
  "gas_abuse",
] as const

function credentials() {
  const appKey = process.env.GOPLUS_APP_KEY?.trim() ?? ""
  const appSecret = process.env.GOPLUS_APP_SECRET?.trim() ?? ""
  return { appKey, appSecret, configured: Boolean(appKey && appSecret) }
}

function normalizeAddress(value: string) {
  const address = value.trim().toLowerCase()
  return addressPattern.test(address) ? address : ""
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function positive(value: unknown) {
  return value === "1" || value === 1 || value === true
}

async function accessToken() {
  const now = Date.now()
  if (tokenCache && tokenCache.expiresAt > now + 30_000) return tokenCache.token
  const { appKey, appSecret, configured } = credentials()
  if (!configured) return null
  const time = Math.floor(now / 1000)
  const sign = createHash("sha1").update(`${appKey}${time}${appSecret}`).digest("hex")
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ app_key: appKey, time, sign }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`GoPlus token request failed with HTTP ${response.status}`)
  const payload = asRecord(await response.json())
  const result = asRecord(payload?.result)
  const token = typeof result?.access_token === "string" ? result.access_token : ""
  const expiresIn = Number(result?.expires_in ?? 0)
  if (!token) throw new Error("GoPlus access token missing from response")
  tokenCache = { token, expiresAt: now + Math.max(60, Number.isFinite(expiresIn) ? expiresIn : 60) * 1000 }
  return token
}

function resultRow(result: unknown, address: string) {
  const root = asRecord(result)
  if (!root) return null
  const keyed = asRecord(root[address]) ?? asRecord(root[address.toLowerCase()])
  return keyed ?? root
}

export async function inspectGoPlusAddressSecurity(
  value: string,
  chainId = "1",
): Promise<GoPlusAddressSecurityEvidence> {
  const checkedAt = new Date().toISOString()
  const address = normalizeAddress(value)
  const { configured } = credentials()
  if (!configured) return { status: "disabled", source: "goplus-address-security", address, chainId, matched: false, maliciousBehaviors: [], checkedAt }
  if (!address) return { status: "unavailable", source: "goplus-address-security", address, chainId, matched: false, maliciousBehaviors: [], checkedAt, error: "Invalid EVM address" }

  try {
    const token = await accessToken()
    if (!token) throw new Error("GoPlus credentials are unavailable")
    const query = new URLSearchParams({ chain_id: chainId })
    const response = await fetch(`${addressEndpoint}/${address}?${query.toString()}`, {
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    })
    if (!response.ok) throw new Error(`GoPlus address-security request failed with HTTP ${response.status}`)
    const payload = asRecord(await response.json())
    const row = resultRow(payload?.result, address)
    if (!row) throw new Error("GoPlus address-security response did not contain address data")
    const maliciousBehaviors = maliciousFlags.filter((flag) => positive(row[flag]))
    const dataSource = typeof row.data_source === "string" ? row.data_source.slice(0, 120) : undefined
    return {
      status: "available",
      source: "goplus-address-security",
      address,
      chainId,
      matched: maliciousBehaviors.length > 0,
      maliciousBehaviors,
      dataSource,
      checkedAt,
    }
  } catch (error) {
    return {
      status: "unavailable",
      source: "goplus-address-security",
      address,
      chainId,
      matched: false,
      maliciousBehaviors: [],
      checkedAt,
      error: error instanceof Error ? error.message.slice(0, 240) : "GoPlus address-security lookup failed",
    }
  }
}

export function resetGoPlusAddressSecurityForTests() {
  tokenCache = null
}
