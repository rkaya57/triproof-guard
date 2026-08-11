import { LockKeyhole, ShieldCheck, SlidersHorizontal } from "lucide-react"

import { TeamPolicyConsole } from "@/components/dashboard/team-policy-console"
import { Badge } from "@/components/ui/badge"

export default function Page() {
  return (
    <div className="grid gap-5">
      <section className="relative overflow-hidden rounded-3xl border border-violet-400/20 bg-[linear-gradient(120deg,rgba(30,41,59,.78),rgba(15,23,42,.9)_55%,rgba(91,33,182,.16))] p-6 sm:p-7">
        <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <Badge variant="outline" className="mb-3 border-violet-400/25 bg-violet-400/[0.05] text-violet-200"><ShieldCheck className="mr-1 size-3" /> Policy control plane</Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Turn risk signals into team rules</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Configure allow, review and block behavior for your team. Policy actions remain explicit, auditable and separate from underlying threat intelligence.</p>
          </div>
          <div className="flex gap-2 text-xs text-slate-300">
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2"><SlidersHorizontal className="size-3.5 text-violet-300" /> Rules</span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2"><LockKeyhole className="size-3.5 text-violet-300" /> Enforced</span>
          </div>
        </div>
      </section>
      <TeamPolicyConsole />
    </div>
  )
}
