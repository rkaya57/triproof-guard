import { createHash } from "node:crypto"
import { Interface, id, zeroPadValue } from "ethers"

const RPCS = [
  process.env.EVM_RPC_URL?.trim(),
  "https://eth.blockscout.com/api/eth-rpc",
  "https://ethereum-rpc.publicnode.com",
  "https://eth.llamarpc.com",
].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index)
const BLOCKSCOUT_API = "https://eth.blockscout.com/api"
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
const AAVE_POOL = "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2"
const TARGET = Number(process.env.BENIGN_TARGET_CASES || "120")
const MAX_LOOKBACK = Number(process.env.BENIGN_MAX_LOOKBACK_BLOCKS || "1200000")
const approvalTopic = id("Approval(address,address,uint256)")
const iface = new Interface(["function approve(address spender,uint256 amount)"])
let lastRpc = RPCS[0]

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let lastError = "no RPC endpoint available"
  for (const endpoint of RPCS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        cache: "no-store",
      })
      if (!response.ok) { lastError = `${endpoint} ${method} HTTP ${response.status}`; continue }
      const payload = await response.json() as { result?: T; error?: { message?: string } }
      if (payload.error || payload.result === undefined) { lastError = `${endpoint} ${method}: ${payload.error?.message || "missing result"}`; continue }
      lastRpc = endpoint
      return payload.result
    } catch (error) {
      lastError = `${endpoint} ${method}: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  throw new Error(lastError)
}

async function discoverLogs(fromBlock: number, toBlock: number) {
  const spenderTopic = zeroPadValue(AAVE_POOL, 32).toLowerCase()
  const url = new URL(BLOCKSCOUT_API)
  url.searchParams.set("module", "logs")
  url.searchParams.set("action", "getLogs")
  url.searchParams.set("fromBlock", String(fromBlock))
  url.searchParams.set("toBlock", String(toBlock))
  url.searchParams.set("address", USDC)
  url.searchParams.set("topic0", approvalTopic)
  url.searchParams.set("topic2", spenderTopic)
  url.searchParams.set("topic0_2_opr", "and")
  const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" })
  if (!response.ok) throw new Error(`Blockscout logs HTTP ${response.status}`)
  const payload = await response.json() as { status?: string; message?: string; result?: unknown }
  if (!Array.isArray(payload.result)) throw new Error(`Blockscout logs: ${payload.message || "unexpected response"}`)
  return payload.result as Array<{ transactionHash?: string; transaction_hash?: string }>
}

async function main() {
  const latestHex = await rpc<string>("eth_blockNumber", [])
  const latest = Number.parseInt(latestHex, 16)
  const minBlock = Math.max(0, latest - MAX_LOOKBACK)
  const logs = await discoverLogs(minBlock, latest)
  const candidateHashes = new Set<string>()
  for (const log of logs) {
    const hash = log.transactionHash || log.transaction_hash
    if (typeof hash === "string" && /^0x[a-fA-F0-9]{64}$/.test(hash)) candidateHashes.add(hash.toLowerCase())
  }

  const controls: Array<Record<string, unknown>> = []
  for (const hash of [...candidateHashes].sort()) {
    if (controls.length >= TARGET) break
    const tx = await rpc<{ hash: string; to?: string; from: string; input: string; blockNumber: string } | null>("eth_getTransactionByHash", [hash])
    if (!tx || tx.to?.toLowerCase() !== USDC || !tx.input?.startsWith("0x095ea7b3")) continue
    let decoded
    try { decoded = iface.decodeFunctionData("approve", tx.input) } catch { continue }
    if (String(decoded.spender).toLowerCase() !== AAVE_POOL) continue
    const receipt = await rpc<{ status?: string; blockNumber?: string } | null>("eth_getTransactionReceipt", [hash])
    if (!receipt || receipt.status !== "0x1") continue
    controls.push({
      txHash: hash,
      blockNumber: Number.parseInt(receipt.blockNumber || tx.blockNumber, 16),
      from: tx.from.toLowerCase(),
      token: USDC,
      spender: AAVE_POOL,
      selector: "0x095ea7b3",
      method: "approve(address,uint256)",
      groundTruth: "benign",
      provenance: "successful on-chain USDC approval to the official Aave V3 Ethereum Pool; semantic flow independently documented by Aave and token contract independently documented by Circle",
      sources: [
        "https://aave.com/help/supplying/supply-tokens",
        "https://governance.aave.com/t/bgd-aave-v3-ethereum-new-deployment-vs-aave-v2-upgrade/9990/21",
        "https://developers.circle.com/stablecoins/usdc-contract-addresses",
      ],
    })
  }

  const report = {
    schemaVersion: 4,
    activationEligible: false,
    selectionUsesModelOutputs: false,
    discoverySource: "blockscout-rest-logs",
    rpcEndpoints: RPCS,
    lastSuccessfulRpc: lastRpc,
    latestBlock: latest,
    scannedFromBlock: minBlock,
    scannedBlocks: latest - minBlock + 1,
    candidateApprovalLogs: candidateHashes.size,
    verifiedBenignControls: controls.length,
    targetControls: TARGET,
    controlsSha256: createHash("sha256").update(JSON.stringify(controls)).digest("hex"),
    controls,
  }
  console.log(JSON.stringify(report, null, 2))
  if (controls.length < Math.min(60, TARGET)) process.exitCode = 2
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
