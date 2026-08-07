import assert from "node:assert/strict"

import {
  classifyEvmContractSource,
  normalizeEvmCreationProvenance,
  type EvmContractCreationLike,
  type EvmContractSourceLike,
} from "@/lib/onchain/evm-contract-intelligence"

type EtherscanResponse<T> = {
  status: string
  message: string
  result: T
}

const API_URL = "https://api.etherscan.io/v2/api"
// Use Etherscan's current documented Ethereum response fixture so the live gate
// validates the provider contract rather than relying on a third-party address
// that may not be indexed by getcontractcreation. Factory/non-factory semantics
// remain covered by deterministic EVM provenance regressions; any live factory
// value is still validated when present.
const CREATION_SAMPLE = "0xcbdcd3815b5f975e1a2c944a9b2cd1c985a1cb7f"
const EXPECTED_CREATOR = "0x3d080421c9dd5fb387d6e3124f7e1c241ade9568"
const EXPECTED_CREATION_TX = "0xdce495a9261c4a2a5d4e879cfb55c060b4616a846d3425c441a9e31aa34c956f"
const USDC_PROXY = "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRateLimited(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes("rate limit") || normalized.includes("max calls") || normalized.includes("too many requests")
}

async function etherscanCall<T>(params: Record<string, string>, attempts = 3): Promise<T> {
  const apiKey = process.env.ETHERSCAN_API_KEY?.trim()
  assert.ok(apiKey, "ETHERSCAN_API_KEY is required for the production provenance smoke")

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const search = new URLSearchParams({ chainid: "1", ...params, apikey: apiKey })
    const response = await fetch(`${API_URL}?${search.toString()}`, {
      headers: { accept: "application/json" },
    })
    const text = await response.text()

    if (response.status === 429 || isRateLimited(text)) {
      if (attempt === attempts) {
        throw new Error(`Etherscan rate limit persisted after ${attempts} attempts`)
      }
      await sleep(500 * attempt)
      continue
    }

    assert.ok(response.ok, `Etherscan HTTP ${response.status}: ${text.slice(0, 240)}`)
    const body = JSON.parse(text) as EtherscanResponse<T>
    if (body.status === "0" && typeof body.result === "string") {
      if (isRateLimited(`${body.message} ${body.result}`)) {
        if (attempt === attempts) throw new Error(body.result)
        await sleep(500 * attempt)
        continue
      }
      throw new Error(`Etherscan API error: ${body.message} ${body.result}`)
    }
    return body.result
  }

  throw new Error("Etherscan provenance smoke exhausted retries")
}

async function main() {
  const creationResult = await etherscanCall<EvmContractCreationLike[] | string>({
    module: "contract",
    action: "getcontractcreation",
    contractaddresses: CREATION_SAMPLE,
  })
  assert.ok(
    Array.isArray(creationResult) && creationResult.length > 0,
    "Ethereum contract creation provenance missing"
  )
  const rawCreation = creationResult[0] ?? null
  assert.equal(
    rawCreation?.contractAddress?.trim().toLowerCase(),
    CREATION_SAMPLE,
    "Etherscan creation response returned an unexpected contract"
  )
  const creation = normalizeEvmCreationProvenance(rawCreation)
  assert.equal(
    creation.deployerAddress,
    EXPECTED_CREATOR,
    "Etherscan creation sample resolved to an unexpected creator"
  )
  assert.equal(
    creation.transactionHash,
    EXPECTED_CREATION_TX,
    "Etherscan creation sample resolved to an unexpected creation transaction"
  )
  assert.match(creation.blockNumber ?? "", /^\d+$/)
  assert.match(creation.timestamp ?? "", /^\d+$/)
  if (creation.factoryAddress !== null) {
    assert.match(creation.factoryAddress, /^0x[0-9a-f]{40}$/)
  }

  await sleep(350)

  const sourceResult = await etherscanCall<EvmContractSourceLike[] | string>({
    module: "contract",
    action: "getsourcecode",
    address: USDC_PROXY,
  })
  assert.ok(Array.isArray(sourceResult) && sourceResult.length > 0, "USDC proxy source metadata missing")
  const contract = classifyEvmContractSource(sourceResult[0] ?? null)
  assert.equal(contract.proxy, true, "USDC should resolve as an Etherscan-recognized proxy")
  assert.match(contract.implementation ?? "", /^0x[0-9a-f]{40}$/)

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: "etherscan",
        chain: "Ethereum",
        creationSample: CREATION_SAMPLE,
        creator: creation.deployerAddress,
        factory: creation.factoryAddress,
        creationTransaction: creation.transactionHash,
        proxySample: USDC_PROXY.toLowerCase(),
        implementation: contract.implementation,
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error("Etherscan EVM provenance smoke failed:", error)
  process.exit(1)
})
