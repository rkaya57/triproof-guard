"use client"

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react"
import { Edit3, Eye, ImagePlus, Loader2, PencilLine, Trash2, X } from "lucide-react"

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
  updatedAt?: string
}

type FormState = Omit<Draft, "id" | "createdAt" | "updatedAt">

const key = "tri-proof-blog-drafts"

const emptyForm: FormState = {
  title: "",
  slug: "",
  excerpt: "",
  category: "Airdrop Security",
  tags: "",
  coverImageUrl: "",
  seoTitle: "",
  seoDescription: "",
  content: "",
  status: "draft",
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function normalizeDraft(value: Partial<Draft>, index: number): Draft {
  return {
    id: value.id ?? `POST-${index + 1}`,
    title: value.title ?? "Untitled",
    slug: value.slug ?? slugify(value.title ?? "untitled"),
    excerpt: value.excerpt ?? "",
    category: value.category ?? "Airdrop Security",
    tags: value.tags ?? "",
    coverImageUrl: value.coverImageUrl ?? "",
    seoTitle: value.seoTitle ?? "",
    seoDescription: value.seoDescription ?? "",
    content: value.content ?? "",
    status: value.status ?? "draft",
    createdAt: value.createdAt ?? new Date().toISOString(),
    updatedAt: value.updatedAt,
  }
}

function readImage(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.readAsDataURL(file)
  })
}

function toPayload(draft: Draft | FormState, id?: string) {
  return {
    id,
    title: draft.title,
    slug: draft.slug || slugify(draft.title),
    excerpt: draft.excerpt,
    category: draft.category,
    tags: draft.tags,
    coverImageUrl: draft.coverImageUrl,
    seoTitle: draft.seoTitle,
    seoDescription: draft.seoDescription,
    content: draft.content,
    status: draft.status,
  }
}

function coverImageStyle(url: string) {
  return { backgroundImage: `url("${url.replace(/"/g, "%22")}")` }
}

export function BlogDraftConsole() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError("")
      try {
        const response = await fetch("/api/admin/blog", { cache: "no-store" })
        const body = (await response.json().catch(() => ({}))) as { posts?: Partial<Draft>[]; error?: string }
        if (!response.ok) throw new Error(body.error ?? "Blog posts could not be loaded")
        const dbPosts = (body.posts ?? []).map(normalizeDraft)
        const raw = localStorage.getItem(key)
        const localPosts = raw ? (JSON.parse(raw) as Partial<Draft>[]).map(normalizeDraft) : []
        const merged = [...dbPosts]
        for (const local of localPosts) {
          if (!merged.some((post) => post.id === local.id || post.slug === local.slug)) merged.push(local)
        }
        setDrafts(merged)
      } catch (loadError) {
        const raw = localStorage.getItem(key)
        if (raw) setDrafts((JSON.parse(raw) as Partial<Draft>[]).map(normalizeDraft))
        setError(loadError instanceof Error ? loadError.message : "Blog posts could not be loaded")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(drafts))
  }, [drafts])

  const stats = useMemo(() => {
    const published = drafts.filter((draft) => draft.status === "published" || draft.status === "ready").length
    return { total: drafts.length, published, drafts: drafts.length - published }
  }, [drafts])

  const previewTitle = form.title || "Untitled Web3 security article"
  const previewExcerpt = form.excerpt || "Write a short summary that makes teams want to read the article."
  const previewCategory = form.category || "Airdrop Security"
  const previewImage = form.coverImageUrl

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function onImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setField("coverImageUrl", await readImage(file))
  }

  function resetEditor() {
    setEditingId(null)
    setForm(emptyForm)
  }

  async function saveToSite(draft: Draft) {
    const response = await fetch("/api/admin/blog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(draft, draft.id)),
    })
    const body = (await response.json().catch(() => ({}))) as { post?: Partial<Draft>; error?: string }
    if (!response.ok) throw new Error(body.error ?? "Post could not be saved")
    return normalizeDraft(body.post ?? draft, 0)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = form.title.trim()
    if (!title) return

    setSaving(true)
    setMessage("")
    setError("")

    const now = new Date().toISOString()
    const nextDraft: Draft = {
      id: editingId ?? `POST-${Date.now()}`,
      title,
      slug: form.slug.trim() || slugify(title),
      excerpt: form.excerpt.trim(),
      category: form.category.trim() || "Airdrop Security",
      tags: form.tags.trim(),
      coverImageUrl: form.coverImageUrl.trim(),
      seoTitle: form.seoTitle.trim(),
      seoDescription: form.seoDescription.trim(),
      content: form.content.trim(),
      status: form.status,
      createdAt: drafts.find((draft) => draft.id === editingId)?.createdAt ?? now,
      updatedAt: editingId ? now : undefined,
    }

    try {
      const saved = await saveToSite(nextDraft)
      setDrafts((current) =>
        editingId
          ? current.map((draft) => (draft.id === editingId ? saved : draft))
          : [saved, ...current]
      )
      setMessage(saved.status === "draft" ? "Draft saved. Change status to Ready or Published to show it on /blog." : "Article saved and visible on /blog.")
      resetEditor()
    } catch (saveError) {
      setDrafts((current) =>
        editingId
          ? current.map((draft) => (draft.id === editingId ? nextDraft : draft))
          : [nextDraft, ...current]
      )
      setError(saveError instanceof Error ? saveError.message : "Post could not be saved to the public blog")
    } finally {
      setSaving(false)
    }
  }

  function edit(draft: Draft) {
    setEditingId(draft.id)
    setForm({
      title: draft.title,
      slug: draft.slug,
      excerpt: draft.excerpt,
      category: draft.category,
      tags: draft.tags,
      coverImageUrl: draft.coverImageUrl,
      seoTitle: draft.seoTitle,
      seoDescription: draft.seoDescription,
      content: draft.content,
      status: draft.status,
    })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function publish(draft: Draft) {
    setSaving(true)
    setMessage("")
    setError("")
    try {
      const saved = await saveToSite({ ...draft, status: "published" })
      setDrafts((current) => current.map((item) => (item.id === draft.id ? saved : item)))
      setMessage("Article published and visible on /blog.")
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Article could not be published")
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    const approved = window.confirm("Bu blog yazısını silmek istiyor musun?")
    if (!approved) return
    setSaving(true)
    setMessage("")
    setError("")
    try {
      await fetch(`/api/admin/blog/${encodeURIComponent(id)}`, { method: "DELETE" })
      setDrafts((current) => current.filter((draft) => draft.id !== id))
      if (editingId === id) resetEditor()
      setMessage("Article deleted.")
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Article could not be deleted")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="dashboard-hero rounded-2xl p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="cyber-chip">Content Studio</span>
            <h2 className="text-gradient mt-4 text-3xl font-semibold">Blog Admin Studio</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Create, publish, edit and delete public Web3 security articles. Ready and Published posts appear on /blog.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3"><p className="text-2xl font-semibold text-primary">{stats.total}</p><p className="text-xs text-muted-foreground">Total</p></div>
            <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3"><p className="text-2xl font-semibold text-primary">{stats.drafts}</p><p className="text-xs text-muted-foreground">Draft</p></div>
            <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3"><p className="text-2xl font-semibold text-primary">{stats.published}</p><p className="text-xs text-muted-foreground">Public</p></div>
          </div>
        </div>
      </div>

      {(message || error) && (
        <div className={`rounded-xl border p-4 text-sm ${error ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-primary/30 bg-primary/10 text-primary"}`}>
          {error || message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PencilLine className="text-primary" /> {editingId ? "Edit article" : "New article"}</CardTitle>
            <CardDescription>{editingId ? "Update the selected post without creating a duplicate." : "Save as Draft or set status to Published to show it on the public blog."}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={form.title} placeholder="Post title" onChange={(event) => setField("title", event.target.value)} />
                <Input value={form.slug} placeholder="custom-slug optional" onChange={(event) => setField("slug", event.target.value)} />
                <Input value={form.category} placeholder="Category, e.g. Airdrop Security" onChange={(event) => setField("category", event.target.value)} />
                <Input value={form.tags} placeholder="Tags: Sybil, Airdrop, Wallet Risk" onChange={(event) => setField("tags", event.target.value)} />
              </div>
              <Textarea value={form.excerpt} placeholder="Short excerpt" rows={3} onChange={(event) => setField("excerpt", event.target.value)} />
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Input value={form.coverImageUrl} placeholder="Cover image URL optional" onChange={(event) => setField("coverImageUrl", event.target.value)} />
                <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 text-sm hover:bg-primary/5">
                  <ImagePlus className="size-4 text-primary" /> Upload image
                  <input type="file" accept="image/*" className="sr-only" onChange={onImageChange} />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={form.seoTitle} placeholder="SEO title" onChange={(event) => setField("seoTitle", event.target.value)} />
                <Input value={form.seoDescription} placeholder="SEO description" onChange={(event) => setField("seoDescription", event.target.value)} />
              </div>
              <Textarea value={form.content} placeholder={"Article body / Markdown notes\n\n## Problem\nExplain the campaign risk..."} rows={10} onChange={(event) => setField("content", event.target.value)} />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <select value={form.status} onChange={(event) => setField("status", event.target.value)} className="h-9 rounded-lg border border-input bg-background px-3 text-sm">
                  <option value="draft">Draft - not public</option>
                  <option value="ready">Ready - public</option>
                  <option value="published">Published - public</option>
                </select>
                <div className="flex gap-2">
                  {editingId && <Button type="button" variant="outline" onClick={resetEditor}><X data-icon="inline-start" />Cancel edit</Button>}
                  <Button type="submit" disabled={saving}>{saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}{editingId ? "Update Article" : "Save Article"}</Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card overflow-hidden">
          <CardHeader><CardTitle className="flex items-center gap-2"><Eye className="text-primary" /> Live preview</CardTitle><CardDescription>How the card will look on /blog.</CardDescription></CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-2xl border border-border bg-background/60">
              <div className="flex h-52 items-center justify-center bg-primary/10">
                {previewImage ? (
                  <div
                    role="img"
                    aria-label="Cover preview"
                    className="h-full w-full bg-cover bg-center"
                    style={coverImageStyle(previewImage)}
                  />
                ) : (
                  <div className="text-center text-sm text-muted-foreground"><ImagePlus className="mx-auto mb-2 text-primary" /> Cover image preview</div>
                )}
              </div>
              <div className="p-5"><span className="cyber-chip">{form.status === "draft" ? "Draft" : previewCategory}</span><h3 className="mt-4 text-2xl font-semibold">{previewTitle}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{previewExcerpt}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel premium-card">
        <CardHeader><CardTitle>Content queue</CardTitle><CardDescription>Public posts are status Ready or Published. Drafts stay hidden.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loading && <p className="text-sm text-muted-foreground">Loading posts…</p>}
          {!loading && drafts.length === 0 && <p className="text-sm text-muted-foreground">No posts yet.</p>}
          {drafts.map((draft) => (
            <div key={draft.id} className={`overflow-hidden rounded-xl border bg-background/50 ${editingId === draft.id ? "border-primary" : "border-border"}`}>
              <div className="flex h-36 items-center justify-center bg-primary/10">
                {draft.coverImageUrl ? (
                  <div
                    role="img"
                    aria-label="Cover"
                    className="h-full w-full bg-cover bg-center"
                    style={coverImageStyle(draft.coverImageUrl)}
                  />
                ) : (
                  <ImagePlus className="text-primary" />
                )}
              </div>
              <div className="p-4">
                <div className="mb-2 flex items-center justify-between gap-2"><span className="cyber-chip">{draft.category || "Blog"}</span><span className={draft.status === "draft" ? "text-xs text-muted-foreground" : "text-xs text-primary"}>{draft.status}</span></div>
                <p className="font-medium">{draft.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">/{draft.slug}</p>
                {draft.excerpt && <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{draft.excerpt}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => edit(draft)}><Edit3 data-icon="inline-start" />Edit</Button>
                  {draft.status === "draft" && <Button type="button" size="sm" onClick={() => publish(draft)}>Publish</Button>}
                  {draft.status !== "draft" && <a href={`/blog/${draft.slug}`} target="_blank" className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-primary/5">View</a>}
                  <Button type="button" variant="outline" size="sm" onClick={() => remove(draft.id)}><Trash2 data-icon="inline-start" />Delete</Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
