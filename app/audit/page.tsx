import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, BookOpen, ShieldCheck } from "lucide-react"

import { MiniRiskAudit } from "@/components/audit/mini-risk-audit"
import { buttonVariants } from "@/components/ui/button"

export const metadata = {
  title: "Free Mini Wallet Risk Audit | Tri-Proof Guard",
  description:
    "Paste a Web3 campaign wallet list and get a browser-only mini risk audit before running full Tri-Proof Guard analysis.",
}

export default function AuditPage() {
  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link href="/" className="group flex items-center gap-3">
          <span className="glow-primary flex size-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 transition-transform group-hover:scale-105">
            <Image src="/logo.svg" alt="Tri-Proof Guard" width={30} height={30} priority className="rounded-lg" />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Tri-Proof Guard</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary/80">Mini Audit</span>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft data-icon="inline-start" />
            Home
          </Link>
          <Link href="/docs" className={`${buttonVariants({ variant: "outline" })} hidden sm:inline-flex`}>
            <BookOpen data-icon="inline-start" />
            Docs
          </Link>
        </div>
      </header>

      <section className="security-grid border-y border-border">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
          <MiniRiskAudit />
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-sm text-muted-foreground sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-primary" />
          <span>Mini audit is a browser-side preview. Full Guard analysis adds on-chain enrichment and exportable decision evidence.</span>
        </div>
        <Link href="/dashboard/new-analysis" className="text-primary hover:underline">
          Run full analysis
        </Link>
      </footer>
    </main>
  )
}
