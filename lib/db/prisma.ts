import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

function normalizeDatabaseUrl(rawUrl: string) {
  if (process.env.NODE_ENV !== "production") return rawUrl

  try {
    const url = new URL(rawUrl)

    // Supabase pooler/direct URLs can expose a self-signed certificate chain in
    // Vercel's Node runtime. pg-connection-string treats sslmode=require as
    // strict verification, so force no-verify for this hosted deployment.
    url.searchParams.delete("sslmode")
    url.searchParams.delete("uselibpqcompat")
    url.searchParams.set("sslmode", "no-verify")

    return url.toString()
  } catch {
    return rawUrl
  }
}

const connectionString = normalizeDatabaseUrl(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/tri_proof_guard?schema=public"
)

const adapter = new PrismaPg({
  connectionString,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
})

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db
}
