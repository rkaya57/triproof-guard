import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowUpRight, Mail, Scale, ShieldCheck } from "lucide-react"

import { PublicTopNav } from "@/components/layout/public-top-nav"
import { Badge } from "@/components/ui/badge"

const legalLinks = [
  ["Legal overview", "/legal"],
  ["Privacy Policy", "/privacy"],
  ["Terms of Service", "/terms"],
  ["Risk Disclosure", "/risk-disclosure"],
  ["Data Retention", "/data-retention"],
  ["API Terms", "/api-terms"],
] as const

type LegalPageLayoutProps = {
  eyebrow: string
  title: string
  summary: string
  updatedAt?: string
  children: ReactNode
}

export function LegalPageLayout({ eyebrow, title, summary, updatedAt, children }: LegalPageLayoutProps) {
  return (
    <main className="min-h-screen bg-background">
      <PublicTopNav />
      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
          <Badge variant="outline" className="border-primary/35 bg-primary/10 font-mono text-[11px] uppercase tracking-[0.15em] text-primary">
            <Scale className="size-3.5" /> {eyebrow}
          </Badge>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-normal sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">{summary}</p>
          {updatedAt ? (
            <p className="mt-5 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">Last updated: {updatedAt}</p>
          ) : null}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:py-14">
        <aside className="h-fit rounded-2xl border border-border bg-card/55 p-4 lg:sticky lg:top-6">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-primary">Trust center</p>
          <nav className="grid gap-1 text-sm">
            {legalLinks.map(([label, href]) => (
              <Link key={href} href={href} className="rounded-xl px-3 py-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <article className="legal-copy min-w-0">{children}</article>
      </section>

      <footer className="border-t border-border bg-muted/20">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> Tri-Proof Protocol trust and legal center.</div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href="/contact" className="hover:text-primary">Contact</Link>
            <a href="mailto:info@triproofprotocol.com?subject=Tri-Proof%20Legal%20Question" className="inline-flex items-center gap-1 hover:text-primary"><Mail className="size-3.5" /> Legal questions</a>
            <Link href="/docs/trust" className="inline-flex items-center gap-1 hover:text-primary">Methodology <ArrowUpRight className="size-3.5" /></Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
