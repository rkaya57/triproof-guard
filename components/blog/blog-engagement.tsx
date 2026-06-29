"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { Heart, Loader2, MessageCircle, Share2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type Comment = {
  id: string
  authorName: string
  content: string
  createdAt: string
}

type Engagement = {
  likes: number
  commentsCount: number
  shares: number
  liked: boolean
  comments: Comment[]
}

function getVisitorId() {
  const key = "tri-proof-blog-visitor-id"
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

export function BlogEngagement({ slug, title }: { slug: string; title: string }) {
  const [visitorId, setVisitorId] = useState("")
  const [engagement, setEngagement] = useState<Engagement>({
    likes: 0,
    commentsCount: 0,
    shares: 0,
    liked: false,
    comments: [],
  })
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return ""
    return window.location.href
  }, [])

  async function load(id: string) {
    const response = await fetch(`/api/blog/${slug}/engagement?visitorId=${encodeURIComponent(id)}`, {
      cache: "no-store",
    })
    if (!response.ok) return
    setEngagement((await response.json()) as Engagement)
  }

  useEffect(() => {
    const id = getVisitorId()
    setVisitorId(id)
    void load(id)
  }, [slug])

  async function action(payload: Record<string, unknown>) {
    setPending(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch(`/api/blog/${slug}/engagement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = (await response.json().catch(() => ({}))) as Engagement & { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Action failed")
      setEngagement(body)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed")
    } finally {
      setPending(false)
    }
  }

  async function toggleLike() {
    await action({ action: engagement.liked ? "unlike" : "like", visitorId })
  }

  async function share(platform: string) {
    const text = `${title} — Tri-Proof Guard`
    if (platform === "native" && navigator.share) {
      await navigator.share({ title, text, url: shareUrl }).catch(() => null)
    } else if (platform === "x") {
      window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`, "_blank")
    } else {
      await navigator.clipboard.writeText(shareUrl)
      setMessage("Article link copied.")
    }
    await action({ action: "share", platform })
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const authorName = String(form.get("authorName") ?? "").trim()
    const authorEmail = String(form.get("authorEmail") ?? "").trim()
    const content = String(form.get("content") ?? "").trim()
    if (!authorName || !content) {
      setError("Name and comment are required.")
      return
    }
    await action({ action: "comment", authorName, authorEmail, content })
    event.currentTarget.reset()
    setMessage("Comment published.")
  }

  return (
    <section className="mt-12 grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
      <Card className="glass-panel premium-card h-fit">
        <CardHeader>
          <CardTitle>React & share</CardTitle>
          <CardDescription>Help more Web3 teams discover this guide.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-3"><p className="text-2xl font-semibold text-primary">{engagement.likes}</p><p className="text-xs text-muted-foreground">Likes</p></div>
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-3"><p className="text-2xl font-semibold text-primary">{engagement.commentsCount}</p><p className="text-xs text-muted-foreground">Comments</p></div>
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-3"><p className="text-2xl font-semibold text-primary">{engagement.shares}</p><p className="text-xs text-muted-foreground">Shares</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={toggleLike} disabled={pending || !visitorId} variant={engagement.liked ? "default" : "outline"}>
              {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Heart data-icon="inline-start" />}
              {engagement.liked ? "Liked" : "Like"}
            </Button>
            <Button type="button" variant="outline" onClick={() => share("native")}>
              <Share2 data-icon="inline-start" /> Share
            </Button>
            <Button type="button" variant="outline" onClick={() => share("x")}>Share on X</Button>
            <Button type="button" variant="outline" onClick={() => share("copy")}>Copy Link</Button>
          </div>
          {(message || error) && <p className={error ? "text-sm text-red-300" : "text-sm text-primary"}>{error || message}</p>}
        </CardContent>
      </Card>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageCircle className="text-primary" /> Comments</CardTitle>
          <CardDescription>Ask a question or add feedback about this article.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <form onSubmit={submitComment} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input name="authorName" placeholder="Name" />
              <Input name="authorEmail" placeholder="Email optional" type="email" />
            </div>
            <Textarea name="content" placeholder="Write your comment..." rows={4} />
            <div className="flex justify-end"><Button type="submit" disabled={pending}>Post Comment</Button></div>
          </form>

          <div className="flex flex-col gap-3">
            {engagement.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet. Be the first to comment.</p>}
            {engagement.comments.map((comment) => (
              <div key={comment.id} className="rounded-xl border border-border bg-background/50 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="font-medium">{comment.authorName}</p>
                  <span className="text-xs text-muted-foreground">{new Date(comment.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{comment.content}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
