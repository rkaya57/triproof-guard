import { db } from "@/lib/db/prisma"
import { getOnChainConfig } from "@/lib/onchain/enrichment-types"
import { getOnChainProvider } from "@/lib/onchain/provider-router"
import { getAnalysisQueueStatus } from "@/lib/analysis/queue-optimizer"
import { configuredProductionSecretStatus } from "@/lib/env/validation"

export type HealthStatus = "ok" | "warning" | "error"

export type HealthCheck = {
  key: string
  label: string
  status: HealthStatus
  message: string
  details?: Record<string, unknown>
}

function envPresent(name: string) {
  return Boolean(process.env[name]?.trim())
}

function statusPriority(status: HealthStatus) {
  if (status === "error") return 3
  if (status === "warning") return 2
  return 1
}

function overallStatus(checks: HealthCheck[]): HealthStatus {
  return checks.reduce<HealthStatus>((current, check) => {
    return statusPriority(check.status) > statusPriority(current) ? check.status : current
  }, "ok")
}

async function checkDatabase(): Promise<HealthCheck> {
  try {
    await db.$queryRaw`SELECT 1`
    return {
      key: "database",
      label: "Database connection",
      status: "ok",
      message: "Database connection is working.",
    }
  } catch (error) {
    return {
      key: "database",
      label: "Database connection",
      status: "error",
      message: "Database connection failed.",
      details: { error: error instanceof Error ? error.message : String(error) },
    }
  }
}

async function checkRequiredTables(): Promise<HealthCheck> {
  const tables = [
    "User",
    "Project",
    "Analysis",
    "WalletAnalysis",
    "Cluster",
    "AnalysisBatch",
    "TeamReview",
    "FeedbackEvent",
    "WebhookEndpoint",
    "WebhookDelivery",
  ]

  try {
    const rows = await db.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('User','Project','Analysis','WalletAnalysis','Cluster','AnalysisBatch','TeamReview','FeedbackEvent','WebhookEndpoint','WebhookDelivery')
    `
    const existing = new Set(rows.map((row) => row.table_name))
    const missing = tables.filter((table) => !existing.has(table))

    return {
      key: "schema",
      label: "Database schema readiness",
      status: missing.length ? "error" : "ok",
      message: missing.length
        ? `Missing database tables: ${missing.join(", ")}. Run Prisma migrations.`
        : "Required production tables are present.",
      details: { missing, migrationCommand: "npx prisma generate && npx prisma migrate deploy" },
    }
  } catch (error) {
    return {
      key: "schema",
      label: "Database schema readiness",
      status: "error",
      message: "Could not inspect database tables.",
      details: { error: error instanceof Error ? error.message : String(error) },
    }
  }
}

function checkEnvironment(): HealthCheck {
  const required = ["DATABASE_URL"]
  const recommended = [
    "HELIUS_API_KEY",
    "SOLANA_RPC_URL",
    "TRIPROOF_TREASURY_SOLANA_ADDRESS",
    "NEXT_PUBLIC_SOLANA_RPC_URL",
  ]
  const secretStatus = configuredProductionSecretStatus()
  const missingRequiredSecrets = secretStatus
    .filter((secret) => !secret.configured)
    .map((secret) => secret.displayName)
  const missingRequired = [
    ...required.filter((name) => !envPresent(name)),
    ...missingRequiredSecrets,
  ]
  const missingRecommended = recommended.filter((name) => !envPresent(name))

  return {
    key: "environment",
    label: "Environment variables",
    status: missingRequired.length ? "error" : missingRecommended.length ? "warning" : "ok",
    message: missingRequired.length
      ? `Missing required env vars: ${missingRequired.join(", ")}.`
      : missingRecommended.length
        ? `Recommended env vars missing: ${missingRecommended.join(", ")}.`
        : "Required and recommended env vars are present.",
    details: {
      missingRequired,
      missingRecommended,
      configured: {
        onchainEnabled: process.env.ONCHAIN_ENRICHMENT_ENABLED ?? "true",
        workerMaxBatches: process.env.WORKER_MAX_BATCHES ?? "5",
        workerTimeBudgetMs: process.env.WORKER_TIME_BUDGET_MS ?? "25000",
      },
      requiredSecrets: secretStatus.map((secret) => ({
        name: secret.name,
        aliases: secret.aliases,
        purpose: secret.purpose,
        configured: secret.configured,
      })),
    },
  }
}

function checkProvider(): HealthCheck {
  const config = getOnChainConfig()
  const solanaProvider = getOnChainProvider("Solana")
  const evmProvider = getOnChainProvider("Ethereum")
  const solanaReady = !solanaProvider.usedMockFallback && solanaProvider.provider.id !== "mock"
  const evmReady = !evmProvider.usedMockFallback && evmProvider.provider.id !== "mock"

  if (!config.enabled) {
    return {
      key: "provider",
      label: "On-chain provider readiness",
      status: "error",
      message: "On-chain enrichment is disabled. Set ONCHAIN_ENRICHMENT_ENABLED=true.",
      details: { config },
    }
  }

  return {
    key: "provider",
    label: "On-chain provider readiness",
    status: solanaReady ? "ok" : "error",
    message: solanaReady
      ? `Solana provider is ready via ${solanaProvider.provider.id}.`
      : "Solana provider is not configured. Add HELIUS_API_KEY and SOLANA_RPC_URL.",
    details: {
      solanaProvider: solanaProvider.provider.id,
      solanaReady,
      evmProvider: evmProvider.provider.id,
      evmReady,
      batchSize: config.batchSize,
      requestDelayMs: config.requestDelayMs,
    },
  }
}

async function checkQueue(): Promise<HealthCheck> {
  try {
    const queue = await getAnalysisQueueStatus()
    return {
      key: "queue",
      label: "Analysis queue",
      status: queue.staleProcessing > 0 || queue.failed > 0 ? "warning" : "ok",
      message: queue.staleProcessing > 0
        ? `${queue.staleProcessing} stale processing batch detected. Run the V2.4 queue worker with recoverStale=true.`
        : queue.failed > 0
          ? `${queue.failed} failed queue batches found. Review worker logs.`
          : "Analysis queue looks healthy.",
      details: queue,
    }
  } catch (error) {
    return {
      key: "queue",
      label: "Analysis queue",
      status: "warning",
      message: "Could not inspect analysis queue. The AnalysisBatch table may not exist yet.",
      details: { error: error instanceof Error ? error.message : String(error) },
    }
  }
}

async function checkWebhooks(): Promise<HealthCheck> {
  try {
    const [activeEndpoints, pendingDeliveries, failedDeliveries] = await Promise.all([
      db.webhookEndpoint.count({ where: { isActive: true } }),
      db.webhookDelivery.count({ where: { status: "pending" } }),
      db.webhookDelivery.count({ where: { status: "failed" } }),
    ])

    return {
      key: "webhooks",
      label: "Webhook delivery health",
      status: failedDeliveries > 0 || pendingDeliveries > 10 ? "warning" : "ok",
      message: failedDeliveries > 0
        ? `${failedDeliveries} failed webhook deliveries found. Run webhook retry worker.`
        : pendingDeliveries > 10
          ? `${pendingDeliveries} pending webhook deliveries found.`
          : "Webhook delivery state looks healthy.",
      details: { activeEndpoints, pendingDeliveries, failedDeliveries },
    }
  } catch (error) {
    return {
      key: "webhooks",
      label: "Webhook delivery health",
      status: "warning",
      message: "Could not inspect webhook tables. Migrations may be pending.",
      details: { error: error instanceof Error ? error.message : String(error) },
    }
  }
}

export async function buildProductionHealthReport() {
  const checks = await Promise.all([
    checkDatabase(),
    checkRequiredTables(),
    Promise.resolve(checkEnvironment()),
    Promise.resolve(checkProvider()),
    checkQueue(),
    checkWebhooks(),
  ])

  return {
    version: "V2.5",
    checkedAt: new Date().toISOString(),
    status: overallStatus(checks),
    checks,
    actions: [
      "Run npx prisma generate && npx prisma migrate deploy after schema changes.",
      "Keep WORKER_SECRET configured before enabling worker cron endpoints.",
      "Run /api/worker/analysis-queue periodically for queued analyses.",
      "Run /api/worker/webhook-retry periodically if webhooks are enabled.",
    ],
  }
}
