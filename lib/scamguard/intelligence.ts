import type { ScamGuardIntelKind, ScamGuardIntelVerdict } from "@prisma/client"

import { db } from "@/lib/db/prisma"

export type ScamGuardIntelInput = {
  kind: ScamGuardIntelKind
  value: string
  chain?: string | null
  verdict: ScamGuardIntelVerdict
  label: string
  source?: string
  notes?: string | null
  active?: boolean
  createdById?: string | null
}

function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")
}

export function normalizeIntelValue(kind: ScamGuardIntelKind, value: string) {
  const trimmed = value.trim()
  if (kind === "DOMAIN") return normalizeDomain(trimmed)
  if (kind === "EVM_ADDRESS" || kind === "CONTRACT" || kind === "TOKEN") {
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return trimmed.toLowerCase()
  }
  return trimmed.toLowerCase()
}

export async function listScamGuardIntelEntries() {
  return db.scamGuardIntelEntry.findMany({
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
    take: 250,
  })
}

export async function upsertScamGuardIntelEntry(input: ScamGuardIntelInput) {
  const normalized = normalizeIntelValue(input.kind, input.value)
  const chain = input.chain?.trim().toLowerCase() || ""

  return db.scamGuardIntelEntry.upsert({
    where: {
      kind_normalized_chain: {
        kind: input.kind,
        normalized,
        chain,
      },
    },
    create: {
      kind: input.kind,
      value: input.value.trim(),
      normalized,
      chain,
      verdict: input.verdict,
      label: input.label.trim(),
      source: input.source?.trim() || "admin",
      notes: input.notes?.trim() || null,
      active: input.active ?? true,
      createdById: input.createdById ?? null,
    },
    update: {
      value: input.value.trim(),
      verdict: input.verdict,
      label: input.label.trim(),
      source: input.source?.trim() || "admin",
      notes: input.notes?.trim() || null,
      active: input.active ?? true,
    },
  })
}

export async function deleteScamGuardIntelEntry(id: string) {
  return db.scamGuardIntelEntry.delete({ where: { id } })
}

export async function findScamGuardIntelEntry(kind: ScamGuardIntelKind, value: string, chain?: string | null) {
  if (!process.env.DATABASE_URL) return null
  const normalized = normalizeIntelValue(kind, value)
  const normalizedChain = chain?.trim().toLowerCase() || ""
  try {
    return await db.scamGuardIntelEntry.findFirst({
      where: {
        kind,
        normalized,
        active: true,
        OR: [{ chain: normalizedChain }, { chain: "" }],
      },
      orderBy: [{ chain: "desc" }, { updatedAt: "desc" }],
    })
  } catch {
    return null
  }
}
