import { randomUUID } from "node:crypto"
import { domainToASCII, domainToUnicode } from "node:url"

import { Prisma } from "@prisma/client"

import { db } from "@/lib/db/prisma"
import type { ScamGuardRiskLevel, ScamGuardScanResult, ScamGuardScanType } from "@/lib/scamguard/engine"

export type TelegramProjectAssetKind =
  | "DOMAIN"
  | "X_HANDLE"
  | "TELEGRAM_HANDLE"
  | "EVM_ADDRESS"
  | "SOLANA_ADDRESS"
  | "BRAND_ALIAS"

export type TelegramProjectAsset = {
  id: string
  projectId: string
  kind: TelegramProjectAssetKind
  value: string
  normalized: string
  chain: string
  active: boolean
}

export type TelegramProjectRegistryEntry = {
  id: string
  slug: string
  name: string
  normalizedName: string
  notes: string | null
  active: boolean
  createdAt: Date
  updatedAt: Date
  assets: TelegramProjectAsset[]
}

export type RegistryCandidate = {
  type: ScamGuardScanType
  value: string
  chain?: string
}

export type ProjectImpersonationAssessment = {
  projectId: string
  projectName: string
  verified: boolean
  suspicious: boolean
  severity: "high" | "critical" | null
  reason: string
  matchedKind: TelegramProjectAssetKind
  matchedValue: string
}

const confusables: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "5": "s",
  "7": "t",
  а: "a",
  в: "b",
  е: "e",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  х: "x",
  у: "y",
  і: "i",
  ј: "j",
  Α: "a",
  Β: "b",
  Ε: "e",
  Ζ: "z",
  Η: "h",
  Ι: "i",
  Κ: "k",
  Μ: "m",
  Ν: "n",
  Ο: "o",
  Ρ: "p",
  Τ: "t",
  Χ: "x",
  Υ: "y",
  α: "a",
  β: "b",
  ε: "e",
  ι: "i",
  κ: "k",
  ο: "o",
  ρ: "p",
  τ: "t",
  χ: "x",
  υ: "y",
}

let registryCache: { expiresAt: number; entries: TelegramProjectRegistryEntry[] } | null = null

export function normalizeBrandText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split("")
    .map((character) => confusables[character] ?? character)
    .join("")
    .replace(/[^a-z0-9]+/g, "")
}

function cleanHandle(value: string, hosts: string[]) {
  const trimmed = value.trim()
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    if (hosts.includes(url.hostname.toLowerCase().replace(/^www\./, ""))) {
      return url.pathname.split("/").filter(Boolean)[0]?.replace(/^@/, "") ?? ""
    }
  } catch {
    // Plain handles are normalized below.
  }
  return trimmed.replace(/^@/, "").replace(/\/$/, "")
}

export function normalizeProjectAsset(kind: TelegramProjectAssetKind, value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""

  if (kind === "DOMAIN") {
    let host = trimmed
    try {
      const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
      host = url.hostname
    } catch {
      host = trimmed.split("/")[0]
    }
    return domainToASCII(host.toLowerCase().replace(/^www\./, "").replace(/\.$/, ""))
  }
  if (kind === "X_HANDLE") return cleanHandle(trimmed, ["x.com", "twitter.com"]).toLowerCase()
  if (kind === "TELEGRAM_HANDLE") return cleanHandle(trimmed, ["t.me", "telegram.me"]).toLowerCase()
  if (kind === "EVM_ADDRESS") return trimmed.toLowerCase()
  if (kind === "SOLANA_ADDRESS") return trimmed
  return normalizeBrandText(trimmed)
}

function slugifyProject(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `project-${Date.now()}`
  )
}

function parseAssets(value: unknown): TelegramProjectAsset[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is TelegramProjectAsset => {
    if (!item || typeof item !== "object") return false
    const asset = item as Partial<TelegramProjectAsset>
    return Boolean(asset.id && asset.projectId && asset.kind && asset.value && asset.normalized)
  })
}

export async function listTelegramProjectRegistry(options: { includeInactive?: boolean } = {}) {
  const rows = await db.$queryRaw<
    Array<Omit<TelegramProjectRegistryEntry, "assets"> & { assets: unknown }>
  >(
    Prisma.sql`
      SELECT
        p."id",
        p."slug",
        p."name",
        p."normalizedName",
        p."notes",
        p."active",
        p."createdAt",
        p."updatedAt",
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', a."id",
              'projectId', a."projectId",
              'kind', a."kind",
              'value', a."value",
              'normalized', a."normalized",
              'chain', a."chain",
              'active', a."active"
            ) ORDER BY a."kind", a."value"
          ) FILTER (WHERE a."id" IS NOT NULL),
          '[]'::jsonb
        ) AS "assets"
      FROM "TelegramProjectRegistry" p
      LEFT JOIN "TelegramProjectAsset" a
        ON a."projectId" = p."id"
        AND (${Boolean(options.includeInactive)} OR a."active" = TRUE)
      WHERE (${Boolean(options.includeInactive)} OR p."active" = TRUE)
      GROUP BY p."id"
      ORDER BY p."name" ASC
    `
  )

  return rows.map((row) => ({ ...row, assets: parseAssets(row.assets) }))
}

export async function loadActiveTelegramProjectRegistry() {
  const now = Date.now()
  if (registryCache && registryCache.expiresAt > now) return registryCache.entries
  const entries = await listTelegramProjectRegistry()
  registryCache = { entries, expiresAt: now + 60_000 }
  return entries
}

export function invalidateTelegramProjectRegistryCache() {
  registryCache = null
}

export async function createTelegramProjectRegistry(input: {
  name: string
  slug?: string
  notes?: string | null
  assets: Array<{ kind: TelegramProjectAssetKind; value: string; chain?: string }>
}) {
  const id = randomUUID()
  const slug = slugifyProject(input.slug || input.name)
  const normalizedName = normalizeBrandText(input.name)
  const deduplicated = new Map<
    string,
    { id: string; kind: TelegramProjectAssetKind; value: string; normalized: string; chain: string }
  >()

  for (const asset of input.assets) {
    const normalized = normalizeProjectAsset(asset.kind, asset.value)
    if (!normalized) continue
    const chain = asset.chain?.trim().toLowerCase() ?? ""
    deduplicated.set(`${asset.kind}:${normalized}:${chain}`, {
      id: randomUUID(),
      kind: asset.kind,
      value: asset.value.trim(),
      normalized,
      chain,
    })
  }

  if (!deduplicated.size) {
    throw new Error("At least one official project asset is required.")
  }

  await db.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`
        INSERT INTO "TelegramProjectRegistry" (
          "id", "slug", "name", "normalizedName", "notes", "active", "createdAt", "updatedAt"
        )
        VALUES (
          ${id}, ${slug}, ${input.name.trim()}, ${normalizedName},
          ${input.notes?.trim() || null}, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `
    )

    for (const asset of deduplicated.values()) {
      await tx.$executeRaw(
        Prisma.sql`
          INSERT INTO "TelegramProjectAsset" (
            "id", "projectId", "kind", "value", "normalized", "chain", "active", "createdAt", "updatedAt"
          )
          VALUES (
            ${asset.id}, ${id}, ${asset.kind}, ${asset.value}, ${asset.normalized},
            ${asset.chain}, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
        `
      )
    }
  })

  invalidateTelegramProjectRegistryCache()
  return (await listTelegramProjectRegistry({ includeInactive: true })).find((entry) => entry.id === id) ?? null
}

export async function updateTelegramProjectRegistry(input: {
  id: string
  active?: boolean
  name?: string
  notes?: string | null
}) {
  const assignments: Prisma.Sql[] = []
  if (input.active !== undefined) assignments.push(Prisma.sql`"active" = ${input.active}`)
  if (input.name !== undefined) {
    assignments.push(Prisma.sql`"name" = ${input.name.trim()}`)
    assignments.push(Prisma.sql`"normalizedName" = ${normalizeBrandText(input.name)}`)
  }
  if (input.notes !== undefined) assignments.push(Prisma.sql`"notes" = ${input.notes?.trim() || null}`)
  if (!assignments.length) return null

  await db.$executeRaw(
    Prisma.sql`
      UPDATE "TelegramProjectRegistry"
      SET ${Prisma.join(assignments, ", ")}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.id}
    `
  )
  invalidateTelegramProjectRegistryCache()
  return (await listTelegramProjectRegistry({ includeInactive: true })).find((entry) => entry.id === input.id) ?? null
}

export async function deleteTelegramProjectRegistry(id: string) {
  const result = await db.$executeRaw(
    Prisma.sql`DELETE FROM "TelegramProjectRegistry" WHERE "id" = ${id}`
  )
  invalidateTelegramProjectRegistryCache()
  return result > 0
}

export function levenshteinDistance(first: string, second: string) {
  if (first === second) return 0
  if (!first.length) return second.length
  if (!second.length) return first.length

  const previous = Array.from({ length: second.length + 1 }, (_, index) => index)
  for (let row = 1; row <= first.length; row += 1) {
    let diagonal = previous[0]
    previous[0] = row
    for (let column = 1; column <= second.length; column += 1) {
      const above = previous[column]
      const substitution = diagonal + (first[row - 1] === second[column - 1] ? 0 : 1)
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, substitution)
      diagonal = above
    }
  }
  return previous[second.length]
}

function targetAsset(candidate: RegistryCandidate) {
  if (candidate.type === "url") {
    try {
      const url = new URL(candidate.value)
      const hostname = url.hostname.toLowerCase().replace(/^www\./, "")
      if (hostname === "x.com" || hostname === "twitter.com") {
        const handle = url.pathname.split("/").filter(Boolean)[0]
        return handle
          ? { kind: "X_HANDLE" as const, raw: handle, normalized: normalizeProjectAsset("X_HANDLE", handle) }
          : null
      }
      if (hostname === "t.me" || hostname === "telegram.me") {
        const handle = url.pathname.split("/").filter(Boolean)[0]
        if (!handle || handle.startsWith("+")) return null
        return {
          kind: "TELEGRAM_HANDLE" as const,
          raw: handle,
          normalized: normalizeProjectAsset("TELEGRAM_HANDLE", handle),
        }
      }
      return {
        kind: "DOMAIN" as const,
        raw: hostname,
        normalized: normalizeProjectAsset("DOMAIN", hostname),
      }
    } catch {
      return null
    }
  }

  if (/^0x[a-fA-F0-9]{40}$/.test(candidate.value)) {
    return {
      kind: "EVM_ADDRESS" as const,
      raw: candidate.value,
      normalized: normalizeProjectAsset("EVM_ADDRESS", candidate.value),
    }
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(candidate.value)) {
    return {
      kind: "SOLANA_ADDRESS" as const,
      raw: candidate.value,
      normalized: normalizeProjectAsset("SOLANA_ADDRESS", candidate.value),
    }
  }
  return null
}

function domainBrandPart(domain: string) {
  const unicode = domainToUnicode(domain)
  return normalizeBrandText(unicode.split(".")[0] ?? unicode)
}

function comparableAssetValue(kind: TelegramProjectAssetKind, normalized: string) {
  if (kind === "DOMAIN") return domainBrandPart(normalized)
  if (kind === "X_HANDLE" || kind === "TELEGRAM_HANDLE") return normalizeBrandText(normalized)
  return normalized
}

function isOfficialDomain(candidate: string, official: string) {
  return candidate === official || candidate.endsWith(`.${official}`)
}

export function assessProjectImpersonation(
  entries: TelegramProjectRegistryEntry[],
  candidate: RegistryCandidate,
  messageText = ""
): ProjectImpersonationAssessment | null {
  const target = targetAsset(candidate)
  if (!target) return null
  const messageSkeleton = normalizeBrandText(messageText)

  for (const project of entries) {
    if (!project.active) continue
    const aliases = [project.normalizedName, ...project.assets.filter((asset) => asset.kind === "BRAND_ALIAS" && asset.active).map((asset) => asset.normalized)]
    const brandMentioned = aliases.some((alias) => alias.length >= 5 && messageSkeleton.includes(alias))
    const officialAssets = project.assets.filter((asset) => asset.active && asset.kind === target.kind)

    for (const official of officialAssets) {
      const exact = target.kind === "DOMAIN"
        ? isOfficialDomain(target.normalized, official.normalized)
        : target.normalized === official.normalized
      if (exact) {
        return {
          projectId: project.id,
          projectName: project.name,
          verified: true,
          suspicious: false,
          severity: null,
          reason: `The target matches the verified ${project.name} project registry.`,
          matchedKind: target.kind,
          matchedValue: official.value,
        }
      }

      if (target.kind === "EVM_ADDRESS" || target.kind === "SOLANA_ADDRESS") continue
      const candidateComparable = comparableAssetValue(target.kind, target.normalized)
      const officialComparable = comparableAssetValue(target.kind, official.normalized)
      if (!candidateComparable || !officialComparable) continue

      const distance = levenshteinDistance(candidateComparable, officialComparable)
      const threshold = Math.max(candidateComparable.length, officialComparable.length) >= 12 ? 2 : 1
      const skeletonCollision = candidateComparable === officialComparable && target.normalized !== official.normalized
      const containsBrand = aliases.some((alias) => {
        const compactAlias = normalizeBrandText(alias)
        return compactAlias.length >= 5 && candidateComparable.includes(compactAlias)
      })
      const punycode = target.kind === "DOMAIN" && target.normalized.includes("xn--")
      const suspicious = skeletonCollision || distance <= threshold || (brandMentioned && containsBrand)
      if (!suspicious) continue

      return {
        projectId: project.id,
        projectName: project.name,
        verified: false,
        suspicious: true,
        severity: skeletonCollision || punycode ? "critical" : "high",
        reason: `${target.raw} closely resembles the verified ${project.name} ${target.kind.toLowerCase().replaceAll("_", " ")} (${official.value}) but is not an exact registry match.`,
        matchedKind: target.kind,
        matchedValue: official.value,
      }
    }
  }

  return null
}

function riskRank(level: ScamGuardRiskLevel) {
  if (level === "CRITICAL") return 3
  if (level === "HIGH_RISK") return 2
  if (level === "CAUTION") return 1
  return 0
}

export function applyProjectRegistryAssessment(
  result: ScamGuardScanResult,
  assessment: ProjectImpersonationAssessment | null
): ScamGuardScanResult {
  if (!assessment) return result

  if (assessment.verified) {
    return {
      ...result,
      signals: [
        {
          code: "VERIFIED_PROJECT_REGISTRY_MATCH",
          severity: "low",
          title: "Verified project asset",
          detail: assessment.reason,
        },
        ...result.signals,
      ],
      actions: [
        `Verified registry match: ${assessment.projectName}. Still inspect the exact wallet request before signing.`,
        ...result.actions,
      ],
    }
  }

  const critical = assessment.severity === "critical"
  const floorScore = critical ? 94 : 82
  const floorLevel: ScamGuardRiskLevel = critical ? "CRITICAL" : "HIGH_RISK"
  const riskLevel = riskRank(result.riskLevel) >= riskRank(floorLevel) ? result.riskLevel : floorLevel

  return {
    ...result,
    score: Math.max(result.score, floorScore),
    riskLevel,
    confidence: "HIGH",
    summary: `Possible ${assessment.projectName} impersonation detected. ${result.summary}`,
    explanation: `${assessment.reason} ${result.explanation}`,
    signals: [
      {
        code: "PROJECT_IMPERSONATION",
        severity: critical ? "critical" : "high",
        title: "Possible verified-brand impersonation",
        detail: assessment.reason,
      },
      ...result.signals,
    ],
    actions: [
      `Do not connect a wallet. Open ${assessment.projectName} only from a verified registry asset.`,
      ...result.actions,
    ],
  }
}
