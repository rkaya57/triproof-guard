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
const SAFE_SAMPLE = "0x5298A93734C3D979eF1f23F78eBB871879A21F22"
const SAFE_PROXY_FACTORY = "0xc22834581ebc8527d974f8a1c97e1bea4ef910bc"
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
    contractaddresses: SAFE_SAMPLE,
  })
  assert.ok(Array.isArray(creationResult) && creationResult.length > 0, "Safe creation provenance missing")
  const creation = normalizeEvmCreationProvenance(creationResult[0] ?? null)
  assert.match(creation.deployerAddress ?? "", /^0x[0-9a-f]{40}$/)
  assert.equal(
    creation.factoryAddress,
    SAFE_PROXY_FACTORY,
    "Safe sample did not resolve to the expected canonical EIP-155 proxy factory"
  )
  assert.match(creation.transactionHash ?? "", /^0x[0-9a-f]{64}$/)

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
        safeSample: SAFE_SAMPLE.toLowerCase(),
        creator: creation.deployerAddress,
        factory: creation.factoryAddress,
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
