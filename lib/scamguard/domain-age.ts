export type DomainAgeEvidence = {
  status: "available" | "unavailable"
  createdAt?: string
  ageDays?: number
  source: "rdap"
}

type CacheEntry = { expiresAt: number; value: DomainAgeEvidence }
const cache = new Map<string, CacheEntry>()
const ttlMs = 6 * 60 * 60 * 1000

function isPublicDomain(domain: string) {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain) && domain.length <= 253
}

function createdAtFromRdap(value: unknown) {
  if (!value || typeof value !== "object") return null
  const events = (value as { events?: Array<{ eventAction?: unknown; eventDate?: unknown }> }).events
  const created = events?.find((event) => event.eventAction === "registration" || event.eventAction === "registered")?.eventDate
  if (typeof created !== "string") return null
  const date = new Date(created)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function inspectDomainAge(domain?: string): Promise<DomainAgeEvidence> {
  const normalized = domain?.trim().toLowerCase().replace(/\.$/, "") ?? ""
  if (!isPublicDomain(normalized)) return { status: "unavailable", source: "rdap" }
  const cached = cache.get(normalized)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  let value: DomainAgeEvidence = { status: "unavailable", source: "rdap" }
  try {
    const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(normalized)}`, {
      headers: { Accept: "application/rdap+json, application/json" },
      signal: AbortSignal.timeout(2_500),
      cache: "no-store",
    })
    if (response.ok) {
      const createdAt = createdAtFromRdap(await response.json())
      if (createdAt) value = { status: "available", source: "rdap", createdAt: createdAt.toISOString(), ageDays: Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86_400_000)) }
    }
  } catch {
    // RDAP is additive evidence only; a failed lookup never changes the verdict.
  }
  cache.set(normalized, { value, expiresAt: Date.now() + ttlMs })
  return value
}
