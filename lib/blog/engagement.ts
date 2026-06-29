import { randomUUID } from "node:crypto"

import { db } from "@/lib/db/prisma"
import { getPostBySlugFromDb } from "@/lib/blog/db"

export type BlogCommentRecord = {
  id: string
  postId: string
  authorName: string
  authorEmail: string | null
  content: string
  status: string
  createdAt: Date
}

function countValue(row: unknown, key = "count") {
  const value = (row as Record<string, unknown> | undefined)?.[key]
  if (typeof value === "number") return value
  if (typeof value === "bigint") return Number(value)
  if (typeof value === "string") return Number.parseInt(value, 10) || 0
  return 0
}

export async function getBlogEngagement(slug: string, visitorId?: string) {
  const post = await getPostBySlugFromDb(slug)
  if (!post) return null

  const [likes, commentsCount, shares, comments, likedRows] = await Promise.all([
    db.$queryRaw<unknown[]>`SELECT COUNT(*)::int AS count FROM "BlogReaction" WHERE "postId" = ${post.id} AND "type" = 'like'`,
    db.$queryRaw<unknown[]>`SELECT COUNT(*)::int AS count FROM "BlogComment" WHERE "postId" = ${post.id} AND "status" = 'visible'`,
    db.$queryRaw<unknown[]>`SELECT COUNT(*)::int AS count FROM "BlogShare" WHERE "postId" = ${post.id}`,
    db.$queryRaw<BlogCommentRecord[]>`
      SELECT * FROM "BlogComment"
      WHERE "postId" = ${post.id} AND "status" = 'visible'
      ORDER BY "createdAt" DESC
      LIMIT 50
    `,
    visitorId
      ? db.$queryRaw<unknown[]>`SELECT COUNT(*)::int AS count FROM "BlogReaction" WHERE "postId" = ${post.id} AND "visitorId" = ${visitorId} AND "type" = 'like'`
      : Promise.resolve([]),
  ])

  return {
    postId: post.id,
    likes: countValue(likes[0]),
    commentsCount: countValue(commentsCount[0]),
    shares: countValue(shares[0]),
    liked: visitorId ? countValue(likedRows[0]) > 0 : false,
    comments,
  }
}

export async function likeBlogPost(slug: string, visitorId: string) {
  const post = await getPostBySlugFromDb(slug)
  if (!post) return null

  await db.$executeRaw`
    INSERT INTO "BlogReaction" ("id", "postId", "visitorId", "type")
    VALUES (${randomUUID()}, ${post.id}, ${visitorId}, 'like')
    ON CONFLICT ("postId", "visitorId", "type") DO NOTHING
  `
  return getBlogEngagement(slug, visitorId)
}

export async function unlikeBlogPost(slug: string, visitorId: string) {
  const post = await getPostBySlugFromDb(slug)
  if (!post) return null

  await db.$executeRaw`
    DELETE FROM "BlogReaction"
    WHERE "postId" = ${post.id} AND "visitorId" = ${visitorId} AND "type" = 'like'
  `
  return getBlogEngagement(slug, visitorId)
}

export async function addBlogComment({
  slug,
  authorName,
  authorEmail,
  content,
}: {
  slug: string
  authorName: string
  authorEmail?: string
  content: string
}) {
  const post = await getPostBySlugFromDb(slug)
  if (!post) return null

  await db.$executeRaw`
    INSERT INTO "BlogComment" ("id", "postId", "authorName", "authorEmail", "content", "status")
    VALUES (${randomUUID()}, ${post.id}, ${authorName}, ${authorEmail || null}, ${content}, 'visible')
  `
  return getBlogEngagement(slug)
}

export async function recordBlogShare(slug: string, platform: string) {
  const post = await getPostBySlugFromDb(slug)
  if (!post) return null

  await db.$executeRaw`
    INSERT INTO "BlogShare" ("id", "postId", "platform")
    VALUES (${randomUUID()}, ${post.id}, ${platform || "copy"})
  `
  return getBlogEngagement(slug)
}
