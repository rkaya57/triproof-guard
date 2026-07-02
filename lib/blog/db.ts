import { randomUUID } from "node:crypto"

import { databaseUnavailableMessage } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

export type BlogPostRecord = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  content: string
  coverImageUrl: string | null
  category: string | null
  tags: string[]
  status: string
  seoTitle: string | null
  seoDescription: string | null
  authorEmail: string | null
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type BlogPostInput = {
  id?: string
  title: string
  slug: string
  excerpt?: string
  content?: string
  coverImageUrl?: string
  category?: string
  tags?: string[]
  status?: string
  seoTitle?: string
  seoDescription?: string
  authorEmail?: string
}

export async function ensureBlogTable() {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BlogPost" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL,
      "slug" TEXT NOT NULL UNIQUE,
      "excerpt" TEXT,
      "content" TEXT NOT NULL,
      "coverImageUrl" TEXT,
      "category" TEXT,
      "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      "status" TEXT NOT NULL DEFAULT 'draft',
      "seoTitle" TEXT,
      "seoDescription" TEXT,
      "authorEmail" TEXT,
      "publishedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BlogPost_status_idx" ON "BlogPost"("status");`)
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BlogPost_slug_idx" ON "BlogPost"("slug");`)
}

function normalizeStatus(status: string | undefined) {
  if (status === "published" || status === "ready" || status === "draft") return status
  return "draft"
}

function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL)
}

function requireDatabaseUrl() {
  if (!hasDatabaseUrl()) throw new Error(databaseUnavailableMessage)
}

export async function listPublishedPosts() {
  if (!hasDatabaseUrl()) return []
  await ensureBlogTable()
  return db.$queryRaw<BlogPostRecord[]>`
    SELECT * FROM "BlogPost"
    WHERE "status" IN ('published', 'ready')
    ORDER BY COALESCE("publishedAt", "createdAt") DESC
  `
}

export async function listAdminPosts() {
  if (!hasDatabaseUrl()) return []
  await ensureBlogTable()
  return db.$queryRaw<BlogPostRecord[]>`
    SELECT * FROM "BlogPost"
    ORDER BY "updatedAt" DESC, "createdAt" DESC
  `
}

export async function getPostBySlugFromDb(slug: string) {
  if (!hasDatabaseUrl()) return null
  await ensureBlogTable()
  const rows = await db.$queryRaw<BlogPostRecord[]>`
    SELECT * FROM "BlogPost"
    WHERE "slug" = ${slug} AND "status" IN ('published', 'ready')
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function upsertBlogPost(input: BlogPostInput) {
  requireDatabaseUrl()
  await ensureBlogTable()
  const id = input.id || randomUUID()
  const status = normalizeStatus(input.status)
  const publishedAt = status === "published" || status === "ready" ? new Date() : null
  const tags = input.tags ?? []

  const rows = await db.$queryRaw<BlogPostRecord[]>`
    INSERT INTO "BlogPost" (
      "id", "title", "slug", "excerpt", "content", "coverImageUrl", "category", "tags",
      "status", "seoTitle", "seoDescription", "authorEmail", "publishedAt", "updatedAt"
    )
    VALUES (
      ${id}, ${input.title}, ${input.slug}, ${input.excerpt || null}, ${input.content || ""},
      ${input.coverImageUrl || null}, ${input.category || null}, ${tags}, ${status},
      ${input.seoTitle || null}, ${input.seoDescription || null}, ${input.authorEmail || null},
      ${publishedAt}, NOW()
    )
    ON CONFLICT ("id") DO UPDATE SET
      "title" = EXCLUDED."title",
      "slug" = EXCLUDED."slug",
      "excerpt" = EXCLUDED."excerpt",
      "content" = EXCLUDED."content",
      "coverImageUrl" = EXCLUDED."coverImageUrl",
      "category" = EXCLUDED."category",
      "tags" = EXCLUDED."tags",
      "status" = EXCLUDED."status",
      "seoTitle" = EXCLUDED."seoTitle",
      "seoDescription" = EXCLUDED."seoDescription",
      "authorEmail" = EXCLUDED."authorEmail",
      "publishedAt" = COALESCE(EXCLUDED."publishedAt", "BlogPost"."publishedAt"),
      "updatedAt" = NOW()
    RETURNING *
  `
  return rows[0]
}

export async function deleteBlogPost(id: string) {
  requireDatabaseUrl()
  await ensureBlogTable()
  await db.$executeRaw`DELETE FROM "BlogPost" WHERE "id" = ${id}`
}
