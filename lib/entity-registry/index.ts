import type { EntityType, WalletStatus } from "@/types"

export const ENTITY_REGISTRY_SCHEMA_VERSION = "entity-registry-v1" as const
export const ENTITY_REGISTRY_DATASET_VERSION = "2026-08-07.2" as const
const ENTITY_REGISTRY_LEGACY_DATASET_VERSION = "2026-08-07.1" as const

type EntityRegistryDatasetVersion =
  | typeof ENTITY_REGISTRY_LEGACY_DATASET_VERSION
  | typeof ENTITY_REGISTRY_DATASET_VERSION

export type EntityRegistryNetwork = "evm" | "solana"
export type EntityRegistryStatus = "active" | "deprecated"
export type EntityRegistrySourceKind =
  | "legacy_curated"
  | "protocol_documentation"
  | "public_reference"
  | "provider_verified"

export type EntityRegistryRole =
  | "exchange_hot_wallet"
  | "service_wallet"
  | "bridge_contract"
  | "protocol_contract"
  | "protocol_program"
  | "system_program"
  | "token_mint"
  | "smart_account_factory"
  | "router"
  | "relayer"
  | "paymaster"
  | "proxy_implementation"

export type EntityRegistryRecord = {
  id: string
  address: string
  network: EntityRegistryNetwork
  /** Optional canonical chain name. Null means network-wide context. */
  chain: string | null
  label: string
  type: EntityType
  roles: EntityRegistryRole[]
  action: Extract<WalletStatus, "manual_review">
  reason: string
  status: EntityRegistryStatus
  /** Registry classification is context/eligibility only and never standalone malicious-risk evidence. */
  riskEffect: "neutral_context"
  /** Shared use of this infrastructure cannot become Sybil evidence by itself. */
  sharedInfrastructureEffect: "neutral_context"
  introducedIn: EntityRegistryDatasetVersion
  provenance: {
    kind: EntityRegistrySourceKind
    reference: string
  }
}

export type KnownEntity = EntityRegistryRecord & {
  registrySchemaVersion: typeof ENTITY_REGISTRY_SCHEMA_VERSION
  registryDatasetVersion: typeof ENTITY_REGISTRY_DATASET_VERSION
}

const knownEntityReason =
  "Known public exchange/service/bridge/protocol address. Not a typical individual reward campaign participant."
const solanaProgramReason =
  "Known Solana program, sysvar, token mint, or protocol account. Exclude or manually review before reward inclusion because it is not an end-user wallet."
const bridgeReason =
  "Known canonical bridge or cross-domain messaging contract. It is infrastructure, not an individual campaign participant, and shared funding through it must not be treated as Sybil evidence by itself."
const factoryReason =
  "Known canonical smart-account factory infrastructure. Factory reuse is normal protocol behavior and must not be treated as Sybil evidence by itself."

const legacyReference = "migrated from lib/risk-engine/known-entities.ts"

function record(input: {
  id: string
  address: string
  network: EntityRegistryNetwork
  chain?: string | null
  label: string
  type: EntityType
  roles: EntityRegistryRole[]
  reason: string
  introducedIn?: EntityRegistryDatasetVersion
  provenance?: {
    kind: EntityRegistrySourceKind
    reference: string
  }
}): EntityRegistryRecord {
  return {
    id: input.id,
    address: input.address,
    network: input.network,
    chain: input.chain ?? null,
    label: input.label,
    type: input.type,
    roles: input.roles,
    action: "manual_review",
    reason: input.reason,
    status: "active",
    riskEffect: "neutral_context",
    sharedInfrastructureEffect: "neutral_context",
    introducedIn: input.introducedIn ?? ENTITY_REGISTRY_LEGACY_DATASET_VERSION,
    provenance: input.provenance ?? {
      kind: "legacy_curated",
      reference: legacyReference,
    },
  }
}

/**
 * Registry v1 starts from the pre-existing curated list. New records require
 * explicit provenance and a dataset version bump; historical introducedIn
 * versions are preserved when the dataset advances.
 */
export const ENTITY_REGISTRY: readonly EntityRegistryRecord[] = [
  record({
    id: "binance-7",
    address: "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8",
    network: "evm",
    label: "Binance 7",
    type: "exchange",
    roles: ["exchange_hot_wallet"],
    reason: knownEntityReason,
  }),
  record({
    id: "binance-14",
    address: "0x28c6c06298d514db089934071355e5743bf21d60",
    network: "evm",
    label: "Binance 14",
    type: "exchange",
    roles: ["exchange_hot_wallet"],
    reason: knownEntityReason,
  }),
  record({
    id: "binance-15",
    address: "0x21a31ee1afc51d94c2efccaa2092ad1028285549",
    network: "evm",
    label: "Binance 15",
    type: "exchange",
    roles: ["exchange_hot_wallet"],
    reason: knownEntityReason,
  }),
  record({
    id: "coinbase-1",
    address: "0x71660c4005ba85c37ccec55d0c4493e66fe775d3",
    network: "evm",
    label: "Coinbase 1",
    type: "exchange",
    roles: ["exchange_hot_wallet"],
    reason: knownEntityReason,
  }),
  record({
    id: "kraken-4",
    address: "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0",
    network: "evm",
    label: "Kraken 4",
    type: "exchange",
    roles: ["exchange_hot_wallet"],
    reason: knownEntityReason,
  }),
  record({
    id: "kucoin-1",
    address: "0x2b5634c42055806a59e9107ed44d43c426e58258",
    network: "evm",
    label: "KuCoin 1",
    type: "exchange",
    roles: ["exchange_hot_wallet"],
    reason: knownEntityReason,
    introducedIn: ENTITY_REGISTRY_DATASET_VERSION,
    provenance: {
      kind: "provider_verified",
      reference: "https://etherscan.io/address/0x2b5634c42055806a59e9107ed44d43c426e58258",
    },
  }),
  record({
    id: "safe-proxy-factory-eip155",
    address: "0xc22834581ebc8527d974f8a1c97e1bea4ef910bc",
    network: "evm",
    label: "Safe Proxy Factory (EIP-155 deployment)",
    type: "protocol",
    roles: ["smart_account_factory"],
    reason: factoryReason,
  }),
  record({
    id: "safe-proxy-factory-canonical",
    address: "0xa6b71e26c5e0845f74c812102ca7114b6a896ab2",
    network: "evm",
    label: "Safe Proxy Factory (canonical deployment)",
    type: "protocol",
    roles: ["smart_account_factory"],
    reason: factoryReason,
  }),
  record({
    id: "op-mainnet-optimism-portal",
    address: "0xbeb5fc579115071764c7423a4f12edde41f106ed",
    network: "evm",
    label: "OP Mainnet OptimismPortal",
    type: "bridge",
    roles: ["bridge_contract"],
    reason: bridgeReason,
  }),
  record({
    id: "op-mainnet-l1-standard-bridge",
    address: "0x99c9fc46f92e8a1c0dec1b1747d010903e884be1",
    network: "evm",
    label: "OP Mainnet L1StandardBridge",
    type: "bridge",
    roles: ["bridge_contract"],
    reason: bridgeReason,
  }),
  record({
    id: "base-optimism-portal",
    address: "0x49048044d57e1c92a77f79988d21fa8faf74e97e",
    network: "evm",
    label: "Base OptimismPortal",
    type: "bridge",
    roles: ["bridge_contract"],
    reason: bridgeReason,
  }),
  record({
    id: "polygon-pos-root-chain-manager",
    address: "0xa0c68c638235ee32657e8f720a23cec1bfc77c77",
    network: "evm",
    label: "Polygon PoS RootChainManager",
    type: "bridge",
    roles: ["bridge_contract"],
    reason: bridgeReason,
  }),
  record({
    id: "polygon-pos-erc20-predicate",
    address: "0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf",
    network: "evm",
    label: "Polygon PoS ERC20 Predicate",
    type: "bridge",
    roles: ["bridge_contract"],
    reason: bridgeReason,
  }),
  record({
    id: "polygon-pos-child-chain-manager",
    address: "0xa6fa4fb5f76172d178d61b04b0ecd319c5d1c0aa",
    network: "evm",
    label: "Polygon PoS ChildChainManager",
    type: "bridge",
    roles: ["bridge_contract"],
    reason: bridgeReason,
  }),
  record({
    id: "solana-system-program",
    address: "11111111111111111111111111111111",
    network: "solana",
    chain: "Solana",
    label: "Solana System Program",
    type: "protocol",
    roles: ["system_program"],
    reason: solanaProgramReason,
  }),
  record({
    id: "solana-vote-program",
    address: "vote111111111111111111111111111111111111111",
    network: "solana",
    chain: "Solana",
    label: "Solana Vote Program",
    type: "protocol",
    roles: ["system_program"],
    reason: solanaProgramReason,
  }),
  record({
    id: "solana-stake-program",
    address: "stake11111111111111111111111111111111111111",
    network: "solana",
    chain: "Solana",
    label: "Solana Stake Program",
    type: "protocol",
    roles: ["system_program"],
    reason: solanaProgramReason,
  }),
  record({
    id: "solana-compute-budget-program",
    address: "computebudget111111111111111111111111111111",
    network: "solana",
    chain: "Solana",
    label: "Solana Compute Budget Program",
    type: "protocol",
    roles: ["system_program"],
    reason: solanaProgramReason,
  }),
  record({
    id: "spl-token-program",
    address: "tokenkegqfezyinwajbnbgkpfxcwubvf9ss623vq5da",
    network: "solana",
    chain: "Solana",
    label: "SPL Token Program",
    type: "protocol",
    roles: ["protocol_program"],
    reason: solanaProgramReason,
  }),
  record({
    id: "associated-token-account-program",
    address: "atokengpvbdgvxr1b2hvzbsiqw5xwh25eftnslja8knl",
    network: "solana",
    chain: "Solana",
    label: "Associated Token Account Program",
    type: "protocol",
    roles: ["protocol_program"],
    reason: solanaProgramReason,
  }),
  record({
    id: "token-2022-program",
    address: "tokensqdbnblqp5vehdkas6epf1smh1dbkqp6xk6mn",
    network: "solana",
    chain: "Solana",
    label: "Token-2022 Program",
    type: "protocol",
    roles: ["protocol_program"],
    reason: solanaProgramReason,
  }),
  record({
    id: "memo-program",
    address: "memosq4gqabaxkb96qnh8tysncwxmywcqxgdlgfmchr",
    network: "solana",
    chain: "Solana",
    label: "Memo Program",
    type: "protocol",
    roles: ["protocol_program"],
    reason: solanaProgramReason,
  }),
  record({
    id: "solana-clock-sysvar",
    address: "sysvarc1ock11111111111111111111111111111111",
    network: "solana",
    chain: "Solana",
    label: "Solana Clock Sysvar",
    type: "protocol",
    roles: ["system_program"],
    reason: solanaProgramReason,
  }),
  record({
    id: "solana-rent-sysvar",
    address: "sysvarrent111111111111111111111111111111111",
    network: "solana",
    chain: "Solana",
    label: "Solana Rent Sysvar",
    type: "protocol",
    roles: ["system_program"],
    reason: solanaProgramReason,
  }),
  record({
    id: "wrapped-sol-mint",
    address: "so11111111111111111111111111111111111111112",
    network: "solana",
    chain: "Solana",
    label: "Wrapped SOL Mint",
    type: "protocol",
    roles: ["token_mint"],
    reason: solanaProgramReason,
  }),
  record({
    id: "usdc-solana-mint",
    address: "epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwydt1v",
    network: "solana",
    chain: "Solana",
    label: "USDC Mint on Solana",
    type: "protocol",
    roles: ["token_mint"],
    reason: solanaProgramReason,
  }),
  record({
    id: "jupiter-token-mint",
    address: "jupyiwryjfskupiha7hker8vutaefosybkedznssdvcn",
    network: "solana",
    chain: "Solana",
    label: "Jupiter Token Mint",
    type: "protocol",
    roles: ["token_mint"],
    reason: solanaProgramReason,
  }),
  record({
    id: "jupiter-aggregator-program",
    address: "jup6lkbzbjs1jkkwapdhny74zcz3tluzoih5qnyvtav4",
    network: "solana",
    chain: "Solana",
    label: "Jupiter Aggregator Program",
    type: "protocol",
    roles: ["protocol_program", "router"],
    reason: solanaProgramReason,
  }),
  record({
    id: "orca-whirlpool-program",
    address: "whirlbmiicvdio4qvufm5kag6ctzamyzpccvykf4ni",
    network: "solana",
    chain: "Solana",
    label: "Orca Whirlpool Program",
    type: "protocol",
    roles: ["protocol_program", "router"],
    reason: solanaProgramReason,
  }),
  record({
    id: "raydium-clmm-program",
    address: "cammczo5yl8w4vff8kvhrk22ggusp5vtaw7grrkgrwqk",
    network: "solana",
    chain: "Solana",
    label: "Raydium CLMM Program",
    type: "protocol",
    roles: ["protocol_program", "router"],
    reason: solanaProgramReason,
  }),
  record({
    id: "raydium-amm-program",
    address: "675kpx9mhtjs2zt1qfr1nybuu1j1h1m9wwmojsst",
    network: "solana",
    chain: "Solana",
    label: "Raydium AMM Program",
    type: "protocol",
    roles: ["protocol_program", "router"],
    reason: solanaProgramReason,
  }),
  record({
    id: "metaplex-token-metadata-program",
    address: "metaqbxxuerdq28cj1rbawkyqm3ybzjb6a8bt518x1s",
    network: "solana",
    chain: "Solana",
    label: "Metaplex Token Metadata Program",
    type: "protocol",
    roles: ["protocol_program"],
    reason: solanaProgramReason,
  }),
] as const

const reviewOnlyEntityTypes = new Set<EntityType>([
  "exchange",
  "service",
  "protocol",
  "bridge",
  "contract",
])

function networkFrom(address: string, chain?: string | null): EntityRegistryNetwork {
  if (chain?.trim().toLowerCase() === "solana") return "solana"
  return address.trim().startsWith("0x") ? "evm" : "solana"
}

function normalizeChain(chain: string | null | undefined) {
  return chain?.trim().toLowerCase() || null
}

export function normalizeEntityAddress(
  walletAddress: string,
  chain?: string | null
) {
  const trimmed = walletAddress.trim()
  return networkFrom(trimmed, chain) === "evm" ? trimmed.toLowerCase() : trimmed
}

function keyFor(record: EntityRegistryRecord) {
  return `${record.network}:${normalizeChain(record.chain) ?? "*"}:${normalizeEntityAddress(record.address, record.chain)}`
}

const registryIndex = new Map<string, EntityRegistryRecord[]>()
for (const item of ENTITY_REGISTRY) {
  const address = normalizeEntityAddress(item.address, item.chain)
  const key = `${item.network}:${address}`
  registryIndex.set(key, [...(registryIndex.get(key) ?? []), item])
}

export function lookupEntityRegistry(
  walletAddress: string,
  chain?: string | null
): EntityRegistryRecord | null {
  const network = networkFrom(walletAddress, chain)
  const normalizedAddress = normalizeEntityAddress(walletAddress, chain)
  const candidates = registryIndex.get(`${network}:${normalizedAddress}`) ?? []
  const active = candidates.filter((candidate) => candidate.status === "active")
  if (!active.length) return null
  if (!chain) return active[0] ?? null
  const normalizedRequestedChain = normalizeChain(chain)
  return (
    active.find((candidate) => normalizeChain(candidate.chain) === normalizedRequestedChain) ??
    active.find((candidate) => candidate.chain === null) ??
    null
  )
}

export function detectKnownEntity(
  walletAddress: string,
  chain?: string | null
): KnownEntity | null {
  const item = lookupEntityRegistry(walletAddress, chain)
  if (!item) return null
  return {
    ...item,
    registrySchemaVersion: ENTITY_REGISTRY_SCHEMA_VERSION,
    registryDatasetVersion: ENTITY_REGISTRY_DATASET_VERSION,
  }
}

/** Legacy address-only view retained for compatibility with existing imports. */
export const KNOWN_ENTITIES: Record<string, KnownEntity> = Object.fromEntries(
  ENTITY_REGISTRY.map((item) => {
    const known = detectKnownEntity(item.address, item.chain)
    return [normalizeEntityAddress(item.address, item.chain), known as KnownEntity]
  })
)

export function isReviewOnlyEntityType(entityType: EntityType) {
  return reviewOnlyEntityTypes.has(entityType)
}

export function validateEntityRegistry(records: readonly EntityRegistryRecord[] = ENTITY_REGISTRY) {
  const ids = new Set<string>()
  const keys = new Set<string>()
  const errors: string[] = []

  for (const item of records) {
    if (ids.has(item.id)) errors.push(`duplicate id: ${item.id}`)
    ids.add(item.id)

    if (!item.address.trim()) errors.push(`empty address: ${item.id}`)
    if (item.network === "evm" && !/^0x[0-9a-fA-F]{40}$/.test(item.address)) {
      errors.push(`invalid EVM address: ${item.id}`)
    }
    if (!item.roles.length) errors.push(`missing roles: ${item.id}`)
    if (item.action !== "manual_review") errors.push(`unsafe action: ${item.id}`)
    if (item.riskEffect !== "neutral_context") errors.push(`unsafe risk effect: ${item.id}`)
    if (item.sharedInfrastructureEffect !== "neutral_context") {
      errors.push(`unsafe shared-infrastructure effect: ${item.id}`)
    }
    if (!item.provenance.reference.trim()) errors.push(`missing provenance: ${item.id}`)

    const key = keyFor(item)
    if (keys.has(key)) errors.push(`duplicate address scope: ${key}`)
    keys.add(key)
  }

  return {
    ok: errors.length === 0,
    errors,
    recordCount: records.length,
    datasetVersion: ENTITY_REGISTRY_DATASET_VERSION,
    schemaVersion: ENTITY_REGISTRY_SCHEMA_VERSION,
  }
}

export function entityRegistrySummary() {
  const roles = new Map<EntityRegistryRole, number>()
  const types = new Map<EntityType, number>()
  for (const item of ENTITY_REGISTRY) {
    types.set(item.type, (types.get(item.type) ?? 0) + 1)
    for (const role of item.roles) roles.set(role, (roles.get(role) ?? 0) + 1)
  }
  return {
    schemaVersion: ENTITY_REGISTRY_SCHEMA_VERSION,
    datasetVersion: ENTITY_REGISTRY_DATASET_VERSION,
    records: ENTITY_REGISTRY.length,
    byType: Object.fromEntries(types),
    byRole: Object.fromEntries(roles),
  }
}
