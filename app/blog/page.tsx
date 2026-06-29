import Image from "next/image"
import Link from "next/link"
import { ArrowRight, BookOpen, CalendarDays } from "lucide-react"

import { getPublishedPosts } from "@/lib/blog/posts"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = {
  title: "Blog | Tri-Proof Guard",
  description: "Web3 wallet risk, Sybil detection and airdrop security insights from Tri-Proof Guard.",
}

export default function Page() {
  const posts = getPublishedPosts()

  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.svg" alt="Tri-Proof Guard" width={36} height={36} className="rounded-lg" />
          <span className="text-sm font-semibold">Tri-Proof Guard</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className={buttonVariants({ variant: "outline" })}>Pricing</Link>
          <Link href="/dashboard/new-analysis" className={buttonVariants()}>Start Free</Link>
        </div>
      </header>

      <section className="security-grid border-y border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <Badge variant="secondary" className="mb-5 w-fit border-primary/30 text-primary">
            Tri-Proof Insights
          </Badge>
          <h1 className="text-gradient max-w-4xl text-4xl font-semibold sm:text-6xl">
            Web3 wallet risk, Sybil defense and campaign security.
          </h1>
          <p className="mt-5 max-w-2xl text-muted-foreground">
            Practical guides for airdrop teams, testnet operators and Web3 communities that want cleaner reward distribution.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-16 sm:px-8 lg:grid-cols-3">
        {posts.map((post) => (
          <Card key={post.slug} className="glass-panel premium-card hover-lift">
            <CardHeader>
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge variant="secondary" className="border-primary/30 text-primary">{post.category}</Badge>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />{post.readTime}</span>
              </div>
              <CardTitle>{post.title}</CardTitle>
              <CardDescription>{post.excerpt}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={`/blog/${post.slug}`} className={buttonVariants({ variant: "outline" })}>
                Read article <ArrowRight data-icon="inline-end" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <div className="glass-panel rounded-2xl p-8">
          <div className="mb-3 flex items-center gap-2 text-primary"><BookOpen className="size-5" /><span className="font-medium">For campaign teams</span></div>
          <h2 className="text-2xl font-semibold">Ready to check your own wallet list?</h2>
          <p className="mt-2 text-muted-foreground">Start with 100 wallets free, then upgrade with USDC when your campaign list grows.</p>
          <Link href="/dashboard/new-analysis" className={`${buttonVariants()} mt-5`}>Start free analysis</Link>
        </div>
      </section>
    </main>
  )
}
