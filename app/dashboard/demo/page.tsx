import { BarChart3, Eye, ShieldCheck, Sparkles } from "lucide-react"

import { AnalysisDetail } from "@/components/analysis/analysis-detail"
import { Badge } from "@/components/ui/badge"
import { getDemoAnalysis } from "@/lib/demo-data"

export default function Page() {
  return (
    <div className="grid gap-5">
      <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-[linear-gradient(120deg,rgba(8,47,73,.36),rgba(15,23,42,.88)_58%,rgba(91,33,182,.13))] p-6 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full border border-cyan-300/10 bg-cyan-400/[0.04]" />
        <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <Badge variant="outline" className="mb-3 border-cyan-400/25 bg-cyan-400/[0.05] text-cyan-200"><BarChart3 className="mr-1 size-3" /> Guided product demo</Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Explore a complete Tri-Proof decision report</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Review the same wallet decisions, risk evidence, cluster intelligence and export surfaces used in a live campaign without changing production data.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-300">
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2"><Eye className="size-3.5 text-cyan-300" /> Read-only sample</span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2"><ShieldCheck className="size-3.5 text-emerald-300" /> Safe demo data</span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2"><Sparkles className="size-3.5 text-violet-300" /> Full workflow</span>
          </div>
        </div>
      </section>
      <AnalysisDetail initialAnalysis={getDemoAnalysis()} exportBasePath="/api/demo/export" />
    </div>
  )
}
