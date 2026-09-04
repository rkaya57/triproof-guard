import Link from "next/link"
import { ArrowRight, BookOpen, CalendarDays, ShieldCheck } from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { listPublishedPosts } from "@/lib/blog/db"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Blog | Tri-Proof Protocol",
  description: "Web3 wallet risk, Sybil defense and campaign security insights from Tri-Proof Protocol.",
}

function readingTime(content: string) {
  const words = content.split(/\s+/).filter(Boolean).length
  return `${Math.max(1, Math.ceil(words / 220))} min read`
}

function coverImageStyle(url: string) {
  return { backgroundImage: `url("${url.replace(/"/g, "%22")}")` }
}

export default async function Page() {
  const posts = await listPublishedPosts().catch(() => [])
  const featured = posts[0]
  const rest = posts.slice(1)

  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <PublicTopNav />

      <section className="security-grid relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="glow-orb left-[-8rem] top-[-8rem] size-96" style={{ background: "var(--guard-cyan)" }} />
          <div className="glow-orb right-[-10rem] top-12 size-[28rem]" style={{ background: "var(--guard-purple)" }} />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
          <Badge variant="secondary" className="mb-5 w-fit border-primary/30 text-primary">
            Tri-Proof Insights
          </Badge>
          <h1 className="text-gradient max-w-4xl text-4xl font-semibold tracking-[-0.035em] sm:text-6xl">
            Web3 wallet risk, Sybil defense and campaign security.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            Practical guides for airdrop teams, testnet operators and Web3 communities that want cleaner reward distribution and safer wallet interactions.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        {featured ? (
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
            <Link href={`/blog/${featured.slug}`} className="glass-panel premium-card hover-lift group overflow-hidden rounded-3xl border border-primary/25">
              <div className="flex h-72 items-center justify-center bg-primary/10 lg:h-full">
                {featured.coverImageUrl ? (
                  <div
                    role="img"
                    aria-label={featured.title}
                    className="h-full w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                    style={coverImageStyle(featured.coverImageUrl)}
                  />
                ) : (
                  <div className="text-center text-muted-foreground"><ShieldCheck className="mx-auto mb-3 size-12 text-primary" /> Featured insight</div>
                )}
              </div>
            </Link>
            <div className="glass-panel premium-card rounded-3xl p-8">
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge variant="secondary" className="border-primary/30 text-primary">{featured.category ?? "Web3 Security"}</Badge>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />{readingTime(featured.content)}</span>
              </div>
              <h2 className="text-gradient text-3xl font-semibold sm:text-5xl">{featured.title}</h2>
              <p className="mt-5 text-lg leading-7 text-muted-foreground">{featured.excerpt}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {(featured.tags ?? []).slice(0, 5).map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
              </div>
              <Link href={`/blog/${featured.slug}`} className={`${buttonVariants()} mt-8`}>Read featured article <ArrowRight data-icon="inline-end" /></Link>
            </div>
          </div>
        ) : (
          <Card className="glass-panel premium-card">
            <CardHeader>
              <CardTitle>Research notes are being prepared</CardTitle>
              <CardDescription>
                Public articles focus on campaign security, pre-sign safety, and explainable wallet-list review methodology.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <Link href="/scamguard" className={buttonVariants()}>Open ScamGuard</Link>
              <Link href="/docs" className={buttonVariants({ variant: "outline" })}>Read docs</Link>
            </CardContent>
          </Card>
        )}

        {rest.length > 0 && (
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {rest.map((post) => (
              <Card key={post.slug} className="glass-panel premium-card hover-lift overflow-hidden">
                <div className="flex h-44 items-center justify-center bg-primary/10">
                  {post.coverImageUrl ? (
                    <div
                      role="img"
                      aria-label={post.title}
                      className="h-full w-full bg-cover bg-center"
                      style={coverImageStyle(post.coverImageUrl)}
                    />
                  ) : (
                    <BookOpen className="text-primary" />
                  )}
                </div>
                <CardHeader>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Badge variant="secondary" className="border-primary/30 text-primary">{post.category ?? "Blog"}</Badge>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />{readingTime(post.content)}</span>
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
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <div className="glass-panel premium-card rounded-3xl p-8">
          <div className="mb-3 flex items-center gap-2 text-primary"><BookOpen className="size-5" /><span className="font-medium">For campaign teams</span></div>
          <h2 className="text-2xl font-semibold">Ready to check your own wallet list?</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">Start with the account-backed mini audit, then use wallet-credit packs when your campaign needs a saved, full Sybil analysis and decision export.</p>
          <div className="mt-5 flex flex-wrap gap-3"><Link href="/audit" className={buttonVariants()}>Start mini audit</Link><Link href="/pricing#campaign" className={buttonVariants({ variant: "outline" })}>View wallet pricing</Link></div>
        </div>
      </section>
    </main>
  )
}
