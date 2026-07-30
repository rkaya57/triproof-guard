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
          <span className="hidden text-sm font-semibold sm:inline">Tri-Proof Guard</span>
        </Link>
        <nav className="hidden items-center gap-5 text-sm text-muted-foreground md:flex">
          <Link href="/#product" className="hover:text-primary">Product</Link>
          <Link href="/scamguard" className="hover:text-primary">ScamGuard</Link>
          <Link href="/threat-reports" className="hover:text-primary">Threat Reports</Link>
          <Link href="/learn" className="hover:text-primary">Learn</Link>
          <Link href="/docs" className="hover:text-primary">Docs</Link>
          <Link href="/pricing" className="hover:text-primary">Pricing</Link>
        </nav>
        <Link href="/scamguard" className={`${buttonVariants({ size: "sm" })} glow-primary shrink-0`}>Open Scanner</Link>
      </div>
    </header>
  )
}
