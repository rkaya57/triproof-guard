import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { getPostBySlug, getPublishedPosts } from "@/lib/blog/posts"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"

export function generateStaticParams() {
  return getPublishedPosts().map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return {}
  return { title: `${post.title} | Tri-Proof Guard`, description: post.excerpt }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.svg" alt="Tri-Proof Guard" width={36} height={36} className="rounded-lg" />
          <span className="text-sm font-semibold">Tri-Proof Guard</span>
        </Link>
        <Link href="/blog" className={buttonVariants({ variant: "outline" })}>Blog</Link>
      </header>

      <article className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <Link href="/blog" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="size-4" /> Back to blog
        </Link>
        <div className="glass-panel rounded-3xl p-8 sm:p-10">
          <div className="mb-5 flex flex-wrap gap-2">
            <Badge variant="secondary" className="border-primary/30 text-primary">{post.category}</Badge>
            <Badge variant="outline">{post.readTime}</Badge>
          </div>
          <h1 className="text-gradient max-w-4xl text-4xl font-semibold sm:text-6xl">{post.title}</h1>
          <p className="mt-5 max-w-3xl text-lg text-muted-foreground">{post.excerpt}</p>
          <div className="mt-8 flex flex-wrap gap-2">
            {post.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
          </div>
        </div>

        <div className="prose prose-invert mt-10 max-w-none">
          {post.content.map((paragraph) => (
            <p key={paragraph} className="mb-5 text-lg leading-8 text-muted-foreground">{paragraph}</p>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-primary/25 bg-primary/5 p-6">
          <h2 className="text-2xl font-semibold">Need to review a wallet list?</h2>
          <p className="mt-2 text-muted-foreground">Run the first 100 wallets free and see clean, review and rejected wallet outputs.</p>
          <Link href="/dashboard/new-analysis" className={`${buttonVariants()} mt-5`}>Start free analysis</Link>
        </div>
      </article>
    </main>
  )
}
