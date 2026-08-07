import type { Prisma, ScamDnaVerdict } from "@prisma/client"

import { db } from "@/lib/db/prisma"
import type { ScamDnaFingerprintData, SandboxStaticSignal } from "@/lib/scamguard/html-fingerprint"

export type ScamDnaMatch = {
  matched: boolean
  actionable: boolean
  similarity: number
  confidence: "LOW" | "MEDIUM" | "HIGH"
  verdict: "unknown" | "suspicious" | "known_bad"
  campaignId?: string
  campaignLabel?: string
  matchedDomain?: string
  crossDomain: boolean
  evidence: string[]
}

export type ScamDnaMetadata = {
  fingerprintKey: string
  clusterKey: string
  behaviorFlags: string[]
  walletTargetCount: number
  programTargetCount: number
  stats: ScamDnaFingerprintData["stats"]
  match: ScamDnaMatch
  persisted: boolean
}

const riskRank: Record<string, number> = {
  SAFE: 0,
  CAUTION: 1,
  HIGH_RISK: 2,
  CRITICAL: 3,
}

function stringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []
}

function overlap(left: string[], right: string[]) {
  if (!left.length || !right.length) return 0
  const rightSet = new Set(right.map((value) => value.toLowerCase()))
  const matches = new Set(left.map((value) => value.toLowerCase()).filter((value) => rightSet.has(value))).size
  return matches / Math.max(new Set(left.map((value) => value.toLowerCase())).size, rightSet.size)
}

function jaccard(left: string[], right: string[]) {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  const union = new Set([...leftSet, ...rightSet])
  if (!union.size) return 0
  let intersection = 0
  for (const value of leftSet) if (rightSet.has(value)) intersection += 1
  return intersection / union.size
}

function hasGroundedAutomatedThreatEvidence(behaviorFlags: string[], targetOverlap: number) {
  const flags = new Set(behaviorFlags)
  return (
    flags.has("secret_input_field") ||
    flags.has("automatic_download") ||
    (flags.has("wallet_signing_api") && flags.has("obfuscated_script")) ||
    (flags.has("wallet_signing_api") && flags.has("hidden_iframe")) ||
    targetOverlap > 0
  )
}

export function compareScamDna(
  fingerprint: ScamDnaFingerprintData,
  candidate: {
    domain: string
    contentHash: string
    domHash: string
    scriptHash: string
    textHash: string
    styleHash: string
    faviconUrlHash: string
    redirectHash: string
    behaviorHash: string
    behaviorFlags: string[]
    walletTargets: string[]
    programTargets: string[]
    riskLevel: string
    campaign?: { id: string; verdict: ScamDnaVerdict; label: string | null } | null
  },
  currentDomain: string
): ScamDnaMatch {
  const evidence: string[] = []
  let similarity = 0
  let strongComponents = 0

  const exact = (matches: boolean, weight: number, label: string, strong = false) => {
    if (!matches) return
    similarity += weight
    evidence.push(label)
    if (strong) strongComponents += 1
  }

  exact(fingerprint.contentHash === candidate.contentHash, 0.34, "identical page content", true)
  exact(fingerprint.domHash === candidate.domHash, 0.22, "matching DOM structure", true)
  exact(fingerprint.scriptHash === candidate.scriptHash && fingerprint.stats.scriptCount > 0, 0.25, "matching script bundle", true)
  exact(fingerprint.textHash === candidate.textHash, 0.10, "matching normalized copy")
  exact(fingerprint.styleHash === candidate.styleHash, 0.06, "matching style assets")
  exact(fingerprint.faviconUrlHash === candidate.faviconUrlHash, 0.03, "matching favicon route")
  exact(fingerprint.redirectHash === candidate.redirectHash, 0.05, "matching redirect path")
  exact(fingerprint.behaviorHash === candidate.behaviorHash && fingerprint.behaviorFlags.length > 0, 0.12, "matching behavior signature", true)

  const behaviorOverlap = jaccard(fingerprint.behaviorFlags, candidate.behaviorFlags)
  if (behaviorOverlap >= 0.5) {
    similarity += behaviorOverlap * 0.08
    evidence.push(`${Math.round(behaviorOverlap * 100)}% behavior overlap`)
  }
  const walletOverlap = overlap(fingerprint.walletTargets, candidate.walletTargets)
  const programOverlap = overlap(fingerprint.programTargets, candidate.programTargets)
  const targetOverlap = Math.max(walletOverlap, programOverlap)
  if (targetOverlap > 0) {
    similarity += Math.min(0.25, targetOverlap * 0.25)
    evidence.push("shared wallet, contract, or program target")
    strongComponents += 1
  }

  similarity = Math.min(1, similarity)
  const crossDomain = candidate.domain !== currentDomain
  const campaignVerdict = candidate.campaign?.verdict ?? "UNKNOWN"
  const reviewedCampaign = campaignVerdict === "KNOWN_BAD" || campaignVerdict === "SUSPICIOUS"
  const riskySource = candidate.riskLevel === "CRITICAL" || candidate.riskLevel === "HIGH_RISK"
  const corroboratedClone = crossDomain && strongComponents >= 2 && similarity >= 0.72
  const groundedAutomatedSource = riskySource && hasGroundedAutomatedThreatEvidence(candidate.behaviorFlags, targetOverlap)
  const actionable = corroboratedClone && (reviewedCampaign || groundedAutomatedSource)
  const verdict = campaignVerdict === "KNOWN_BAD"
    ? "known_bad"
    : actionable
      ? "suspicious"
      : "unknown"

  if (corroboratedClone && riskySource && !reviewedCampaign && !groundedAutomatedSource) {
    evidence.push("unreviewed source lacks grounded malicious behavior; clone match remains context-only")
  }

  return {
    matched: similarity >= 0.55 && strongComponents >= 1,
    actionable,
    similarity,
    confidence: similarity >= 0.86 && strongComponents >= 3 ? "HIGH" : similarity >= 0.72 && strongComponents >= 2 ? "MEDIUM" : "LOW",
    verdict,
    campaignId: candidate.campaign?.id,
    campaignLabel: candidate.campaign?.label ?? undefined,
    matchedDomain: candidate.domain,
    crossDomain,
    evidence,
  }
}

function noMatch(): ScamDnaMatch {
  return {
    matched: false,
    actionable: false,
    similarity: 0,
    confidence: "LOW",
    verdict: "unknown",
    crossDomain: false,
    evidence: [],
  }
}

export async function findScamDnaMatch(fingerprint: ScamDnaFingerprintData, domain: string): Promise<ScamDnaMatch> {
  if (!process.env.DATABASE_URL) return noMatch()
  try {
    const or: Prisma.ScamDnaFingerprintWhereInput[] = [
      { contentHash: fingerprint.contentHash },
      { domHash: fingerprint.domHash },
    ]
    if (fingerprint.stats.scriptCount > 0) or.push({ scriptHash: fingerprint.scriptHash })
    if (fingerprint.behaviorFlags.length > 0) or.push({ behaviorHash: fingerprint.behaviorHash })

    const candidates = await db.scamDnaFingerprint.findMany({
      where: { OR: or },
      include: { campaign: true },
      orderBy: { lastSeenAt: "desc" },
      take: 80,
    })

    return candidates
      .map((candidate) => compareScamDna(fingerprint, {
        domain: candidate.domain,
        contentHash: candidate.contentHash,
        domHash: candidate.domHash,
        scriptHash: candidate.scriptHash,
        textHash: candidate.textHash,
        styleHash: candidate.styleHash,
        faviconUrlHash: candidate.faviconUrlHash,
        redirectHash: candidate.redirectHash,
        behaviorHash: candidate.behaviorHash,
        behaviorFlags: stringArray(candidate.behaviorFlags),
        walletTargets: stringArray(candidate.walletTargets),
        programTargets: stringArray(candidate.programTargets),
        riskLevel: candidate.riskLevel,
        campaign: candidate.campaign,
      }, domain))
      .filter((match) => match.matched)
      .sort((left, right) => {
        if (left.actionable !== right.actionable) return left.actionable ? -1 : 1
        return right.similarity - left.similarity
      })[0] ?? noMatch()
  } catch {
    return noMatch()
  }
}

function strongerRisk(left: string, right: string) {
  return (riskRank[left] ?? 0) >= (riskRank[right] ?? 0) ? left : right
}

export async function persistScamDna(input: {
  domain: string
  sourceUrl: string
  finalUrl?: string
  fingerprint: ScamDnaFingerprintData
  sandboxSignals: SandboxStaticSignal[]
  riskLevel: string
  score: number
}) {
  if (!process.env.DATABASE_URL) return false
  try {
    const existingCampaign = await db.scamDnaCampaign.findUnique({
      where: { clusterKey: input.fingerprint.clusterKey },
    })
    const domains = [...new Set([
      ...stringArray(existingCampaign?.domains),
      input.domain,
    ])].sort().slice(0, 250)
    const campaign = await db.scamDnaCampaign.upsert({
      where: { clusterKey: input.fingerprint.clusterKey },
      create: {
        clusterKey: input.fingerprint.clusterKey,
        sampleCount: 1,
        domainCount: domains.length,
        strongestRisk: input.riskLevel,
        domains,
      },
      update: {
        sampleCount: { increment: 1 },
        domainCount: domains.length,
        strongestRisk: strongerRisk(existingCampaign?.strongestRisk ?? "SAFE", input.riskLevel),
        domains,
        lastSeenAt: new Date(),
      },
    })

    await db.scamDnaFingerprint.upsert({
      where: { fingerprintKey: input.fingerprint.fingerprintKey },
      create: {
        fingerprintKey: input.fingerprint.fingerprintKey,
        campaignId: campaign.id,
        domain: input.domain,
        sourceUrl: input.sourceUrl,
        finalUrl: input.finalUrl,
        contentHash: input.fingerprint.contentHash,
        domHash: input.fingerprint.domHash,
        scriptHash: input.fingerprint.scriptHash,
        textHash: input.fingerprint.textHash,
        styleHash: input.fingerprint.styleHash,
        faviconUrlHash: input.fingerprint.faviconUrlHash,
        redirectHash: input.fingerprint.redirectHash,
        behaviorHash: input.fingerprint.behaviorHash,
        behaviorFlags: input.fingerprint.behaviorFlags,
        walletTargets: input.fingerprint.walletTargets,
        programTargets: input.fingerprint.programTargets,
        sandboxSignals: input.sandboxSignals.map((signal) => signal.code),
        riskLevel: input.riskLevel,
        score: input.score,
      },
      update: {
        campaignId: campaign.id,
        sourceUrl: input.sourceUrl,
        finalUrl: input.finalUrl,
        behaviorFlags: input.fingerprint.behaviorFlags,
        walletTargets: input.fingerprint.walletTargets,
        programTargets: input.fingerprint.programTargets,
        sandboxSignals: input.sandboxSignals.map((signal) => signal.code),
        riskLevel: input.riskLevel,
        score: input.score,
        observationCount: { increment: 1 },
        lastSeenAt: new Date(),
      },
    })
    return true
  } catch {
    return false
  }
}

export function scamDnaSignal(match: ScamDnaMatch): SandboxStaticSignal | null {
  if (!match.actionable) return null
  const similarity = Math.round(match.similarity * 100)
  if (match.verdict === "known_bad") {
    return {
      code: "SCAM_DNA_KNOWN_BAD",
      severity: "critical",
      title: "Known scam DNA match",
      detail: `This page shares ${similarity}% of a reviewed known-bad campaign fingerprint${match.matchedDomain ? ` previously seen on ${match.matchedDomain}` : ""}.`,
    }
  }
  return {
    code: "SCAM_DNA_CLONE_MATCH",
    severity: "high",
    title: "High-risk campaign clone detected",
    detail: `Independent DOM, script, behavior, or wallet-target evidence produced a ${similarity}% match${match.matchedDomain ? ` with ${match.matchedDomain}` : ""}.`,
  }
}

export async function listScamDnaAdmin() {
  const [campaigns, fingerprints, campaignCount, fingerprintCount] = await Promise.all([
    db.scamDnaCampaign.findMany({
      orderBy: [{ verdict: "desc" }, { lastSeenAt: "desc" }],
      take: 100,
      include: {
        fingerprints: {
          orderBy: { lastSeenAt: "desc" },
          take: 4,
          select: {
            id: true,
            domain: true,
            riskLevel: true,
            score: true,
            observationCount: true,
            behaviorFlags: true,
            lastSeenAt: true,
          },
        },
      },
    }),
    db.scamDnaFingerprint.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: 40,
      select: {
        id: true,
        domain: true,
        riskLevel: true,
        score: true,
        observationCount: true,
        behaviorFlags: true,
        campaignId: true,
        lastSeenAt: true,
      },
    }),
    db.scamDnaCampaign.count(),
    db.scamDnaFingerprint.count(),
  ])
  return {
    campaigns,
    fingerprints,
    stats: {
      campaigns: campaignCount,
      fingerprints: fingerprintCount,
      reviewed: campaigns.filter((campaign) => campaign.verdict !== "UNKNOWN").length,
      crossDomain: campaigns.filter((campaign) => campaign.domainCount > 1).length,
    },
  }
}

export async function updateScamDnaCampaign(input: {
  id: string
  verdict: ScamDnaVerdict
  label?: string | null
  notes?: string | null
}) {
  return db.scamDnaCampaign.update({
    where: { id: input.id },
    data: {
      verdict: input.verdict,
      label: input.label?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  })
}
