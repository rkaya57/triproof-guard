import { createHash } from "node:crypto"
import { Interface, id, zeroPadValue } from "ethers"

const RPC = process.env.EVM_RPC_URL?.trim() || "https://ethereum-rpc.publicnode.com"
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
const AAVE_POOL = "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2"
const TARGET = Number(process.env.BENIGN_TARGET_CASES || "120")
const MAX_LOOKBACK = Number(process.env.BENIGN_MAX_LOOKBACK_BLOCKS || "1200000")
const CHUNK = 10_000
const approvalTopic = id("Approval(address,address,uint256)")
const iface = new Interface(["function approve(address spender,uint256 amount)"])

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`${method} HTTP ${response.status}`)
  const payload = await response.json() as { result?: T; error?: { message?: string } }
  if (payload.error) throw new Error(`${method}: ${payload.error.message || "RPC error"}`)
  if (payload.result === undefined) throw new Error(`${method}: missing result`)
  return payload.result
}

const latestHex = await rpc<string>("eth_blockNumber", [])
const latest = Number.parseInt(latestHex, 16)
const minBlock = Math.max(0, latest - MAX_LOOKBACK)
const spenderTopic = zeroPadValue(AAVE_POOL, 32).toLowerCase()
const candidateHashes = new Set<string>()
let scannedFrom = latest

for (let to = latest; to >= minBlock && candidateHashes.size < TARGET * 2; to -= CHUNK) {
  const from = Math.max(minBlock, to - CHUNK + 1)
  scannedFrom = from
  const logs = await rpc<Array<{ transactionHash: string }>>("eth_getLogs", [{
    address: USDC,
    fromBlock: `0x${from.toString(16)}`,
    toBlock: `0x${to.toString(16)}`,
    topics: [approvalTopic, null, spenderTopic],
  }])
  for (const log of logs) candidateHashes.add(log.transactionHash.toLowerCase())
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

const canonical = JSON.stringify({ latest, scannedFrom, controls }, Object.keys({ latest, scannedFrom, controls }).sort())
const report = {
  schemaVersion: 1,
  activationEligible: false,
  selectionUsesModelOutputs: false,
  rpc: RPC,
  latestBlock: latest,
  scannedFromBlock: scannedFrom,
  scannedBlocks: latest - scannedFrom + 1,
  candidateApprovalLogs: candidateHashes.size,
  verifiedBenignControls: controls.length,
  targetControls: TARGET,
  controlsSha256: createHash("sha256").update(JSON.stringify(controls)).digest("hex"),
  controls,
}
console.log(JSON.stringify(report, null, 2))
if (controls.length < Math.min(60, TARGET)) process.exitCode = 2
