import Image from "next/image"
import Link from "next/link"
import { Menu } from "lucide-react"

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
      <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link href="/" className="group flex shrink-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
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
          <Link href="/login" className={`${buttonVariants({ variant: "outline", size: "sm" })} hidden md:inline-flex`}>
            Login
          </Link>
          <Link href="/audit" className={`${buttonVariants({ size: "sm" })} glow-primary hidden sm:inline-flex`}>
            Analyze wallets
          </Link>

          <details className="group relative xl:hidden">
            <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-slate-300 transition hover:border-cyan-300/18 hover:bg-cyan-300/[0.035] hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
              <Menu className="size-4" aria-hidden />
              <span className="sr-only">Open navigation</span>
            </summary>
            <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#07101d]/98 p-3 shadow-[0_24px_70px_rgba(0,0,0,.45)] backdrop-blur-2xl">
              <nav className="grid gap-1" aria-label="Mobile navigation">
                {navLinks.map(([label, href]) => (
                  <Link key={href} href={href} className="rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-cyan-300/[0.045] hover:text-cyan-100">
                    {label}
                  </Link>
                ))}
              </nav>
              <div className="mt-3 grid gap-2 border-t border-white/[0.07] pt-3 sm:grid-cols-2">
                <Link href="/login" className={buttonVariants({ variant: "outline", size: "sm" })}>Login</Link>
                <Link href="/audit" className={buttonVariants({ size: "sm" })}>Analyze wallets</Link>
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>
  )
}
