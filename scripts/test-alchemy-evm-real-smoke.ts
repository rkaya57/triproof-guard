import { alchemyProvider } from "@/lib/onchain/providers/alchemy"

const chain = "Ethereum"
const smokeAddress = "0x1111111111111111111111111111111111111111"

if (!alchemyProvider.isConfigured(chain)) {
  console.error("Alchemy EVM smoke failed: Ethereum provider is not configured.")
  process.exit(1)
}

const startedAt = performance.now()
const data = await alchemyProvider.enrichWallet(smokeAddress, chain, {
  campaignContracts: [],
})
const elapsedMs = Number((performance.now() - startedAt).toFixed(1))

if (data.provider !== "alchemy" || data.chain !== chain) {
  console.error("Alchemy EVM smoke failed: unexpected provider or chain response.", {
    provider: data.provider,
    chain: data.chain,
  })
  process.exit(1)
}

if (data.txCount === null || data.historyTruncated === undefined) {
  console.error("Alchemy EVM smoke failed: evidence confidence fields are missing.", {
    txCount: data.txCount,
    historyTruncated: data.historyTruncated,
  })
  process.exit(1)
}

console.log(
  JSON.stringify({
    chain,
    provider: data.provider,
    txCount: data.txCount,
    historyTruncated: data.historyTruncated,
    isContract: data.isContract,
    evidenceVersion:
      typeof data.rawData === "object" && data.rawData !== null
        ? (data.rawData as Record<string, unknown>).evmEvidenceVersion ?? null
        : null,
    elapsedMs,
  })
)
