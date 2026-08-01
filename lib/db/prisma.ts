import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { databaseConnectionUrl } from "@/lib/db/connection-url"

function envNumber(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const connectionString = databaseConnectionUrl(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/tri_proof_guard?schema=public"
)

const adapter = new PrismaPg({
  connectionString,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  max: process.env.NODE_ENV === "production" ? envNumber("DATABASE_POOL_MAX", 1) : undefined,
})

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    transactionOptions: {
      maxWait: envNumber("DATABASE_TRANSACTION_MAX_WAIT_MS", 30_000),
      timeout: envNumber("DATABASE_TRANSACTION_TIMEOUT_MS", 280_000),
    },
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db
}
