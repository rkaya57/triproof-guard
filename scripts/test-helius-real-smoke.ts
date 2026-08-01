import assert from "node:assert/strict"
import { performance } from "node:perf_hooks"

import { enrichSolanaWalletsBulk } from "@/lib/onchain/providers/helius-bulk"

const addresses = [
  "21m6NtjiXGY52p6DooTKTmtXg8PCm6Cgyzo8HsWRhiR4",
  "2cu8QYZZa2RzJiq6nztLAdLdFqtKuxxt4MP8WCw1S2ws",
  "2DLseEbaatuwE7TRkgcQb5kT2zkD4Dce8ZtqSyUi39Gb",
  "2eHpopQKFSz9JcFBGBzMLrGsRjVdQ8NYXK1QXnDSdv4o",
  "2eV58DprueqyGifsRop6oMct6LGb7ecfnLqJ287YZLRS",
  "2F2Zothdwtjv7kQ8JWawEZjQLM5GKHkT6oTa5sGQgPBM",
  "2FG34LrNCQDCYkarpqR8LpN12kjLBKMXKSaGMAzvSNwJ",
  "2GwRWLQy6mkLMaJH1NQ27HxKYn86BpxD6QLdHX8VP3z4",
  "2jEHLUuvuD2Xf3fJ894XdxMdhAVfMLVL6s4nqiyVrEvZ",
  "2JpS3ndJy88nQZzdV4xmJTmTXs4oJBBwkGtpz2hSKzZB",
  "2NB38Z64qdewjdpGGTYmaNdnAf9FD5uiMabUMAFKQym7",
  "2oAmg1R1csoEtLgyhUj1h77UgF4GCGpJf1qXos7Nqv4q",
  "2TfpCzSeQpmKh1XuizefAtD74R4hghsWmpyXqjbZk7XJ",
  "2tj3Si1HiT67Fesm6DEUsfPmpT1ZfiYLeBqRWGTz1MmR",
  "2VTaoCvQjyFhtbsQoCkpmJBFA2H6HrcVfDuthhDNVK4d",
  "2vzxw3uKB83xuHQZhGWhbYV7z7zBnZ2JvXRUqjtoKcJo",
  "2WfH8xTWY6qYmUpFYJX5UB2LwhrHwWg3E2Q9c7Js7sDZ",
  "2wT8pPwAqrU4Q6pGvJ6fBhdWv1nJ5DnNn7Vx3S9DgL7A",
  "38fjVvs7PY19ARMwn3e8idwsgzJFYzng8CEpf3YLxDXF",
  "3a6DavUcSV7wjJAqF39X98zYjGQQLJNejpvnwE1cQcWo"
]

async function main() {
  assert.ok(process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_URL)
  const startedAt = performance.now()
  const output = await enrichSolanaWalletsBulk({ addresses })
  const values = Array.from(output.results.values())
  const completed = values.filter((result) => result.status === "completed")
  const failed = values.filter((result) => result.status === "failed")
  const completionRate = completed.length / addresses.length
  const withAccountState = completed.filter(
    (result) => result.data.accountType !== null
  ).length
  const withHistory = completed.filter(
    (result) =>
      result.data.firstSeen !== null ||
      result.data.lastSeen !== null ||
      result.data.txCount !== null
  ).length

  assert.equal(output.results.size, addresses.length)
  assert.ok(
    completionRate >= 0.95,
    `Expected at least 95% completion, received ${(completionRate * 100).toFixed(2)}%`
  )
  assert.equal(withAccountState, completed.length)
  assert.ok(withHistory > 0, "Expected at least one wallet with real transaction history")
  assert.ok(
    completed.every((result) => result.provider === "helius-bulk"),
    "Expected all completed records to come from the real Helius bulk provider"
  )

  console.log(
    JSON.stringify({
      supplied: addresses.length,
      completed: completed.length,
      failed: failed.length,
      completionRate: Number((completionRate * 100).toFixed(2)),
      withAccountState,
      withHistory,
      withFunding: completed.filter(
        (result) => result.data.fundingSource !== null
      ).length,
      requestCount: output.requestCount,
      rateLimitCount: output.rateLimitCount,
      elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
      warnings: output.warnings,
    })
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
