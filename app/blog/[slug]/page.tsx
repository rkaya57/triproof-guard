import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Home } from "lucide-react"

import { getPostBySlugFromDb } from "@/lib/blog/db"
import { BlogEngagement } from "@/components/blog/blog-engagement"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"

export const dynamic = "force-dynamic"

function readingTime(content: string) {
  const words = content.split(/\s+/).filter(Boolean).length
  return `${Math.max(1, Math.ceil(words / 220))} min read`
}

function renderContent(content: string) {
  return content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlugFromDb(slug).catch(() => null)
  if (!post) return {}
  return {
    title: post.seoTitle || `${post.title} | Tri-Proof Guard`,
    description: post.seoDescription || post.excerpt || undefined,
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlugFromDb(slug).catch(() => null)
  if (!post) notFound()

  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.svg" alt="Tri-Proof Guard" width={36} height={36} className="rounded-lg" />
          <span className="text-sm font-semibold">Tri-Proof Guard</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            <Home data-icon="inline-start" /> Home
          </Link>
          <Link href="/blog" className={buttonVariants({ variant: "outline" })}>Blog</Link>
        </div>
      </header>

      <article className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
            <ArrowLeft className="size-4" /> Back to blog
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
            Home page
          </Link>
        </div>

        <div className="glass-panel overflow-hidden rounded-3xl">
          {post.coverImageUrl && (
            <div className="h-72 border-b border-border bg-primary/10 sm:h-96">
              <img src={post.coverImageUrl} alt={post.title} className="h-full w-full object-cover" />
            </div>
          )}
          <div className="p-8 sm:p-10">
            <div className="mb-5 flex flex-wrap gap-2">
              <Badge variant="secondary" className="border-primary/30 text-primary">{post.category ?? "Web3 Security"}</Badge>
              <Badge variant="outline">{readingTime(post.content)}</Badge>
            </div>
            <h1 className="text-gradient max-w-4xl text-4xl font-semibold sm:text-6xl">{post.title}</h1>
            {post.excerpt && <p className="mt-5 max-w-3xl text-lg text-muted-foreground">{post.excerpt}</p>}
            <div className="mt-8 flex flex-wrap gap-2">
              {(post.tags ?? []).map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
            </div>
          </div>
        </div>

        <div className="mt-10 max-w-none">
          {renderContent(post.content).map((block) => {
            if (block.startsWith("### ")) return <h3 key={block} className="mb-4 mt-8 text-2xl font-semibold">{block.replace(/^### /, "")}</h3>
            if (block.startsWith("## ")) return <h2 key={block} className="text-gradient mb-5 mt-10 text-3xl font-semibold">{block.replace(/^## /, "")}</h2>
            if (block.startsWith("# ")) return null
            return <p key={block} className="mb-5 text-lg leading-8 text-muted-foreground">{block}</p>
          })}
        </div>

        <BlogEngagement slug={post.slug} title={post.title} />

        <div className="mt-12 rounded-2xl border border-primary/25 bg-primary/5 p-6">
          <h2 className="text-2xl font-semibold">Need to review a wallet list?</h2>
          <p className="mt-2 text-muted-foreground">Run the first 100 wallets free and see clean, review and rejected wallet outputs.</p>
          <Link href="/dashboard/new-analysis" className={`${buttonVariants()} mt-5`}>Start free analysis</Link>
        </div>
      </article>
    </main>
  )
}
