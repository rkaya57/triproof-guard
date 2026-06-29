"use client"

import { FormEvent, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type Draft = { id: string; title: string; slug: string; excerpt: string; status: string }
const key = "tri-proof-blog-drafts"

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export function BlogDraftConsole() {
  const [drafts, setDrafts] = useState<Draft[]>([])

  useEffect(() => {
    const raw = localStorage.getItem(key)
    if (raw) setDrafts(JSON.parse(raw) as Draft[])
  }, [])

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(drafts))
  }, [drafts])

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get("title") ?? "").trim()
    if (!title) return
    const slug = String(form.get("slug") ?? "").trim() || slugify(title)
    setDrafts((current) => [{ id: `POST-${current.length + 1}`, title, slug, excerpt: String(form.get("excerpt") ?? ""), status: "draft" }, ...current])
    event.currentTarget.reset()
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Blog Admin</CardTitle>
          <CardDescription>Create blog drafts. Public publishing is currently file-based; database publishing will be added next.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid gap-3 md:grid-cols-2">
            <Input name="title" placeholder="Post title" />
            <Input name="slug" placeholder="custom-slug optional" />
            <Textarea name="excerpt" placeholder="Short excerpt" />
            <Button type="submit">Save Draft</Button>
          </form>
        </CardContent>
      </Card>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Drafts</CardTitle>
          <CardDescription>Use these drafts as content queue for the public blog.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {drafts.length === 0 && <p className="text-sm text-muted-foreground">No drafts yet.</p>}
          {drafts.map((draft) => (
            <div key={draft.id} className="rounded-lg border border-border bg-background/50 p-4">
              <p className="font-medium">{draft.title}</p>
              <p className="text-sm text-muted-foreground">/{draft.slug} • {draft.status}</p>
              {draft.excerpt && <p className="mt-2 text-sm">{draft.excerpt}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
