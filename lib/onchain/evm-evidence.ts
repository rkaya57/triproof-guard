export type EvmActivityObservation = {
  hash?: string | null
  timestamp?: string | null
  from?: string | null
  to?: string | null
  nativeValue?: number | null
  tokenContract?: string | null
  input?: string | null
  category?: string | null
}

export type EvmEvidenceSummary = {
  txCount: number
  firstSeen: string | null
  lastSeen: string | null
  walletAgeDays: number | null
  totalVolume: number
  tokenCount: number
  contractsCount: number | null
  campaignActionsCount: number | null
  campaignOnlyRatio: number | null
  uniqueCounterparties: number
  fundingSource: string | null
  firstFundingTxHash: string | null
  firstFundingAt: string | null
  firstFundingAmount: number | null
  behaviorFingerprint: string[] | null
  historyTruncated: boolean
}

function normalize(address: string | null | undefined) {
  return address?.trim().toLowerCase() ?? ""
}

function parsedTimestamp(value: string | null | undefined) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function selector(input: string | null | undefined) {
  const value = input?.toLowerCase() ?? ""
  return /^0x[0-9a-f]{8,}$/.test(value) ? value.slice(0, 10) : null
}

function rankedFeatures(values: string[]) {
  const counts = new Map<string, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([value]) => value)
}

export function summarizeEvmActivity({
  address,
  activities,
  campaignContracts = [],
  historyTruncated = false,
  now = Date.now(),
}: {
  address: string
  activities: EvmActivityObservation[]
  campaignContracts?: string[]
  historyTruncated?: boolean
  now?: number
}): EvmEvidenceSummary {
  const wallet = normalize(address)
  const campaignSet = new Set(campaignContracts.map(normalize).filter(Boolean))
  const ordered = activities
    .map((activity, index) => ({
      activity,
      index,
      timestamp: parsedTimestamp(activity.timestamp),
    }))
    .sort((left, right) => {
      if (left.timestamp === null && right.timestamp === null) return left.index - right.index
      if (left.timestamp === null) return 1
      if (right.timestamp === null) return -1
      return left.timestamp - right.timestamp || left.index - right.index
    })

  const hashes = new Set(
    activities
      .map((activity) => activity.hash?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value))
  )
  const txCount = hashes.size || activities.length

  const timestamps = ordered
    .map((item) => item.timestamp)
    .filter((value): value is number => value !== null)
  const firstSeen = timestamps.length ? new Date(timestamps[0]).toISOString() : null
  const lastSeen = timestamps.length
    ? new Date(timestamps[timestamps.length - 1]).toISOString()
    : null
  const walletAgeDays =
    timestamps.length && !historyTruncated
      ? Math.max(0, Math.floor((now - timestamps[0]) / 86_400_000))
      : null

  const firstIncomingNative = ordered.find(({ activity }) => {
    const from = normalize(activity.from)
    const to = normalize(activity.to)
    return (
      to === wallet &&
      Boolean(from) &&
      from !== wallet &&
      (activity.nativeValue ?? 0) > 0
    )
  })
  const fundingProvenanceReliable = !historyTruncated && Boolean(firstIncomingNative)

  const counterparties = new Set<string>()
  activities.forEach((activity) => {
    const from = normalize(activity.from)
    const to = normalize(activity.to)
    if (from && from !== wallet) counterparties.add(from)
    if (to && to !== wallet) counterparties.add(to)
  })

  const tokenContracts = new Set(
    activities.map((activity) => normalize(activity.tokenContract)).filter(Boolean)
  )
  const contractTargets = new Set(
    activities
      .filter((activity) => normalize(activity.from) === wallet && selector(activity.input))
      .map((activity) => normalize(activity.to))
      .filter(Boolean)
  )

  const campaignHashes = new Set<string>()
  let campaignRows = 0
  activities.forEach((activity) => {
    if (
      normalize(activity.from) !== wallet ||
      !campaignSet.has(normalize(activity.to))
    ) {
      return
    }
    const hash = activity.hash?.trim().toLowerCase()
    if (hash) campaignHashes.add(hash)
    else campaignRows += 1
  })
  const campaignActionsCount = campaignSet.size
    ? campaignHashes.size + campaignRows
    : null
  const campaignOnlyRatio =
    campaignActionsCount !== null && txCount > 0
      ? Math.min(1, campaignActionsCount / txCount)
      : null

  const methodFeatures = activities
    .filter((activity) => normalize(activity.from) === wallet)
    .map((activity) => selector(activity.input))
    .filter((value): value is string => Boolean(value))
  const transferFeatures = activities
    .filter((activity) => normalize(activity.from) === wallet)
    .map((activity) => {
      const token = normalize(activity.tokenContract)
      if (token) return `token:${token}`
      const category = activity.category?.trim().toLowerCase()
      return category ? `category:${category}` : null
    })
    .filter((value): value is string => Boolean(value))
  const features = rankedFeatures(methodFeatures.length ? methodFeatures : transferFeatures)

  return {
    txCount,
    firstSeen,
    lastSeen,
    walletAgeDays,
    totalVolume: Number(
      activities
        .reduce((sum, activity) => sum + Math.max(0, activity.nativeValue ?? 0), 0)
        .toFixed(6)
    ),
    tokenCount: tokenContracts.size,
    contractsCount: methodFeatures.length ? contractTargets.size : null,
    campaignActionsCount,
    campaignOnlyRatio,
    uniqueCounterparties: counterparties.size,
    fundingSource:
      fundingProvenanceReliable && firstIncomingNative
        ? normalize(firstIncomingNative.activity.from)
        : null,
    firstFundingTxHash:
      fundingProvenanceReliable && firstIncomingNative?.activity.hash
        ? firstIncomingNative.activity.hash.trim().toLowerCase()
        : null,
    firstFundingAt:
      fundingProvenanceReliable &&
      firstIncomingNative?.timestamp !== null &&
      firstIncomingNative?.timestamp !== undefined
        ? new Date(firstIncomingNative.timestamp).toISOString()
        : null,
    firstFundingAmount:
      fundingProvenanceReliable ? firstIncomingNative?.activity.nativeValue ?? null : null,
    behaviorFingerprint: features.length ? features : null,
    historyTruncated,
  }
}
