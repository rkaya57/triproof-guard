"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowRight, Network, ShieldCheck } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { publicDecisionLabels, type PublicDemoSnapshot } from "@/lib/demo/public-types"

type Demo = Pick<PublicDemoSnapshot, "wallets" | "summary">

export function PublicEvidenceDemo({ demo, compact = false }: { demo: Demo; compact?: boolean }) {
  const [selected, setSelected] = useState(demo.wallets[0].address)
  const wallet = demo.wallets.find((item) => item.address === selected) ?? demo.wallets[0]
  const cases = [
    { title: "Linked wallets", wallet: demo.wallets.find((item) => item.clusterId) },
    { title: "Limited history", wallet: demo.wallets.find((item) => item.decision === "review") },
    { title: "Missing data", wallet: demo.wallets.find((item) => item.decision === "insufficient_data") },
    { title: "Protocol account", wallet: demo.wallets.find((item) => item.riskLabel === "Not applicable") },
    { title: "Reward candidate", wallet: demo.wallets.find((item) => item.decision === "approved") },
  ].filter((item) => item.wallet)
  const related = wallet.clusterId ? demo.wallets.filter((item) => item.clusterId === wallet.clusterId) : [wallet]
  const primaryEvidence = wallet.evidence.filter((item) => item.family !== "other" && item.family !== "policy")
  const visibleEvidence = primaryEvidence.length ? primaryEvidence : wallet.evidence

  return (
    <section aria-label="Interactive campaign evidence demo" className="min-w-0 rounded-3xl border border-cyan-300/20 bg-[#091321] p-5 shadow-[0_20px_80px_rgba(0,0,0,.25)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-white"><Network className="size-4 text-cyan-300" /> Follow the evidence</span>
        <span className="rounded-full border border-cyan-300/20 px-2 py-1 text-[10px] text-cyan-200">Illustrative demo</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-400">Select a case to see why the decision differs.</p>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Example cases">
        {cases.map((item) => <button key={item.title} type="button" aria-pressed={wallet.address === item.wallet!.address} onClick={() => setSelected(item.wallet!.address)} className={`rounded-full border px-3 py-2 text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${wallet.address === item.wallet!.address ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100" : "border-white/10 text-slate-300 hover:border-cyan-300/30"}`}>{item.title}</button>)}
      </div>
      <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4" aria-live="polite" aria-atomic="true">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs text-slate-400">{wallet.label} · {wallet.clusterId ?? "Individual case"}</p><h2 className="mt-1 text-xl font-semibold text-white">{publicDecisionLabels[wallet.decision]}</h2></div>
          <div className="text-right"><p className="text-xs text-slate-400">Risk assessment</p><p className="mt-1 text-sm font-semibold text-cyan-200">{wallet.riskLabel}</p></div>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-300">{wallet.explanation}</p>
        <ul className="mt-4 grid gap-2">
          {visibleEvidence.slice(0, compact ? 2 : 4).map((item, index) => <li key={`${item.code}-${index}`} className="flex gap-2 text-xs leading-5 text-slate-400"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-cyan-300" /><span><strong className="font-medium text-slate-200">{item.title}.</strong> {compact ? item.effect.replaceAll("_", " ") : item.description}</span></li>)}
        </ul>
      </div>
      {!compact && <>
        <div className="mt-5 rounded-2xl border border-white/10 p-4">
          <h3 className="text-sm font-semibold text-white">{wallet.clusterId ? "Stored funding relationship" : "Account context"}</h3>
          <p className="mt-2 break-all font-mono text-xs leading-6 text-slate-400">{wallet.funder ? `Funder: ${wallet.funder}` : "No funding origin in this example."}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {related.map((item) => <button key={item.address} type="button" aria-pressed={item.address === wallet.address} onClick={() => setSelected(item.address)} className={`rounded-xl border p-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-cyan-300 ${item.address === wallet.address ? "border-cyan-300/40 bg-cyan-300/5" : "border-white/10"}`}><span className="text-slate-200">{item.label}</span><span className="mt-1 block text-xs text-slate-400">{item.firstFundingAt ? `Funding: ${item.firstFundingAt.slice(11, 19)} UTC` : "No funding timestamp"}</span></button>)}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-400">A shared funder alone does not establish common control. The decision above includes the other available evidence.</p>
        </div>
        <details className="mt-4 rounded-xl border border-white/10 p-4"><summary className="cursor-pointer text-sm font-medium text-slate-200">All evidence for {wallet.label}</summary><p className="mt-3 break-all font-mono text-xs text-slate-400">{wallet.address}</p><ul className="mt-3 grid gap-3">{wallet.evidence.map((item, index) => <li key={`${item.code}-${index}`} className="text-sm leading-6 text-slate-400"><strong className="text-slate-200">{item.title}</strong><p>{item.description}</p><span className="text-xs">{item.family.replaceAll("_", " ")} · {item.effect.replaceAll("_", " ")}</span></li>)}</ul></details>
      </>}
      <p className="mt-4 text-xs leading-5 text-slate-400">Synthetic Solana examples. No live lookup or customer accuracy claim.</p>
      {compact && <Link href="/demo/report" className={`${buttonVariants({ variant: "outline" })} mt-4 w-full`}>Explore all {demo.summary.totalWallets} wallets <ArrowRight className="size-4" /></Link>}
    </section>
  )
}
