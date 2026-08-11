import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

type Candidate = { txHash: string; category: string; sourceUrl: string; upstream: string }
type Pool = {
  schemaVersion: number
  upstreamSha256: string
  candidatePoolSha256: string
  cases: Candidate[]
}
type RpcTx = { hash?: string; from?: string; to?: string | null; input?: string; value?: string } | null

const POOL = path.join(process.cwd(), "artifacts/ptxphish-realworld/candidate-pool.json")
const OUT_DIR = path.join(process.cwd(), "artifacts/ptxphish-presigning-inspection")
const RPC = process.env.EVM_RPC_URL?.trim() || "https://ethereum-rpc.publicnode.com"
const BATCH_SIZE = 40

const PRE_SIGNING_SELECTORS: Record<string, { label: string; family: string }> = {
  "0x095ea7b3": { label: "ERC20 approve(address,uint256)", family: "approval" },
  "0xa22cb465": { label: "ERC721/ERC1155 setApprovalForAll(address,bool)", family: "approval" },
  "0xd505accf": { label: "EIP-2612 permit(address,address,uint256,uint256,uint8,bytes32,bytes32)", family: "permit" },
  "0x8fcbaf0c": { label: "DAI-style permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)", family: "permit" },
  "0x3659cfe6": { label: "upgradeTo(address)", family: "proxy_upgrade" },
  "0x4f1ef286": { label: "upgradeToAndCall(address,bytes)", family: "proxy_upgrade" },
}

function selector(input: string | undefined) {
  const value = input?.toLowerCase() || "0x"
  return /^0x[0-9a-f]{8}/.test(value) ? value.slice(0, 10) : value === "0x" ? "0x" : "short"
}

function canonicalSha(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value, Object.keys(value as object).sort())).digest("hex")
}

async function rpcBatch(hashes: string[]): Promise<Map<string, RpcTx>> {
  const body = hashes.map((hash, index) => ({ jsonrpc: "2.0", id: index + 1, method: "eth_getTransactionByHash", params: [hash] }))
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`)
    const payload = await response.json() as Array<{ id: number; result?: RpcTx; error?: unknown }>
    const out = new Map<string, RpcTx>()
    for (const entry of payload) {
      const hash = hashes[entry.id - 1]
      if (hash) out.set(hash, entry.error ? null : entry.result ?? null)
    }
    return out
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  const pool = JSON.parse(await readFile(POOL, "utf8")) as Pool
  const resolved = new Map<string, RpcTx>()
  for (let i = 0; i < pool.cases.length; i += BATCH_SIZE) {
    const batch = pool.cases.slice(i, i + BATCH_SIZE).map((item) => item.txHash)
    const result = await rpcBatch(batch)
    for (const [hash, tx] of result) resolved.set(hash, tx)
  }

  const selectorCounts: Record<string, number> = {}
  const categorySelectorCounts: Record<string, Record<string, number>> = {}
  const compatible: Array<Candidate & { from: string; to: string; selector: string; selectorLabel: string; selectorFamily: string; inputLengthBytes: number }> = []
  let rpcMissing = 0

  for (const item of pool.cases) {
    const tx = resolved.get(item.txHash)
    if (!tx?.hash) {
      rpcMissing += 1
      continue
    }
    const sel = selector(tx.input)
    selectorCounts[sel] = (selectorCounts[sel] ?? 0) + 1
    const categoryCounts = categorySelectorCounts[item.category] ??= {}
    categoryCounts[sel] = (categoryCounts[sel] ?? 0) + 1
    const known = PRE_SIGNING_SELECTORS[sel]
    if (!known || !tx.from || !tx.to) continue
    compatible.push({
      ...item,
      from: tx.from.toLowerCase(),
      to: tx.to.toLowerCase(),
      selector: sel,
      selectorLabel: known.label,
      selectorFamily: known.family,
      inputLengthBytes: Math.max(0, ((tx.input?.length ?? 2) - 2) / 2),
    })
  }

  compatible.sort((a, b) => a.txHash.localeCompare(b.txHash))
  const compatibleCore = {
    schemaVersion: 1,
    sourceCandidatePoolSha256: pool.candidatePoolSha256,
    upstreamSha256: pool.upstreamSha256,
    classificationPolicy: "RPC-resolved top-level calldata selector must match an explicit user-signable approval, permit, or proxy-upgrade selector; no ScamGuard output consulted",
    cases: compatible,
  }
  const compatibleSha256 = createHash("sha256").update(JSON.stringify(compatibleCore)).digest("hex")
  const report = {
    ...compatibleCore,
    compatibleSha256,
    candidateCount: pool.cases.length,
    resolvedCount: pool.cases.length - rpcMissing,
    rpcMissing,
    compatibleCount: compatible.length,
    compatibleByFamily: Object.fromEntries(Object.keys(PRE_SIGNING_SELECTORS).map((key) => PRE_SIGNING_SELECTORS[key].family).filter((value, index, values) => values.indexOf(value) === index).map((family) => [family, compatible.filter((item) => item.selectorFamily === family).length])),
    compatibleByCategory: Object.fromEntries([...new Set(compatible.map((item) => item.category))].sort().map((category) => [category, compatible.filter((item) => item.category === category).length])),
    selectorCounts: Object.fromEntries(Object.entries(selectorCounts).sort((a, b) => b[1] - a[1])),
    categorySelectorCounts,
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    sourceCandidatePoolSha256: pool.candidatePoolSha256,
    compatibleSha256,
    candidateCount: report.candidateCount,
    resolvedCount: report.resolvedCount,
    rpcMissing: report.rpcMissing,
    compatibleCount: report.compatibleCount,
    compatibleByFamily: report.compatibleByFamily,
    compatibleByCategory: report.compatibleByCategory,
    topSelectors: Object.entries(report.selectorCounts).slice(0, 20),
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
