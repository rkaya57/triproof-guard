import Link from "next/link"
import { PublicTopNav } from "@/components/layout/public-top-nav"
import { PublicDemoSummary } from "@/components/demo/public-demo-summary"
import { buttonVariants } from "@/components/ui/button"
import { publicDemoSnapshot as demo } from "@/lib/demo/public-snapshot"

export const metadata = { title: "How the Public Demo Works | Tri-Proof Protocol", description: "Inspect the provenance and limits of Tri-Proof's illustrative campaign evidence demo." }

export default function PublicValidationCaseStudyPage() {
  return <main className="premium-page min-h-screen bg-background text-foreground"><PublicTopNav /><div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8">
    <header className="max-w-3xl"><p className="text-xs uppercase tracking-widest text-cyan-200">Product demonstration</p><h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">From sample observations to an explainable decision.</h1><p className="mt-5 leading-7 text-muted-foreground">This walkthrough uses {demo.summary.totalWallets} invented Solana examples processed by the engine version recorded in the snapshot. It demonstrates the product workflow, not customer results or real-world detection accuracy.</p></header>
    <PublicDemoSummary summary={demo.summary} />
    <section className="grid gap-4 md:grid-cols-3">{[
      ["Inspect the evidence", "Follow the stored funding, referral and activity context behind the linked-wallet example."],
      ["Understand uncertainty", "Compare a review case, a missing-data case and an account excluded only for eligibility."],
      ["Keep one report", "The interactive view, CSV, PDF and JSON all use the same versioned snapshot and decision labels."],
    ].map(([title, text]) => <article key={title} className="rounded-2xl border border-white/10 p-6"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{text}</p></article>)}</section>
    <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-6"><h2 className="text-xl font-semibold">What still needs a real pilot?</h2><p className="mt-3 leading-7 text-muted-foreground">Detection accuracy, false exclusions, provider coverage, processing costs and time saved require independently reviewed campaign data. A synthetic demo cannot establish those outcomes.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/demo/report" className={buttonVariants()}>Explore the interactive report</Link><Link href="/contact?topic=pilot-case-study" className={buttonVariants({ variant: "outline" })}>Discuss a measured pilot</Link></div></section>
    <p className="text-xs leading-6 text-muted-foreground">Snapshot {demo.version} · Engine {demo.provenance.engineVersion} · Balanced policy. {demo.provenance.notice}</p>
  </div></main>
}
