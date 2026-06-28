import type { EntityType, WalletStatus } from "@/types"

type KnownEntity = {
  label: string
  type: EntityType
  action: Extract<WalletStatus, "manual_review">
  reason: string
}

export const KNOWN_ENTITIES: Record<string, KnownEntity> = {
  "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8": {
    label: "Binance 7",
    type: "exchange",
    action: "manual_review",
    reason: "Known public exchange wallet. Not a typical campaign participant.",
  },
  "0x28c6c06298d514db089934071355e5743bf21d60": {
    label: "Binance 14",
    type: "exchange",
    action: "manual_review",
    reason: "Known public exchange wallet. Not a typical campaign participant.",
  },
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549": {
    label: "Binance 15",
    type: "exchange",
    action: "manual_review",
    reason: "Known public exchange wallet. Not a typical campaign participant.",
  },
  "0x71660c4005ba85c37ccec55d0c4493e66fe775d3": {
    label: "Coinbase 1",
    type: "exchange",
    action: "manual_review",
    reason: "Known public exchange wallet. Not a typical campaign participant.",
  },
  "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0": {
    label: "Kraken 4",
    type: "exchange",
    action: "manual_review",
    reason: "Known public exchange wallet. Not a typical campaign participant.",
  },
}

const reviewOnlyEntityTypes = new Set<EntityType>([
  "exchange",
  "service",
  "protocol",
  "bridge",
])

export function normalizeEntityAddress(walletAddress: string) {
  return walletAddress.trim().toLowerCase()
}

export function detectKnownEntity(walletAddress: string) {
  return KNOWN_ENTITIES[normalizeEntityAddress(walletAddress)] ?? null
}

export function isReviewOnlyEntityType(entityType: EntityType) {
  return reviewOnlyEntityTypes.has(entityType)
}
