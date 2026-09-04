import { Archive, FileCheck2, Landmark, ShieldCheck } from "lucide-react"
import { redirect } from "next/navigation"

import { TriProofNetConsole } from "@/components/net/tri-proof-net-console"
import { Badge } from "@/components/ui/badge"
import { getAdminUser } from "@/lib/auth/admin"

export default async function Page() {
  const user = await getAdminUser()
  if (!user) redirect("/dashboard")

  return (
    <div className="grid gap-5">
      <section className="relative overflow-hidden rounded-3xl border border-amber-400/20 bg-[linear-gradient(120deg,rgba(69,26,3,.20),rgba(15,23,42,.90)_56%,rgba(8,47,73,.15))] p-6 sm:p-7">
        <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <Badge variant="outline" className="mb-3 border-amber-400/25 bg-amber-400/[0.05] text-amber-200"><Landmark className="mr-1 size-3" /> Internal office</Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Tri-Proof Net document command center</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Create, route, approve and archive internal records with a clear administrative trail. The document workflow remains restricted to authorized operators.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-300">
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2"><FileCheck2 className="size-3.5 text-amber-300" /> Approval workflow</span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2"><Archive className="size-3.5 text-cyan-300" /> Records</span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2"><ShieldCheck className="size-3.5 text-emerald-300" /> Admin only</span>
          </div>
        </div>
      </section>
      <TriProofNetConsole currentUser={user} />
    </div>
  )
}
