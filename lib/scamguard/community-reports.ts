import { z } from "zod"

import { db } from "@/lib/db/prisma"
import { normalizeIntelValue, upsertScamGuardIntelEntry } from "@/lib/scamguard/intelligence"

export const communityThreatTargetKinds = ["DOMAIN", "WALLET", "EVM_ADDRESS", "SOLANA_ADDRESS", "TOKEN", "CONTRACT"] as const
export const communityThreatCategories = ["phishing", "wallet_drainer", "fake_airdrop", "rug_pull", "impersonation", "malicious_contract", "other"] as const
export const communityThreatChains = ["solana", "evm", "multichain", "unknown"] as const

export type CommunityThreatTargetKind = (typeof communityThreatTargetKinds)[number]

const targetKindSchema = z.enum(communityThreatTargetKinds)

export const communityThreatReportSchema = z.object({
  projectName: z.string().trim().min(3, "Project name must be at least 3 characters.").max(120),
  target: z.string().trim().min(3, "A domain, wallet, token, or contract target is required.").max(500),
  targetKind: targetKindSchema,
  chain: z.enum(communityThreatChains).default("unknown"),
  category: z.enum(communityThreatCategories),
  description: z.string().trim().min(30, "Please provide at least 30 characters of evidence.").max(4_000),
  evidenceUrl: z.union([
    z.url().refine((value) => /^https?:\/\//i.test(value), "Evidence URLs must use http or https."),
    z.literal(""),
  ]).optional(),
  evidenceNote: z.string().trim().max(1_000).optional(),
})

export type CommunityThreatReportInput = z.infer<typeof communityThreatReportSchema>

export function normalizeCommunityThreatTarget(kind: CommunityThreatTargetKind, target: string) {
  return normalizeIntelValue(kind, target)
}

export function isValidCommunityThreatTarget(kind: CommunityThreatTargetKind, target: string) {
  const value = target.trim()
  if (kind === "DOMAIN") {
    const host = value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0]
    return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)
  }
  if (kind === "EVM_ADDRESS" || kind === "CONTRACT") return /^0x[a-fA-F0-9]{40}$/.test(value)
  if (kind === "SOLANA_ADDRESS" || kind === "WALLET" || kind === "TOKEN") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)
  return false
}

export async function createCommunityThreatReport(input: CommunityThreatReportInput, reporterId: string) {
  const normalizedTarget = normalizeCommunityThreatTarget(input.targetKind, input.target)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1_000)
  const [recentCount, existing] = await Promise.all([
    db.communityThreatReport.count({ where: { reporterId, createdAt: { gte: oneHourAgo } } }),
    db.communityThreatReport.findFirst({
      where: { reporterId, normalizedTarget, status: "PENDING" },
      select: { id: true },
    }),
  ])
  if (recentCount >= 5) throw new CommunityThreatReportError("You can submit up to five reports per hour.", "RATE_LIMITED")
  if (existing) throw new CommunityThreatReportError("You already have a pending report for this target.", "DUPLICATE_PENDING")

  return db.communityThreatReport.create({
    data: {
      reporterId,
      projectName: input.projectName,
      target: input.target,
      normalizedTarget,
      targetKind: input.targetKind,
      chain: input.chain === "unknown" ? null : input.chain,
      category: input.category,
      description: input.description,
      evidenceUrl: input.evidenceUrl?.trim() || null,
      evidenceNote: input.evidenceNote?.trim() || null,
    },
  })
}

export async function listPublishedCommunityThreatReports() {
  return db.communityThreatReport.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      projectName: true,
      target: true,
      targetKind: true,
      chain: true,
      category: true,
      description: true,
      evidenceUrl: true,
      evidenceNote: true,
      publishedAt: true,
      createdAt: true,
      promotedIntelEntryId: true,
    },
  })
}

export async function listCommunityThreatReportsForAdmin() {
  return db.communityThreatReport.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 250,
    include: {
      reporter: { select: { name: true, email: true } },
      reviewer: { select: { name: true, email: true } },
    },
  })
}

export async function reviewCommunityThreatReport(input: {
  id: string
  status: "PUBLISHED" | "REJECTED"
  reviewerId: string
  reviewerNote?: string
  promoteToIntel?: boolean
}) {
  const report = await db.communityThreatReport.findUnique({ where: { id: input.id } })
  if (!report) throw new CommunityThreatReportError("Threat report not found.", "NOT_FOUND")
  if (report.status !== "PENDING") throw new CommunityThreatReportError("This report has already been reviewed.", "ALREADY_REVIEWED")

  let promotedIntelEntryId: string | null = null
  if (input.status === "PUBLISHED" && input.promoteToIntel) {
    const entry = await upsertScamGuardIntelEntry({
      kind: report.targetKind as CommunityThreatTargetKind,
      value: report.target,
      chain: report.chain,
      verdict: "KNOWN_BAD",
      label: report.projectName,
      source: "community_review",
      notes: [report.description, report.evidenceUrl ? `Evidence: ${report.evidenceUrl}` : null, report.evidenceNote].filter(Boolean).join("\n\n").slice(0, 5_000),
      active: true,
      createdById: input.reviewerId,
    })
    promotedIntelEntryId = entry.id
  }

  return db.communityThreatReport.update({
    where: { id: report.id },
    data: {
      status: input.status,
      reviewerId: input.reviewerId,
      reviewerNote: input.reviewerNote?.trim().slice(0, 1_000) || null,
      promotedIntelEntryId,
      publishedAt: input.status === "PUBLISHED" ? new Date() : null,
    },
  })
}

export class CommunityThreatReportError extends Error {
  constructor(message: string, readonly code: "RATE_LIMITED" | "DUPLICATE_PENDING" | "NOT_FOUND" | "ALREADY_REVIEWED") {
    super(message)
  }
}
