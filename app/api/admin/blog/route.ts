import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { listAdminPosts, upsertBlogPost } from "@/lib/blog/db"

export const runtime = "nodejs"

function tagsFrom(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((tag) => tag.trim()).filter(Boolean)
  return String(value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const posts = await listAdminPosts()
    return NextResponse.json({ posts })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Blog posts could not be loaded." },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const title = String(body.title ?? "").trim()
  const slug = String(body.slug ?? "").trim()

  if (!title || !slug) {
    return NextResponse.json({ error: "Title and slug are required." }, { status: 400 })
  }

  try {
    const post = await upsertBlogPost({
      id: body.id ? String(body.id) : undefined,
      title,
      slug,
      excerpt: String(body.excerpt ?? "").trim(),
      content: String(body.content ?? "").trim(),
      coverImageUrl: String(body.coverImageUrl ?? "").trim(),
      category: String(body.category ?? "").trim(),
      tags: tagsFrom(body.tags),
      status: String(body.status ?? "draft"),
      seoTitle: String(body.seoTitle ?? "").trim(),
      seoDescription: String(body.seoDescription ?? "").trim(),
      authorEmail: admin.email,
    })
    return NextResponse.json({ post })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Blog post could not be saved." },
      { status: 500 }
    )
  }
}
