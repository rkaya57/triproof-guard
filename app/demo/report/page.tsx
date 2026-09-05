import Link from "next/link"
import { ArrowRight, Download } from "lucide-react"
import { PublicTopNav } from "@/components/layout/public-top-nav"
import { buttonVariants } from "@/components/ui/button"
import { PublicEvidenceDemo } from "@/components/demo/public-evidence-demo"
import { PublicDemoSummary } from "@/components/demo/public-demo-summary"
import { publicDemoSnapshot as demo } from "@/lib/demo/public-snapshot"
import { publicDecisionLabels } from "@/lib/demo/public-types"

export const metadata = {
  title: "Interactive Campaign Evidence Demo | Tri-Proof Protocol",
  description: "Explore illustrative Solana campaign decisions and download the same versioned report without signing in.",
}

export default function SampleReportPage() {
  return <main className="premium-page min-h-screen bg-background text-foreground">
    <PublicTopNav />
    <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 sm:py-16">
      <header className="max-w-3xl">
        <p className="text-xs uppercase tracking-widest text-cyan-200">Interactive demo · Solana · no sign-in</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">See the evidence behind a campaign decision.</h1>
        <p className="mt-5 text-base leading-7 text-slate-400">Explore linked wallets, a reward candidate, an account needing review, missing data and a protocol account. Every example uses the same frozen report.</p>
        <p className="mt-3 text-sm leading-6 text-slate-400">{demo.provenance.notice}</p>
      </header>
      <PublicDemoSummary summary={demo.summary} />
      <PublicEvidenceDemo demo={{ wallets: demo.wallets, summary: demo.summary }} />
      <section aria-label="All sample decisions" className="overflow-hidden rounded-2xl border border-white/10">
        <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left text-sm"><caption className="p-5 text-left text-lg font-semibold text-white">All {demo.summary.totalWallets} sample decisions</caption><thead className="border-y border-white/10 bg-white/[0.03] text-slate-400"><tr>{["Example", "Decision", "Risk assessment", "Cluster"].map((label) => <th key={label} scope="col" className="px-5 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{demo.wallets.map((wallet) => <tr key={wallet.address} className="border-b border-white/5"><th scope="row" className="px-5 py-3 font-medium text-slate-200">{wallet.label}</th><td className="px-5 py-3">{publicDecisionLabels[wallet.decision]}</td><td className="px-5 py-3 text-slate-300">{wallet.riskLabel}</td><td className="px-5 py-3 text-slate-400">{wallet.clusterId ?? "—"}</td></tr>)}</tbody></table></div>
      </section>
      <section className="grid gap-5 rounded-2xl border border-white/10 p-6 md:grid-cols-2">
        <div><h2 className="text-xl font-semibold text-white">Read risk and eligibility separately</h2><p className="mt-3 text-sm leading-7 text-slate-400">Insufficient data means the risk could not be assessed. A protocol account may be ineligible as an individual participant without malicious evidence. A risk finding is evidence to review, not proof of fraud.</p></div>
        <div><h2 className="text-xl font-semibold text-white">Download this exact report</h2><div className="mt-4 flex flex-wrap gap-2">{[["CSV decisions", "csv"], ["PDF report", "pdf"], ["JSON + inputs", "json"]].map(([label, format]) => <a key={format} href={"/api/demo/report/export?format=" + format} className={buttonVariants({ variant: "outline", size: "sm" })}><Download className="size-3.5" /> {label}</a>)}</div><p className="mt-3 text-xs leading-5 text-slate-400">All formats use this snapshot. The CSV is a decision export; the JSON also includes the illustrative input observations.</p></div>
      </section>
      <details className="rounded-xl border border-white/10 p-5 text-sm text-slate-400"><summary className="cursor-pointer font-medium text-slate-200">Report provenance</summary><dl className="mt-4 grid gap-3"><div><dt>Snapshot</dt><dd>{demo.version} · {demo.provenance.asOf.slice(0, 10)}</dd></div><div><dt>Engine / ruleset / policy</dt><dd>{demo.provenance.engineVersion} / {demo.provenance.rulesetVersion} / {demo.provenance.policy}</dd></div><div><dt>Input SHA-256</dt><dd className="break-all font-mono text-xs">{demo.provenance.inputSha256}</dd></div></dl></details>
      <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-6"><h2 className="text-2xl font-semibold text-white">Bring your own campaign.</h2><p className="mt-3 text-sm leading-6 text-slate-400">Sign in to analyze your participant list, review evidence and export your decisions.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/audit" className={buttonVariants()}>Analyze my wallet list <ArrowRight className="size-4" /></Link><Link href="/contact?topic=security-pilot" className={buttonVariants({ variant: "outline" })}>Scope a campaign pilot</Link></div></div>
    </div>
  </main>
}
