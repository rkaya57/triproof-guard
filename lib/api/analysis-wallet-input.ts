import {
  isValidWalletAddress,
  normalizeWalletAddress,
} from "@/lib/validators/wallet"
import type { Chain, ParsedWallet } from "@/types"

type ApiWalletRow = Record<string, unknown>

function stringValue(row: ApiWalletRow | null, keys: string[]) {
  if (!row) return ""
  for (const key of keys) {
    const value = row[key]
    if (value !== null && value !== undefined) {
      const normalized = String(value).trim()
      if (normalized) return normalized
    }
  }
  return ""
}

function numberValue(row: ApiWalletRow | null, keys: string[]) {
  const value = stringValue(row, keys)
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isoValue(row: ApiWalletRow | null, keys: string[]) {
  const value = stringValue(row, keys)
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function participantFingerprint(row: ApiWalletRow | null) {
  const value = stringValue(row, [
    "participantFingerprint",
    "participant_fingerprint",
    "deviceHash",
    "device_hash",
    "sessionHash",
    "session_hash",
    "identityHash",
    "identity_hash",
  ]).toLowerCase()
  if (!value) return null
  return /^[a-f0-9]{32,128}$/.test(value) ? value : null
}

export function parseApiWalletRows(
  input: unknown,
  chain: Chain
): { wallets: ParsedWallet[]; issues: string[] } {
  const values = Array.isArray(input) ? input : []
  const seen = new Set<string>()
  const wallets: ParsedWallet[] = []
  const issues: string[] = []

  values.forEach((item, index) => {
    const row = typeof item === "object" && item !== null
      ? (item as ApiWalletRow)
      : null
    const rawAddress = typeof item === "string"
      ? item
      : stringValue(row, ["wallet", "walletAddress", "wallet_address", "address"])

    if (!rawAddress.trim()) {
      issues.push(`wallets[${index}] is missing an address`)
      return
    }

    if (!isValidWalletAddress(rawAddress, chain)) {
      issues.push(`wallets[${index}] is not a valid ${chain} address`)
      return
    }

    const normalized = normalizeWalletAddress(rawAddress, chain)
    const key = `${chain}:${normalized}`
    if (seen.has(key)) return
    seen.add(key)

    const rawReferrer = stringValue(row, [
      "referrerAddress",
      "referrer_address",
      "referrerWallet",
      "referrer_wallet",
      "referredBy",
      "referred_by",
      "inviterWallet",
      "inviter_wallet",
    ])
    const referrerAddress =
      rawReferrer && isValidWalletAddress(rawReferrer, chain)
        ? normalizeWalletAddress(rawReferrer, chain)
        : null
    if (rawReferrer && !referrerAddress) {
      issues.push(
        `wallets[${index}] has an invalid ${chain} referrer address; referral link ignored`
      )
    }

    const rawCampaignEventAt = stringValue(row, [
      "campaignEventAt",
      "campaign_event_at",
      "taskCompletedAt",
      "task_completed_at",
      "eventTimestamp",
      "event_timestamp",
      "activityTimestamp",
      "activity_timestamp",
    ])
    const campaignEventAt = isoValue(row, [
      "campaignEventAt",
      "campaign_event_at",
      "taskCompletedAt",
      "task_completed_at",
      "eventTimestamp",
      "event_timestamp",
      "activityTimestamp",
      "activity_timestamp",
    ])
    if (rawCampaignEventAt && !campaignEventAt) {
      issues.push(`wallets[${index}] has an invalid campaign event timestamp; value ignored`)
    }

    const rawFingerprint = stringValue(row, [
      "participantFingerprint",
      "participant_fingerprint",
      "deviceHash",
      "device_hash",
      "sessionHash",
      "session_hash",
      "identityHash",
      "identity_hash",
    ])
    const fingerprint = participantFingerprint(row)
    if (rawFingerprint && !fingerprint) {
      issues.push(
        `wallets[${index}] has an invalid participant fingerprint; only a 32-128 character hexadecimal one-way hash is accepted`
      )
    }

    const importedPolicyLabel = stringValue(row, [
      "policyAction",
      "policy_action",
      "reputationLabel",
      "reputation_label",
      "customerLabel",
      "customer_label",
      "reviewLabel",
      "review_label",
    ])

    wallets.push({
      walletAddress: normalized,
      chain,
      txCount: null,
      walletAgeDays: null,
      fundingSource: null,
      firstSeen: null,
      lastSeen: null,
      totalVolume: null,
      contractsCount: null,
      campaignActionsCount: null,
      policyAction: null,
      reputationLabel: importedPolicyLabel || null,
      policyReason:
        stringValue(row, ["policyReason", "policy_reason", "reviewNote", "review_note"]) ||
        null,
      customerLabel: importedPolicyLabel || null,
      referrerAddress,
      referralCode:
        stringValue(row, ["referralCode", "referral_code", "inviteCode", "invite_code"]) ||
        null,
      referralTimestamp:
        isoValue(row, [
          "referralTimestamp",
          "referral_timestamp",
          "referredAt",
          "referred_at",
          "invitedAt",
          "invited_at",
        ]) ?? null,
      campaignEventAt,
      campaignEventType:
        stringValue(row, [
          "campaignEventType",
          "campaign_event_type",
          "taskType",
          "task_type",
          "eventType",
          "event_type",
          "activityType",
          "activity_type",
        ]) || null,
      campaignPoints: numberValue(row, [
        "campaignPoints",
        "campaign_points",
        "points",
        "rewardPoints",
        "reward_points",
      ]),
      participantFingerprint: fingerprint,
      sourceRow: index + 1,
    })
  })

  return { wallets, issues }
}
