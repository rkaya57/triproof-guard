import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"

export function HomeBlogSection() {
  return (
    <section className="premium-page bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="glass-panel rounded-2xl p-8">
          <h2 className="text-gradient text-3xl font-semibold">Tri-Proof Blog</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">Read practical guides about Web3 campaign security and wallet risk.</p>
          <Link href="/blog" className={`${buttonVariants()} mt-5`}>Open Blog</Link>
        </div>
      </div>
    </section>
  )
}
