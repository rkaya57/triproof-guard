import { NextResponse } from "next/server"

import {
  addBlogComment,
  getBlogEngagement,
  likeBlogPost,
  recordBlogShare,
  unlikeBlogPost,
} from "@/lib/blog/engagement"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const url = new URL(request.url)
  const visitorId = url.searchParams.get("visitorId") ?? undefined

  const engagement = await getBlogEngagement(slug, visitorId).catch((error) => ({
    error: error instanceof Error ? error.message : "Engagement could not be loaded.",
  }))

  if (!engagement || "error" in engagement) {
    return NextResponse.json(engagement ?? { error: "Post not found." }, { status: engagement ? 500 : 404 })
  }

  return NextResponse.json(engagement)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const action = String(body.action ?? "")

  try {
    if (action === "like") {
      const visitorId = String(body.visitorId ?? "").trim()
      if (!visitorId) return NextResponse.json({ error: "visitorId is required." }, { status: 400 })
      const engagement = await likeBlogPost(slug, visitorId)
      return engagement ? NextResponse.json(engagement) : NextResponse.json({ error: "Post not found." }, { status: 404 })
    }

    if (action === "unlike") {
      const visitorId = String(body.visitorId ?? "").trim()
      if (!visitorId) return NextResponse.json({ error: "visitorId is required." }, { status: 400 })
      const engagement = await unlikeBlogPost(slug, visitorId)
      return engagement ? NextResponse.json(engagement) : NextResponse.json({ error: "Post not found." }, { status: 404 })
    }

    if (action === "comment") {
      const authorName = String(body.authorName ?? "").trim().slice(0, 80)
      const authorEmail = String(body.authorEmail ?? "").trim().slice(0, 120)
      const content = String(body.content ?? "").trim().slice(0, 1200)
      if (!authorName || !content) {
        return NextResponse.json({ error: "Name and comment are required." }, { status: 400 })
      }
      const engagement = await addBlogComment({ slug, authorName, authorEmail, content })
      return engagement ? NextResponse.json(engagement) : NextResponse.json({ error: "Post not found." }, { status: 404 })
    }

    if (action === "share") {
      const platform = String(body.platform ?? "copy").trim().slice(0, 40)
      const engagement = await recordBlogShare(slug, platform)
      return engagement ? NextResponse.json(engagement) : NextResponse.json({ error: "Post not found." }, { status: 404 })
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Engagement action failed." },
      { status: 500 }
    )
  }
}
