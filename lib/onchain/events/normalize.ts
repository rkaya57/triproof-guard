import { createHash } from "node:crypto"

import type {
  FundingObservation,
  NormalizedOnchainEvent,
  OnchainChainFamily,
  OnchainEventDirection,
  RawOnchainObservation,
} from "@/lib/onchain/events/types"
import { NORMALIZED_ONCHAIN_EVENT_SCHEMA_VERSION } from "@/lib/onchain/events/types"

const EVM_CHAIN_ALIASES: Record<string, string> = {
  eth: "ethereum",
  ethereum: "ethereum",
  base: "base",
  arb: "arbitrum",
  arbitrum: "arbitrum",
  op: "optimism",
  optimism: "optimism",
  polygon: "polygon",
  matic: "polygon",
  bsc: "bnb-chain",
  bnb: "bnb-chain",
  "bnb chain": "bnb-chain",
  "bnb-chain": "bnb-chain",
  evm: "evm",
}

function normalizeChainLabel(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")
}

export function normalizeOnchainChain(chain: string): {
  chain: string
  chainFamily: OnchainChainFamily
} {
  const normalized = normalizeChainLabel(chain)
  if (normalized === "sol" || normalized === "solana") {
    return { chain: "solana", chainFamily: "solana" }
  }

  const evm = EVM_CHAIN_ALIASES[normalized]
  if (evm) return { chain: evm, chainFamily: "evm" }

  // Provider-specific EVM chains can still enter through the generic EVM label.
  // Unknown chains are intentionally rejected instead of silently assigning a family.
  throw new Error(`Unsupported on-chain event network: ${chain}`)
}

export function normalizeOnchainAddress(
  address: string | null | undefined,
  chainFamily: OnchainChainFamily,
) {
  const value = address?.trim()
  if (!value) return null
  return chainFamily === "evm" ? value.toLowerCase() : value
}

function normalizeAmount(amount: string | number | null | undefined) {
  if (amount === null || amount === undefined || amount === "") return null
  if (typeof amount === "number") {
    if (!Number.isFinite(amount) || amount < 0) return null
    return String(amount)
  }

  const value = amount.trim()
  if (!value || !/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return null
  return value
}

function normalizeTimestamp(value: string | Date | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function clampConfidence(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 50
  return Math.min(100, Math.max(0, Math.round(value as number)))
}

function inferDirection(
  walletAddress: string,
  fromAddress: string | null,
  toAddress: string | null,
): OnchainEventDirection {
  const fromWallet = fromAddress === walletAddress
  const toWallet = toAddress === walletAddress
  if (fromWallet && toWallet) return "self"
  if (fromWallet) return "outbound"
  if (toWallet) return "inbound"
  return "unknown"
}

function inferredCounterparty(
  direction: OnchainEventDirection,
  walletAddress: string,
  fromAddress: string | null,
  toAddress: string | null,
) {
  if (direction === "inbound") return fromAddress === walletAddress ? null : fromAddress
  if (direction === "outbound") return toAddress === walletAddress ? null : toAddress
  return null
}

function buildEventKey(input: {
  chain: string
  txHash: string
  eventIndex: number
  walletAddress: string
  kind: string
}) {
  return createHash("sha256")
    .update(
      [input.chain, input.txHash.toLowerCase(), input.eventIndex, input.walletAddress, input.kind].join(":"),
    )
    .digest("hex")
}

export function normalizeOnchainEvent(
  observation: RawOnchainObservation,
): NormalizedOnchainEvent {
  const network = normalizeOnchainChain(observation.chain)
  const walletAddress = normalizeOnchainAddress(observation.walletAddress, network.chainFamily)
  if (!walletAddress) throw new Error("walletAddress is required")

  const fromAddress = normalizeOnchainAddress(observation.fromAddress, network.chainFamily)
  const toAddress = normalizeOnchainAddress(observation.toAddress, network.chainFamily)
  const eventIndex = Math.max(0, Math.trunc(observation.eventIndex ?? 0))
  const direction = observation.direction ?? inferDirection(walletAddress, fromAddress, toAddress)
  const explicitCounterparty = normalizeOnchainAddress(
    observation.counterpartyAddress,
    network.chainFamily,
  )
  const counterpartyAddress =
    explicitCounterparty ?? inferredCounterparty(direction, walletAddress, fromAddress, toAddress)
  const kind = observation.kind ?? "unknown"

  return {
    schemaVersion: NORMALIZED_ONCHAIN_EVENT_SCHEMA_VERSION,
    eventKey: buildEventKey({
      chain: network.chain,
      txHash: observation.txHash.trim(),
      eventIndex,
      walletAddress,
      kind,
    }),
    chain: network.chain,
    chainFamily: network.chainFamily,
    txHash: observation.txHash.trim(),
    eventIndex,
    walletAddress,
    fromAddress,
    toAddress,
    counterpartyAddress,
    kind,
    direction,
    assetSymbol: observation.assetSymbol?.trim() || null,
    assetAddress: normalizeOnchainAddress(observation.assetAddress, network.chainFamily),
    amount: normalizeAmount(observation.amount),
    observedAt: normalizeTimestamp(observation.observedAt),
    blockRef:
      observation.blockRef === null || observation.blockRef === undefined
        ? null
        : String(observation.blockRef),
    provider: observation.provider.trim(),
    confidence: clampConfidence(observation.confidence),
    metadata: observation.metadata ?? {},
  }
}

export function isFundingTransfer(event: NormalizedOnchainEvent) {
  return (
    event.direction === "inbound" &&
    event.counterpartyAddress !== null &&
    (event.kind === "native_transfer" || event.kind === "token_transfer")
  )
}

export function extractFundingObservations(
  events: readonly NormalizedOnchainEvent[],
): FundingObservation[] {
  return events
    .filter(isFundingTransfer)
    .map((event) => ({
      walletAddress: event.walletAddress,
      funderAddress: event.counterpartyAddress as string,
      chain: event.chain,
      chainFamily: event.chainFamily,
      txHash: event.txHash,
      eventKey: event.eventKey,
      amount: event.amount,
      assetSymbol: event.assetSymbol,
      assetAddress: event.assetAddress,
      observedAt: event.observedAt,
      provider: event.provider,
      confidence: event.confidence,
    }))
    .sort((left, right) => {
      if (left.observedAt === right.observedAt) return left.eventKey.localeCompare(right.eventKey)
      if (left.observedAt === null) return 1
      if (right.observedAt === null) return -1
      return left.observedAt.localeCompare(right.observedAt)
    })
}
