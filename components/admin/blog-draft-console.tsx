"use client"

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react"
import { Edit3, Eye, ImagePlus, PencilLine, Trash2, X } from "lucide-react"

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

export function BlogDraftConsole() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem(key)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as Partial<Draft>[]
      setDrafts(parsed.map(normalizeDraft))
    } catch {
      setDrafts([])
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(drafts))
  }, [drafts])

  const stats = useMemo(() => {
    const published = drafts.filter((draft) => draft.status === "published").length
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = form.title.trim()
    if (!title) return

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

    setDrafts((current) =>
      editingId
        ? current.map((draft) => (draft.id === editingId ? nextDraft : draft))
        : [nextDraft, ...current]
    )
    resetEditor()
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

  function remove(id: string) {
    const approved = window.confirm("Bu blog taslağını silmek istiyor musun?")
    if (!approved) return
    setDrafts((current) => current.filter((draft) => draft.id !== id))
    if (editingId === id) resetEditor()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="dashboard-hero rounded-2xl p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="cyber-chip">Content Studio</span>
            <h2 className="text-gradient mt-4 text-3xl font-semibold">Blog Admin Studio</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Create, edit and delete SEO-ready Web3 security articles with cover images, categories, tags and live preview.
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
            <CardTitle className="flex items-center gap-2">
              <PencilLine className="text-primary" /> {editingId ? "Edit article" : "New article"}
            </CardTitle>
            <CardDescription>
              {editingId ? "Update the selected draft without creating a duplicate." : "Save a complete draft. Public publishing will be connected to database storage next."}
            </CardDescription>
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
                  <option value="draft">Draft</option>
                  <option value="ready">Ready for review</option>
                  <option value="published">Published queue</option>
                </select>
                <div className="flex gap-2">
                  {editingId && <Button type="button" variant="outline" onClick={resetEditor}><X data-icon="inline-start" />Cancel edit</Button>}
                  <Button type="submit">{editingId ? "Update Article" : "Save Article Draft"}</Button>
                </div>
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
          <CardDescription>Use Edit to revise old posts, or Delete to remove drafts from the queue.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {drafts.length === 0 && <p className="text-sm text-muted-foreground">No drafts yet.</p>}
          {drafts.map((draft) => (
            <div key={draft.id} className={`overflow-hidden rounded-xl border bg-background/50 ${editingId === draft.id ? "border-primary" : "border-border"}`}>
              <div className="flex h-36 items-center justify-center bg-primary/10">
                {draft.coverImageUrl ? <img src={draft.coverImageUrl} alt="Cover" className="h-full w-full object-cover" /> : <ImagePlus className="text-primary" />}
              </div>
              <div className="p-4">
                <div className="mb-2 flex items-center justify-between gap-2"><span className="cyber-chip">{draft.category || "Blog"}</span><span className="text-xs text-muted-foreground">{draft.status}</span></div>
                <p className="font-medium">{draft.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">/{draft.slug}</p>
                {draft.excerpt && <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{draft.excerpt}</p>}
                <div className="mt-4 flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => edit(draft)}><Edit3 data-icon="inline-start" />Edit</Button>
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
