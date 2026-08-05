import Image from "next/image"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"

export function PublicTopNav() {
  return (
    <header className="border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link href="/" className="group flex shrink-0 items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 transition-transform group-hover:scale-105">
            <Image src="/logo.svg" alt="Tri-Proof Protocol" width={24} height={24} className="rounded-md" />
          </span>
          <span className="hidden flex-col sm:flex">
            <span className="text-sm font-semibold">Tri-Proof Protocol</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary/80">Guard Platform</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-5 text-sm text-muted-foreground lg:flex">
          <Link href="/#solutions" className="hover:text-primary">Solutions</Link>
          <Link href="/scamguard" className="hover:text-primary">ScamGuard</Link>
          <Link href="/audit" className="hover:text-primary">Sybil Analyst</Link>
          <Link href="/telegram" className="hover:text-primary">Group Guardian</Link>
          <Link href="/case-studies/public-demo" className="hover:text-primary">Proof</Link>
          <Link href="/pricing" className="hover:text-primary">Pricing</Link>
          <Link href="/docs" className="hover:text-primary">Docs</Link>
        </nav>
        <Link href="/scamguard" className={`${buttonVariants({ size: "sm" })} glow-primary shrink-0`}>Sign in to scan</Link>
      </div>
    </header>
  )
}
