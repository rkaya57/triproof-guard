import Papa from "papaparse"

import type { CsvIssue, CsvParseResult, EntityType, ParsedWallet, PolicyAction } from "@/types"
import {
  isValidWalletAddress,
  normalizeHeader,
  normalizeWalletAddress,
} from "@/lib/validators/wallet"

type RawCsvRow = Record<string, string | undefined>

const walletKeys = ["wallet_address", "wallet", "address"]

function getWalletAddress(row: RawCsvRow) {
  for (const key of walletKeys) {
    const value = row[key]?.trim()
    if (value) {
      return value
    }
  }

  return ""
}

function firstText(row: RawCsvRow, keys: string[]) {
  for (const key of keys) {
    const value = textOrNull(row[key])
    if (value) return value
  }
  return null
}

function toNumber(value: string | undefined) {
  if (value == null || value.trim() === "") {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function textOrNull(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizePolicyAction(value: string | null): PolicyAction {
  if (!value) return null
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_")

  if (
    [
      "approve",
      "approved",
      "allow",
      "allowlist",
      "whitelist",
      "trusted",
      "trusted_user",
      "verified",
      "verified_user",
      "confirmed_human",
      "false_positive",
      "safe",
    ].includes(normalized)
  ) {
    return "approve"
  }

  if (
    [
      "reject",
      "rejected",
      "deny",
      "denylist",
      "block",
      "blocked",
      "blocklist",
      "blacklist",
      "known_sybil",
      "confirmed_sybil",
      "bot",
      "farmer",
      "farm",
      "not_eligible",
      "exclude",
      "excluded",
    ].includes(normalized)
  ) {
    return "reject"
  }

  if (
    [
      "manual",
      "manual_review",
      "review",
      "needs_review",
      "suspicious",
      "watchlist",
      "gray",
      "grey",
      "uncertain",
    ].includes(normalized)
  ) {
    return "manual_review"
  }

  return null
}

function normalizeEntityType(value: string | null): EntityType | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_")
  if (["exchange", "service", "bridge", "contract", "protocol", "unknown", "user"].includes(normalized)) {
    return normalized as EntityType
  }
  return null
}

export function parseWalletCsv(csvText: string, selectedChain: string): CsvParseResult {
  const parsed = Papa.parse<RawCsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  })

  const headers = parsed.meta.fields ?? []
  const issues: CsvIssue[] = []
  const duplicates: CsvIssue[] = []
  const wallets: ParsedWallet[] = []
  const seen = new Set<string>()

  if (!headers.some((header) => walletKeys.includes(header))) {
    return {
      wallets,
      issues: [{ row: 1, issue: "Missing required wallet_address column" }],
      duplicates,
      mode: "basic",
      headers,
    }
  }

  parsed.data.forEach((row, index) => {
    const rowNumber = index + 2
    const rawAddress = getWalletAddress(row)
    const rowChain = textOrNull(row.chain) ?? selectedChain

    if (!rawAddress) {
      issues.push({ row: rowNumber, issue: "Missing wallet address" })
      return
    }

    if (!isValidWalletAddress(rawAddress, rowChain)) {
      issues.push({
        row: rowNumber,
        walletAddress: rawAddress,
        issue: `Invalid ${rowChain} wallet format`,
      })
      return
    }

    const normalizedAddress = normalizeWalletAddress(rawAddress, rowChain)
    const duplicateKey = `${rowChain}:${normalizedAddress}`

    if (seen.has(duplicateKey)) {
      duplicates.push({
        row: rowNumber,
        walletAddress: normalizedAddress,
        issue: "Duplicate wallet address skipped",
      })
      return
    }

    seen.add(duplicateKey)

    const reputationLabel = firstText(row, [
      "reputation_label",
      "reputation",
      "review_label",
      "customer_label",
      "label",
    ])
    const explicitPolicy = firstText(row, ["policy_action", "policy", "decision", "action", "status_override"])
    const policyAction = normalizePolicyAction(explicitPolicy ?? reputationLabel)
    const entityLabel = firstText(row, ["entity_label", "known_entity", "entity", "wallet_label"])
    const entityType = normalizeEntityType(firstText(row, ["entity_type", "known_entity_type"]))
    const policyReason = firstText(row, ["policy_reason", "reason", "note", "notes", "review_note"])

    wallets.push({
      walletAddress: normalizedAddress,
      chain: rowChain,
      txCount: toNumber(row.tx_count),
      walletAgeDays: toNumber(row.wallet_age_days),
      fundingSource: textOrNull(row.funding_source),
      firstSeen: textOrNull(row.first_seen),
      lastSeen: textOrNull(row.last_seen),
      totalVolume: toNumber(row.total_volume),
      contractsCount: toNumber(row.contracts_count),
      campaignActionsCount: toNumber(row.campaign_actions_count),
      knownEntityLabel: entityLabel,
      knownEntityType: entityType,
      policyAction,
      reputationLabel,
      policyReason,
      customerLabel: firstText(row, ["customer_label", "review_label", "label"]),
      sourceRow: rowNumber,
    })
  })

  const enrichedFields = [
    "chain",
    "tx_count",
    "wallet_age_days",
    "funding_source",
    "first_seen",
    "last_seen",
    "total_volume",
    "contracts_count",
    "campaign_actions_count",
    "policy_action",
    "policy",
    "decision",
    "reputation_label",
    "reputation",
    "review_label",
    "customer_label",
    "entity_label",
    "entity_type",
  ]

  return {
    wallets,
    issues,
    duplicates,
    mode: headers.some((header) => enrichedFields.includes(header))
      ? "enriched"
      : "basic",
    headers,
  }
}
