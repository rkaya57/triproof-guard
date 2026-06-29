import { db } from "@/lib/db/prisma"

function toNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value)
  if (typeof value === "number") return value
  if (typeof value === "string") return Number.parseInt(value, 10) || 0
  return 0
}

function countFrom(rows: unknown[]) {
  return toNumber((rows[0] as Record<string, unknown> | undefined)?.count)
}

async function safeCount(sql: string) {
  try {
    return countFrom(await db.$queryRawUnsafe<unknown[]>(sql))
  } catch {
    return 0
  }
}

export type AdminHealthCheck = {
  name: string
  ok: boolean
  detail: string
}

export type AdminMetric = {
  label: string
  value: string | number
  tone: "good" | "warn" | "bad" | "neutral"
}

export async function getAdminMetrics() {
  const [users, analyses, completed, failed, pendingBatches, failedBatches, totalWallets] =
    await Promise.all([
      safeCount(`SELECT COUNT(*)::int AS count FROM "User"`),
      safeCount(`SELECT COUNT(*)::int AS count FROM "Analysis"`),
      safeCount(`SELECT COUNT(*)::int AS count FROM "Analysis" WHERE "status" = 'completed'`),
      safeCount(`SELECT COUNT(*)::int AS count FROM "Analysis" WHERE "status" = 'failed'`),
      safeCount(`SELECT COUNT(*)::int AS count FROM "AnalysisBatch" WHERE "status" IN ('pending', 'processing')`),
      safeCount(`SELECT COUNT(*)::int AS count FROM "AnalysisBatch" WHERE "status" = 'failed'`),
      safeCount(`SELECT COALESCE(SUM("totalWallets"), 0)::int AS count FROM "Analysis"`),
    ])

  const healthTone = failed || failedBatches ? "bad" : pendingBatches ? "warn" : "good"

  return [
    { label: "System Health", value: healthTone === "bad" ? "Critical" : healthTone === "warn" ? "Warning" : "Healthy", tone: healthTone },
    { label: "Users", value: users, tone: "neutral" },
    { label: "Total Analyses", value: analyses, tone: "neutral" },
    { label: "Completed", value: completed, tone: "good" },
    { label: "Failed", value: failed, tone: failed ? "bad" : "good" },
    { label: "Pending Batches", value: pendingBatches, tone: pendingBatches ? "warn" : "good" },
    { label: "Failed Batches", value: failedBatches, tone: failedBatches ? "bad" : "good" },
    { label: "Wallets Processed", value: totalWallets, tone: "neutral" },
  ] satisfies AdminMetric[]
}

export async function getRecentAnalyses() {
  try {
    return await db.$queryRawUnsafe<unknown[]>(`
      SELECT a."id", a."status", a."totalWallets", a."createdAt", a."analysisMode", p."name" AS "projectName", p."chain"
      FROM "Analysis" a
      JOIN "Project" p ON p."id" = a."projectId"
      ORDER BY a."createdAt" DESC
      LIMIT 12
    `)
  } catch {
    return []
  }
}

export async function getAdminHealthChecks() {
  const checks: AdminHealthCheck[] = []

  try {
    await db.$queryRawUnsafe(`SELECT 1`)
    checks.push({ name: "Database", ok: true, detail: "Database query succeeded." })
  } catch {
    checks.push({ name: "Database", ok: false, detail: "Database query failed." })
  }

  checks.push({ name: "Admin emails", ok: Boolean(process.env.ADMIN_EMAILS), detail: process.env.ADMIN_EMAILS ? "Configured" : "Missing ADMIN_EMAILS" })
  checks.push({ name: "Etherscan", ok: Boolean(process.env.ETHERSCAN_API_KEY), detail: process.env.ETHERSCAN_API_KEY ? "Configured" : "Missing ETHERSCAN_API_KEY" })
  checks.push({ name: "Alchemy", ok: Boolean(process.env.ALCHEMY_API_KEY), detail: process.env.ALCHEMY_API_KEY ? "Configured" : "Missing ALCHEMY_API_KEY" })
  checks.push({ name: "Base treasury", ok: Boolean(process.env.TRIPROOF_TREASURY_BASE_ADDRESS), detail: process.env.TRIPROOF_TREASURY_BASE_ADDRESS ? "Configured" : "Missing Base treasury" })
  checks.push({ name: "Polygon treasury", ok: Boolean(process.env.TRIPROOF_TREASURY_POLYGON_ADDRESS), detail: process.env.TRIPROOF_TREASURY_POLYGON_ADDRESS ? "Configured" : "Missing Polygon treasury" })
  checks.push({ name: "Session secret", ok: Boolean(process.env.NEXTAUTH_SECRET), detail: process.env.NEXTAUTH_SECRET ? "Configured" : "Missing NEXTAUTH_SECRET" })
  checks.push({ name: "Worker secret", ok: Boolean(process.env.CRON_SECRET || process.env.ANALYSIS_WORKER_SECRET), detail: process.env.CRON_SECRET || process.env.ANALYSIS_WORKER_SECRET ? "Configured" : "Missing worker secret" })

  const failedBatches = await safeCount(`SELECT COUNT(*)::int AS count FROM "AnalysisBatch" WHERE "status" = 'failed'`)
  checks.push({ name: "Failed batches", ok: failedBatches === 0, detail: `${failedBatches} failed batch jobs` })

  return checks
}
