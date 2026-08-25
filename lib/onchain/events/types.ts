export const NORMALIZED_ONCHAIN_EVENT_SCHEMA_VERSION = "tri-proof-onchain-event-v1" as const

export type OnchainChainFamily = "solana" | "evm"

export type OnchainEventKind =
  | "native_transfer"
  | "token_transfer"
  | "contract_interaction"
  | "bridge_transfer"
  | "account_creation"
  | "unknown"

export type OnchainEventDirection = "inbound" | "outbound" | "self" | "unknown"

export type NormalizedOnchainEvent = {
  schemaVersion: typeof NORMALIZED_ONCHAIN_EVENT_SCHEMA_VERSION
  eventKey: string
  chain: string
  chainFamily: OnchainChainFamily
  txHash: string
  eventIndex: number
  walletAddress: string
  fromAddress: string | null
  toAddress: string | null
  counterpartyAddress: string | null
  kind: OnchainEventKind
  direction: OnchainEventDirection
  assetSymbol: string | null
  assetAddress: string | null
  amount: string | null
  observedAt: string | null
  blockRef: string | null
  provider: string
  confidence: number
  metadata: Record<string, unknown>
}

export type RawOnchainObservation = {
  chain: string
  txHash: string
  eventIndex?: number | null
  walletAddress: string
  fromAddress?: string | null
  toAddress?: string | null
  counterpartyAddress?: string | null
  kind?: OnchainEventKind | null
  direction?: OnchainEventDirection | null
  assetSymbol?: string | null
  assetAddress?: string | null
  amount?: string | number | null
  observedAt?: string | Date | null
  blockRef?: string | number | null
  provider: string
  confidence?: number | null
  metadata?: Record<string, unknown> | null
}

export type FundingObservation = {
  walletAddress: string
  funderAddress: string
  chain: string
  chainFamily: OnchainChainFamily
  txHash: string
  eventKey: string
  amount: string | null
  assetSymbol: string | null
  assetAddress: string | null
  observedAt: string | null
  provider: string
  confidence: number
}
