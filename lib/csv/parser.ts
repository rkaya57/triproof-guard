import Papa from "papaparse"

import type { CsvIssue, CsvParseResult, ParsedWallet } from "@/types"
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
