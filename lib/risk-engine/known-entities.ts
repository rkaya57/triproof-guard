import type { EntityType, WalletStatus } from "@/types"

type KnownEntity = {
  label: string
  type: EntityType
  action: Extract<WalletStatus, "manual_review">
  reason: string
}

const knownEntityReason = "Known public exchange/service/protocol address. Not a typical individual reward campaign participant."
const solanaProgramReason = "Known Solana program, sysvar, token mint, or protocol account. Exclude or manually review before reward inclusion because it is not an end-user wallet."

export const KNOWN_ENTITIES: Record<string, KnownEntity> = {
  "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8": {
    label: "Binance 7",
    type: "exchange",
    action: "manual_review",
    reason: knownEntityReason,
  },
  "0x28c6c06298d514db089934071355e5743bf21d60": {
    label: "Binance 14",
    type: "exchange",
    action: "manual_review",
    reason: knownEntityReason,
  },
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549": {
    label: "Binance 15",
    type: "exchange",
    action: "manual_review",
    reason: knownEntityReason,
  },
  "0x71660c4005ba85c37ccec55d0c4493e66fe775d3": {
    label: "Coinbase 1",
    type: "exchange",
    action: "manual_review",
    reason: knownEntityReason,
  },
  "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0": {
    label: "Kraken 4",
    type: "exchange",
    action: "manual_review",
    reason: knownEntityReason,
  },
  "11111111111111111111111111111111": {
    label: "Solana System Program",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
  "vote111111111111111111111111111111111111111": {
    label: "Solana Vote Program",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
  "stake11111111111111111111111111111111111111": {
    label: "Solana Stake Program",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
  "computebudget111111111111111111111111111111": {
    label: "Solana Compute Budget Program",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
  "tokenkegqfezyinwajbnbgkpfxcwubvf9ss623vq5da": {
    label: "SPL Token Program",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
  "atokengpvbdgvxr1b2hvzbsiqw5xwh25eftnslja8knl": {
    label: "Associated Token Account Program",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
  "tokensqdbnblqp5vehdkas6epf1smh1dbkqp6xk6mn": {
    label: "Token-2022 Program",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
  "memosq4gqabaxkb96qnh8tysncwxmywcqxgdlgfmchr": {
    label: "Memo Program",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
  "sysvarc1ock11111111111111111111111111111111": {
    label: "Solana Clock Sysvar",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
  "sysvarrent111111111111111111111111111111111": {
    label: "Solana Rent Sysvar",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
  "so11111111111111111111111111111111111111112": {
    label: "Wrapped SOL Mint",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
  "epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwydt1v": {
    label: "USDC Mint on Solana",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
  "jupyiwryjfskupiha7hker8vutaefosybkedznssdvcn": {
    label: "Jupiter Token Mint",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
  "jup6lkbzbjs1jkkwapdhny74zcz3tluzoih5qnyvtav4": {
    label: "Jupiter Aggregator Program",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
  "whirlbmiicvdio4qvufm5kag6ctzamyzpccvykf4ni": {
    label: "Orca Whirlpool Program",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
  "cammczo5yl8w4vff8kvhrk22ggusp5vtaw7grrkgrwqk": {
    label: "Raydium CLMM Program",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
  "675kpx9mhtjs2zt1qfr1nybuu1j1h1m9wwmojsst": {
    label: "Raydium AMM Program",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
  "metaqbxxuerdq28cj1rbawkyqm3ybzjb6a8bt518x1s": {
    label: "Metaplex Token Metadata Program",
    type: "protocol",
    action: "manual_review",
    reason: solanaProgramReason,
  },
}

const reviewOnlyEntityTypes = new Set<EntityType>([
  "exchange",
  "service",
  "protocol",
  "bridge",
  "contract",
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
