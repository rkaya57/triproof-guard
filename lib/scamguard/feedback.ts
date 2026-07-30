import { db } from "@/lib/db/prisma"
import { normalizeIntelValue } from "@/lib/scamguard/intelligence"

export type ScamGuardFeedbackVerdict = "reported_scam" | "reported_safe" | "false_positive" | "false_negative"

function feedbackKind(value?: string) {
  const trimmed = value?.trim() ?? ""
  if (/^https?:\/\//i.test(trimmed) || /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/|$)/i.test(trimmed)) return "DOMAIN" as const
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return "EVM_ADDRESS" as const
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) return "SOLANA_ADDRESS" as const
  return null
}

export async function saveScamGuardFeedback(input: {
  scanId?: string
  verdict: ScamGuardFeedbackVerdict
  value?: string
  chain?: string
  reason?: string
  source?: string
}) {
  const value = input.value?.trim().slice(0, 500) || null
  const kind = feedbackKind(value ?? undefined)
  return db.scamGuardFeedbackEvent.create({
    data: {
      scanId: input.scanId?.trim() || null,
      verdict: input.verdict,
      value,
      normalized: kind && value ? normalizeIntelValue(kind, value) : null,
      chain: input.chain?.trim().toLowerCase().slice(0, 32) || null,
      reason: input.reason?.trim().slice(0, 1_000) || null,
      source: input.source?.trim().slice(0, 80) || "public_api",
    },
  })
}

export async function listScamGuardFeedback() {
  return db.scamGuardFeedbackEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { reviewedBy: { select: { email: true } } },
  })
}

export async function reviewScamGuardFeedback(input: {
  id: string
  status: "DISMISSED" | "PROMOTED"
  reviewerId: string
}) {
  return db.scamGuardFeedbackEvent.update({
    where: { id: input.id },
    data: { status: input.status, reviewedById: input.reviewerId, reviewedAt: new Date() },
  })
}
