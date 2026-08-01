import { Client } from "pg"
import { databaseConnectionUrl } from "@/lib/db/connection-url"

export type AnalysisWorkerLock = {
  acquired: boolean
  release: () => Promise<void>
}

function lockName(analysisId: string) {
  return `triproof-analysis-worker:${analysisId}`
}

export async function acquireAnalysisWorkerLock(
  analysisId: string
): Promise<AnalysisWorkerLock> {
  const rawConnectionString = process.env.DATABASE_URL?.trim()
  if (!rawConnectionString) {
    throw new Error("DATABASE_URL is required for distributed analysis locking")
  }

  const connectionString = databaseConnectionUrl(rawConnectionString)

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
    query_timeout: 15_000,
    application_name: "triproof-analysis-worker-lock",
  })
  await client.connect()

  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [lockName(analysisId)]
    )
    const acquired = Boolean(result.rows[0]?.locked)

    if (!acquired) {
      await client.end()
      return {
        acquired: false,
        release: async () => undefined,
      }
    }

    let released = false
    return {
      acquired: true,
      release: async () => {
        if (released) return
        released = true
        try {
          await client.query(
            "SELECT pg_advisory_unlock(hashtext($1))",
            [lockName(analysisId)]
          )
        } finally {
          await client.end()
        }
      },
    }
  } catch (error) {
    await client.end().catch(() => undefined)
    throw error
  }
}
