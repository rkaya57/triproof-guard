import { DatabaseZap, FileUp, ShieldCheck, Sparkles } from "lucide-react"

import { NewAnalysisForm } from "@/components/dashboard/new-analysis-form"
import { Badge } from "@/components/ui/badge"

export default function Page() {
  return (
    <div className="grid gap-5">
      <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-[linear-gradient(120deg,rgba(8,47,73,.42),rgba(15,23,42,.78)_55%,rgba(76,29,149,.14))] p-6 sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-20 size-56 rounded-full border border-cyan-400/10 bg-cyan-400/[0.04]" />
        <div className="relative z-10 grid gap-5 xl:grid-cols-[1fr_auto] xl:items-end">
          <div>
            <Badge variant="outline" className="mb-3 border-cyan-400/25 bg-cyan-400/[0.05] text-cyan-200"><Sparkles className="mr-1 size-3" /> Evidence-first analysis</Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Launch a wallet intelligence run</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Upload your campaign wallet list, select the chain and risk policy, then let Tri-Proof enrich the dataset with real on-chain evidence before producing review-ready decisions.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {[[FileUp, "Upload"], [DatabaseZap, "Enrich"], [ShieldCheck, "Decide"]].map(([Icon, label]) => (
              <div key={label as string} className="min-w-24 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3 text-slate-300"><Icon className="mx-auto mb-1.5 size-4 text-cyan-300" /><span>{label as string}</span></div>
            ))}
          </div>
        </div>
      </section>
      <NewAnalysisForm />
    </div>
  )
}
