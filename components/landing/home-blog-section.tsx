import Link from "next/link"
import { ArrowRight, BookOpen } from "lucide-react"

import { listPublishedPosts } from "@/lib/blog/db"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export async function HomeBlogSection() {
  const posts = await listPublishedPosts().catch(() => [])

  return (
    <section className="premium-page bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-gradient text-3xl font-semibold">Tri-Proof Blog</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">Read practical guides about Web3 campaign security and wallet risk.</p>
          </div>
          <Link href="/blog" className={buttonVariants({ variant: "outline" })}>Open Blog</Link>
        </div>

        {posts.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-3">
            {posts.slice(0, 3).map((post) => (
              <Card key={post.slug} className="glass-panel premium-card hover-lift overflow-hidden">
                <div className="flex h-40 items-center justify-center bg-primary/10">
                  {post.coverImageUrl ? <img src={post.coverImageUrl} alt={post.title} className="h-full w-full object-cover" /> : <BookOpen className="text-primary" />}
                </div>
                <CardHeader>
                  <CardTitle>{post.title}</CardTitle>
                  <CardDescription>{post.excerpt}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href={`/blog/${post.slug}`} className={buttonVariants({ variant: "outline" })}>Read <ArrowRight data-icon="inline-end" /></Link>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="glass-panel rounded-2xl p-8">
            <p className="text-muted-foreground">No published articles yet. Publish from the Blog Studio to show posts here.</p>
          </div>
        )}
      </div>
    </section>
  )
}
