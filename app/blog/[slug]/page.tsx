import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { BlogEngagement } from "@/components/blog/blog-engagement"
import { BlogMarkdown } from "@/components/blog/blog-markdown"
import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { getPostBySlugFromDb } from "@/lib/blog/db"

export const dynamic = "force-dynamic"

function readingTime(content: string) {
  const words = content.split(/\s+/).filter(Boolean).length
  return `${Math.max(1, Math.ceil(words / 220))} min read`
}

function coverImageStyle(url: string) {
  return { backgroundImage: `url("${url.replace(/"/g, "%22")}")` }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlugFromDb(slug).catch(() => null)
  if (!post) return {}
  return {
    title: post.seoTitle || `${post.title} | Tri-Proof Protocol`,
    description: post.seoDescription || post.excerpt || undefined,
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlugFromDb(slug).catch(() => null)
  if (!post) notFound()

  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />

      <article className="mx-auto max-w-5xl px-5 py-10 sm:px-8 lg:py-14">
        <Link href="/blog" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Back to blog
        </Link>

        <div className="glass-panel overflow-hidden rounded-3xl">
          {post.coverImageUrl && (
            <div className="h-72 border-b border-border bg-primary/10 sm:h-96">
              <div
                role="img"
                aria-label={post.title}
                className="h-full w-full bg-cover bg-center"
                style={coverImageStyle(post.coverImageUrl)}
              />
            </div>
          )}
          <div className="p-7 sm:p-10">
            <div className="mb-5 flex flex-wrap gap-2">
              <Badge variant="secondary" className="border-primary/30 text-primary">{post.category ?? "Web3 Security"}</Badge>
              <Badge variant="outline">{readingTime(post.content)}</Badge>
            </div>
            <h1 className="text-gradient max-w-4xl text-4xl font-semibold tracking-[-0.035em] sm:text-6xl">{post.title}</h1>
            {post.excerpt && <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{post.excerpt}</p>}
            {(post.tags ?? []).length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2">
                {(post.tags ?? []).map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
              </div>
            )}
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-4xl">
          <BlogMarkdown content={post.content} />
        </div>

        <BlogEngagement slug={post.slug} title={post.title} />

        <div className="mt-12 rounded-3xl border border-primary/20 bg-primary/[0.035] p-6 sm:p-7">
          <h2 className="text-2xl font-semibold">Need to review a wallet list?</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">Run an account-backed preview and inspect clear, review, and rejected/not-eligible wallet outcomes before starting a full campaign analysis.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/audit" className={buttonVariants()}>Start mini audit</Link>
            <Link href="/demo/report" className={buttonVariants({ variant: "outline" })}>View sample report</Link>
          </div>
        </div>
      </article>
    </main>
  )
}
