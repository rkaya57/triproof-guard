import { DatabaseZap, FileUp, ShieldCheck, Sparkles } from "lucide-react"

import { NewAnalysisForm } from "@/components/dashboard/new-analysis-form"
import { Badge } from "@/components/ui/badge"

const workflowSteps = [
  {
    icon: FileUp,
    label: "Upload",
    detail: "Add your campaign wallet CSV",
    active: true,
  },
  {
    icon: DatabaseZap,
    label: "Enrich",
    detail: "Fetch real on-chain evidence",
    active: false,
  },
  {
    icon: ShieldCheck,
    label: "Decide",
    detail: "Review policy-aware outcomes",
    active: false,
  },
]

export default function Page() {
  return (
    <div className="grid gap-6">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-cyan-300/14 bg-[linear-gradient(120deg,rgba(8,47,73,.38),rgba(8,15,31,.9)_50%,rgba(54,32,96,.22))] p-6 shadow-[0_24px_70px_rgba(0,0,0,.18)] sm:p-7 lg:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full border border-violet-300/10 bg-violet-400/[0.055] blur-sm" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 size-72 rounded-full bg-cyan-400/[0.035] blur-3xl" />

        <div className="relative z-10 grid gap-7 xl:grid-cols-[minmax(0,1fr)_520px] xl:items-end">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-cyan-300/18 bg-cyan-300/[0.05] text-cyan-100">
                <Sparkles className="mr-1 size-3" /> Evidence-first analysis
              </Badge>
              <Badge variant="outline" className="border-emerald-300/16 bg-emerald-300/[0.035] text-emerald-200">
                <span className="mr-1.5 size-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,.55)]" />
                Live production
              </Badge>
            </div>
            <h2 className="max-w-3xl text-2xl font-semibold tracking-[-0.035em] text-white sm:text-3xl lg:text-[2.35rem]">
              Build a defensible wallet decision set
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400 sm:text-[15px]">
              Configure the campaign, upload the wallet list, and let Tri-Proof enrich the dataset with real on-chain evidence before producing review-ready decisions.
            </p>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            {workflowSteps.map(({ icon: Icon, label, detail, active }, index) => (
              <div
                key={label}
                className={`relative rounded-2xl border px-4 py-4 transition ${
                  active
                    ? "border-cyan-300/24 bg-cyan-300/[0.065] shadow-[inset_0_1px_0_rgba(255,255,255,.035),0_14px_30px_rgba(8,145,178,.07)]"
                    : "border-white/[0.065] bg-white/[0.022]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`flex size-9 items-center justify-center rounded-xl border ${active ? "border-cyan-300/20 bg-cyan-300/[0.07]" : "border-white/[0.07] bg-black/10"}`}>
                    <Icon className={`size-4 ${active ? "text-cyan-200" : "text-slate-400"}`} />
                  </span>
                  <span className={`font-mono text-[10px] ${active ? "text-cyan-200/80" : "text-slate-600"}`}>0{index + 1}</span>
                </div>
                <p className={`mt-3 text-sm font-semibold ${active ? "text-white" : "text-slate-300"}`}>{label}</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <NewAnalysisForm />
    </div>
  )
}
