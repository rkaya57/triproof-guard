"use client"

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react"
import { Eye, ImagePlus, PencilLine, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type Draft = {
  id: string
  title: string
  slug: string
  excerpt: string
  category: string
  tags: string
  coverImageUrl: string
  seoTitle: string
  seoDescription: string
  content: string
  status: string
  createdAt: string
}

const key = "tri-proof-blog-drafts"

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function readImage(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.readAsDataURL(file)
  })
}

export function BlogDraftConsole() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [previewImage, setPreviewImage] = useState("")
  const [previewTitle, setPreviewTitle] = useState("Untitled Web3 security article")
  const [previewExcerpt, setPreviewExcerpt] = useState("Write a short summary that makes teams want to read the article.")
  const [previewCategory, setPreviewCategory] = useState("Airdrop Security")

  useEffect(() => {
    const raw = localStorage.getItem(key)
    if (raw) setDrafts(JSON.parse(raw) as Draft[])
  }, [])

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(drafts))
  }, [drafts])

  const stats = useMemo(() => {
    const published = drafts.filter((draft) => draft.status === "published").length
    return { total: drafts.length, published, drafts: drafts.length - published }
  }, [drafts])

  async function onImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setPreviewImage(await readImage(file))
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get("title") ?? "").trim()
    if (!title) return
    const slug = String(form.get("slug") ?? "").trim() || slugify(title)
    const draft: Draft = {
      id: `POST-${Date.now()}`,
      title,
      slug,
      excerpt: String(form.get("excerpt") ?? "").trim(),
      category: String(form.get("category") ?? "Airdrop Security").trim(),
      tags: String(form.get("tags") ?? "").trim(),
      coverImageUrl: previewImage || String(form.get("coverImageUrl") ?? "").trim(),
      seoTitle: String(form.get("seoTitle") ?? "").trim(),
      seoDescription: String(form.get("seoDescription") ?? "").trim(),
      content: String(form.get("content") ?? "").trim(),
      status: String(form.get("status") ?? "draft"),
      createdAt: new Date().toISOString(),
    }
    setDrafts((current) => [draft, ...current])
    setPreviewImage("")
    event.currentTarget.reset()
  }

  function remove(id: string) {
    setDrafts((current) => current.filter((draft) => draft.id !== id))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="dashboard-hero rounded-2xl p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="cyber-chip">Content Studio</span>
            <h2 className="text-gradient mt-4 text-3xl font-semibold">Blog Admin Studio</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Create SEO-ready Web3 security articles with cover images, categories, tags and live preview.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3"><p className="text-2xl font-semibold text-primary">{stats.total}</p><p className="text-xs text-muted-foreground">Total</p></div>
            <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3"><p className="text-2xl font-semibold text-primary">{stats.drafts}</p><p className="text-xs text-muted-foreground">Draft</p></div>
            <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3"><p className="text-2xl font-semibold text-primary">{stats.published}</p><p className="text-xs text-muted-foreground">Ready</p></div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PencilLine className="text-primary" /> New article</CardTitle>
            <CardDescription>Save a complete draft. Public publishing will be connected to database storage next.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={add} className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Input name="title" placeholder="Post title" onChange={(event) => setPreviewTitle(event.target.value || "Untitled Web3 security article")} />
                <Input name="slug" placeholder="custom-slug optional" />
                <Input name="category" placeholder="Category, e.g. Airdrop Security" onChange={(event) => setPreviewCategory(event.target.value || "Airdrop Security")} />
                <Input name="tags" placeholder="Tags: Sybil, Airdrop, Wallet Risk" />
              </div>

              <Textarea name="excerpt" placeholder="Short excerpt" rows={3} onChange={(event) => setPreviewExcerpt(event.target.value || "Write a short summary that makes teams want to read the article.")} />

              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Input name="coverImageUrl" placeholder="Cover image URL optional" onChange={(event) => setPreviewImage(event.target.value)} />
                <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 text-sm hover:bg-primary/5">
                  <ImagePlus className="size-4 text-primary" /> Upload image
                  <input type="file" accept="image/*" className="sr-only" onChange={onImageChange} />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Input name="seoTitle" placeholder="SEO title" />
                <Input name="seoDescription" placeholder="SEO description" />
              </div>

              <Textarea name="content" placeholder={"Article body / Markdown notes\n\n## Problem\nExplain the campaign risk..."} rows={10} />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <select name="status" className="h-9 rounded-lg border border-input bg-background px-3 text-sm">
                  <option value="draft">Draft</option>
                  <option value="ready">Ready for review</option>
                  <option value="published">Published queue</option>
                </select>
                <Button type="submit">Save Article Draft</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Eye className="text-primary" /> Live preview</CardTitle>
            <CardDescription>How the card will feel on the public blog page.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-2xl border border-border bg-background/60">
              <div className="flex h-52 items-center justify-center bg-primary/10">
                {previewImage ? <img src={previewImage} alt="Cover preview" className="h-full w-full object-cover" /> : <div className="text-center text-sm text-muted-foreground"><ImagePlus className="mx-auto mb-2 text-primary" /> Cover image preview</div>}
              </div>
              <div className="p-5">
                <span className="cyber-chip">{previewCategory}</span>
                <h3 className="mt-4 text-2xl font-semibold">{previewTitle}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{previewExcerpt}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle>Content queue</CardTitle>
          <CardDescription>Drafts are saved in this browser for the MVP admin workflow.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {drafts.length === 0 && <p className="text-sm text-muted-foreground">No drafts yet.</p>}
          {drafts.map((draft) => (
            <div key={draft.id} className="overflow-hidden rounded-xl border border-border bg-background/50">
              <div className="flex h-36 items-center justify-center bg-primary/10">
                {draft.coverImageUrl ? <img src={draft.coverImageUrl} alt="Cover" className="h-full w-full object-cover" /> : <ImagePlus className="text-primary" />}
              </div>
              <div className="p-4">
                <div className="mb-2 flex items-center justify-between gap-2"><span className="cyber-chip">{draft.category || "Blog"}</span><button onClick={() => remove(draft.id)} className="text-muted-foreground hover:text-red-300"><Trash2 className="size-4" /></button></div>
                <p className="font-medium">{draft.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">/{draft.slug} • {draft.status}</p>
                {draft.excerpt && <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{draft.excerpt}</p>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
