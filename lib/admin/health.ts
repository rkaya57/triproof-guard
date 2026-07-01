import { db } from "@/lib/db/prisma"

function toNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value)
  if (typeof value === "number") return value
  if (typeof value === "string") return Number.parseInt(value, 10) || 0
  return 0
}

function toDateString(value: unknown) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
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
  detail?: string
}

export type AdminWarning = {
  title: string
  severity: "warning" | "critical" | "info"
  count?: number
  detail: string
  action: string
  href: string
}

export type AdminQueueBreakdown = {
  pending: number
  processing: number
  completed: number
  failed: number
  staleProcessing: number
  oldestPendingAt: string | null
  oldestProcessingAt: string | null
}

export async function getAdminQueueBreakdown(): Promise<AdminQueueBreakdown> {
  try {
    const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        COUNT(*) FILTER (WHERE "status" = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE "status" = 'processing')::int AS processing,
        COUNT(*) FILTER (WHERE "status" = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE "status" = 'failed')::int AS failed,
        COUNT(*) FILTER (
          WHERE "status" = 'processing'
            AND "startedAt" IS NOT NULL
            AND "startedAt" < NOW() - INTERVAL '15 minutes'
        )::int AS "staleProcessing",
        MIN("createdAt") FILTER (WHERE "status" = 'pending') AS "oldestPendingAt",
        MIN("startedAt") FILTER (WHERE "status" = 'processing') AS "oldestProcessingAt"
      FROM "AnalysisBatch"
    `)
    const row = rows[0] ?? {}
    return {
      pending: toNumber(row.pending),
      processing: toNumber(row.processing),
      completed: toNumber(row.completed),
      failed: toNumber(row.failed),
      staleProcessing: toNumber(row.staleProcessing),
      oldestPendingAt: toDateString(row.oldestPendingAt),
      oldestProcessingAt: toDateString(row.oldestProcessingAt),
    }
  } catch {
    return {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      staleProcessing: 0,
      oldestPendingAt: null,
      oldestProcessingAt: null,
    }
  }
}

export async function getAdminMetrics() {
  const [users, analyses, completed, failed, queue, totalWallets] =
    await Promise.all([
      safeCount(`SELECT COUNT(*)::int AS count FROM "User"`),
      safeCount(`SELECT COUNT(*)::int AS count FROM "Analysis"`),
      safeCount(`SELECT COUNT(*)::int AS count FROM "Analysis" WHERE "status" = 'completed'`),
      safeCount(`SELECT COUNT(*)::int AS count FROM "Analysis" WHERE "status" = 'failed'`),
      getAdminQueueBreakdown(),
      safeCount(`SELECT COALESCE(SUM("totalWallets"), 0)::int AS count FROM "Analysis"`),
    ])

  const activeQueue = queue.pending + queue.processing
  const healthTone = failed || queue.failed || queue.staleProcessing ? "bad" : activeQueue ? "warn" : "good"

  return [
    {
      label: "System Health",
      value: healthTone === "bad" ? "Critical" : healthTone === "warn" ? "Warning" : "Healthy",
      tone: healthTone,
      detail: healthTone === "warn" ? `${activeQueue} active queue batches` : healthTone === "bad" ? "Failed or stale jobs detected" : "All core checks look clean",
    },
    { label: "Users", value: users, tone: "neutral", detail: "Registered accounts" },
    { label: "Total Analyses", value: analyses, tone: "neutral", detail: "All created analysis jobs" },
    { label: "Completed", value: completed, tone: "good", detail: "Finished reports" },
    { label: "Failed Analyses", value: failed, tone: failed ? "bad" : "good", detail: "Analysis jobs with failed status" },
    { label: "Active Queue", value: activeQueue, tone: activeQueue ? "warn" : "good", detail: `${queue.pending} pending / ${queue.processing} processing` },
    { label: "Failed Batches", value: queue.failed, tone: queue.failed ? "bad" : "good", detail: "Background queue failures" },
    { label: "Wallets Processed", value: totalWallets, tone: "neutral", detail: "Total submitted wallets" },
  ] satisfies AdminMetric[]
}

export async function getAdminWarnings(): Promise<AdminWarning[]> {
  const [failedAnalyses, queue] = await Promise.all([
    safeCount(`SELECT COUNT(*)::int AS count FROM "Analysis" WHERE "status" = 'failed'`),
    getAdminQueueBreakdown(),
  ])

  const warnings: AdminWarning[] = []
  const activeQueue = queue.pending + queue.processing

  if (activeQueue > 0) {
    warnings.push({
      title: "Active analysis queue",
      severity: queue.staleProcessing > 0 ? "critical" : "warning",
      count: activeQueue,
      detail: `${queue.pending} pending and ${queue.processing} processing batch jobs are waiting for the worker. This is normal while large analyses are running, but it should decrease after the worker cron runs.`,
      action: "Open queue docs",
      href: "/docs/queue",
    })
  }

  if (queue.staleProcessing > 0) {
    warnings.push({
      title: "Stale processing batches",
      severity: "critical",
      count: queue.staleProcessing,
      detail: "Some batches have been processing for more than 15 minutes. They may be stuck and should be recovered by the queue worker.",
      action: "Open queue docs",
      href: "/docs/queue",
    })
  }

  if (queue.failed > 0) {
    warnings.push({
      title: "Failed queue batches",
      severity: "critical",
      count: queue.failed,
      detail: "One or more background batches failed. Check worker logs and inspect the affected analysis.",
      action: "Review analysis ops",
      href: "/dashboard/admin/analyses",
    })
  }

  if (failedAnalyses > 0) {
    warnings.push({
      title: "Failed analyses",
      severity: "critical",
      count: failedAnalyses,
      detail: "Some analysis records are marked failed. Review logs, provider status and CSV inputs.",
      action: "Review analyses",
      href: "/dashboard/admin/analyses",
    })
  }

  if (!process.env.WORKER_SECRET) {
    warnings.push({
      title: "Worker secret not configured",
      severity: "warning",
      detail: "WORKER_SECRET is missing. Add it in Vercel environment variables before using scheduled workers.",
      action: "Open production docs",
      href: "/docs/production",
    })
  }

  if (!warnings.length) {
    warnings.push({
      title: "No active warnings",
      severity: "info",
      detail: "Queue, failed jobs and critical admin checks look clean right now.",
      action: "Open diagnostics",
      href: "/dashboard/admin/diagnostics",
    })
  }

  return warnings
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
  checks.push({ name: "Helius", ok: Boolean(process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_URL), detail: process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_URL ? "Configured" : "Missing Solana provider" })
  checks.push({ name: "Treasury Solana", ok: Boolean(process.env.TRIPROOF_TREASURY_SOLANA_ADDRESS), detail: process.env.TRIPROOF_TREASURY_SOLANA_ADDRESS ? "Configured" : "Missing Solana treasury" })
  checks.push({ name: "Session secret", ok: Boolean(process.env.NEXTAUTH_SECRET), detail: process.env.NEXTAUTH_SECRET ? "Configured" : "Missing NEXTAUTH_SECRET" })
  checks.push({ name: "Worker secret", ok: Boolean(process.env.WORKER_SECRET), detail: process.env.WORKER_SECRET ? "Configured" : "Missing WORKER_SECRET" })

  const queue = await getAdminQueueBreakdown()
  checks.push({ name: "Active queue", ok: queue.pending + queue.processing === 0, detail: `${queue.pending + queue.processing} active batch jobs` })
  checks.push({ name: "Failed batches", ok: queue.failed === 0, detail: `${queue.failed} failed batch jobs` })

  return checks
}
