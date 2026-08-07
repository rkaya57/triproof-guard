export type EvmContractSourceLike = {
  ContractName?: string
  ABI?: string
  Proxy?: string
  Implementation?: string
}

export type EvmContractCreationLike = {
  contractAddress?: string
  contractCreator?: string
  txHash?: string
  blockNumber?: string
  timestamp?: string
  contractFactory?: string
  creationBytecode?: string
}

export type EvmContractClassification = ReturnType<typeof classifyEvmContractSource>

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

export function normalizeEvmProvenanceAddress(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? ""
  if (!/^0x[0-9a-f]{40}$/.test(normalized) || normalized === ZERO_ADDRESS) return null
  return normalized
}

export function classifyEvmContractSource(source: EvmContractSourceLike | null) {
  const name = source?.ContractName?.trim() ?? ""
  const abi = source?.ABI ?? ""
  const proxy = source?.Proxy === "1" || Boolean(source?.Implementation?.trim())
  const safe =
    /gnosis.?safe|safeproxy|safe$/i.test(name) ||
    (/getOwners/i.test(abi) && /getThreshold|execTransaction/i.test(abi))
  const multisig = safe || /multisig/i.test(name) || (/owners/i.test(abi) && /threshold/i.test(abi))
  const bridge = /bridge|portal|inbox|outbox|gateway/i.test(name)

  return {
    name: name || null,
    proxy,
    implementation: normalizeEvmProvenanceAddress(source?.Implementation),
    safe,
    multisig,
    bridge,
    subtype: bridge
      ? "bridge"
      : safe
        ? "safe_multisig"
        : multisig
          ? "multisig"
          : proxy
            ? "proxy"
            : "contract",
  }
}

/**
 * A verified Safe is a smart account controlled by users, not protocol
 * infrastructure. It therefore stays eligible for normal wallet analysis.
 * Bridges and generic contracts remain non-user entities.
 */
export function evmParticipantEntityType(
  contract: EvmContractClassification
): "user" | "bridge" | "contract" {
  if (contract.bridge) return "bridge"
  if (contract.safe) return "user"
  return "contract"
}

export function normalizeEvmCreationProvenance(
  creation: EvmContractCreationLike | null,
  fallbackCreator: string | null | undefined = null
) {
  return {
    deployerAddress:
      normalizeEvmProvenanceAddress(creation?.contractCreator) ??
      normalizeEvmProvenanceAddress(fallbackCreator),
    factoryAddress: normalizeEvmProvenanceAddress(creation?.contractFactory),
    transactionHash: creation?.txHash?.trim().toLowerCase() || null,
    blockNumber: creation?.blockNumber?.trim() || null,
    timestamp: creation?.timestamp?.trim() || null,
  }
}
