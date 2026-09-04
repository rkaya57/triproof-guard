import Image from "next/image"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"

const navLinks = [
  ["Solutions", "/#solutions"],
  ["ScamGuard", "/scamguard"],
  ["Sybil Analyst", "/audit"],
  ["Group Guardian", "/telegram"],
  ["Pricing", "/pricing"],
  ["Docs", "/docs"],
  ["Proof", "/case-studies/public-demo"],
] as const

export function PublicTopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/88 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link href="/" className="group flex shrink-0 items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 transition-transform group-hover:scale-105">
            <Image src="/logo.svg" alt="Tri-Proof Protocol" width={26} height={26} className="rounded-md" />
          </span>
          <span className="hidden flex-col sm:flex">
            <span className="text-sm font-semibold text-foreground">Tri-Proof Protocol</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary/80">Web3 Security Platform</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm text-muted-foreground xl:flex" aria-label="Primary navigation">
          {navLinks.map(([label, href]) => (
            <Link key={href} href={href} className="transition-colors hover:text-primary">
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link href="/login" className={`${buttonVariants({ variant: "outline", size: "sm" })} hidden sm:inline-flex`}>
            Login
          </Link>
          <Link href="/audit" className={`${buttonVariants({ size: "sm" })} glow-primary`}>
            Analyze wallets
          </Link>
        </div>
      </div>
    </header>
  )
}
