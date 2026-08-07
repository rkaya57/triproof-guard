import { alchemyProvider } from "@/lib/onchain/providers/alchemy"

const chain = "Ethereum"
const smokeAddress = "0x1111111111111111111111111111111111111111"

async function main() {
  if (!alchemyProvider.isConfigured(chain)) {
    throw new Error("Alchemy EVM smoke failed: Ethereum provider is not configured.")
  }

  const startedAt = performance.now()
  const data = await alchemyProvider.enrichWallet(smokeAddress, chain, {
    campaignContracts: [],
  })
  const elapsedMs = Number((performance.now() - startedAt).toFixed(1))

  if (data.provider !== "alchemy" || data.chain !== chain) {
    throw new Error(
      `Alchemy EVM smoke failed: unexpected provider or chain response (${data.provider}/${data.chain}).`
    )
  }

  if (data.txCount === null || data.historyTruncated === undefined) {
    throw new Error(
      `Alchemy EVM smoke failed: evidence confidence fields are missing (txCount=${String(data.txCount)}, historyTruncated=${String(data.historyTruncated)}).`
    )
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
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
