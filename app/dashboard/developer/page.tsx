import { Braces, Code2, KeyRound, ShieldCheck } from "lucide-react"

import { DeveloperAccess } from "@/components/dashboard/developer-access"
import { WebhookManager } from "@/components/dashboard/webhook-manager"
import { Badge } from "@/components/ui/badge"

export default function Page() {
  return (
    <div className="grid gap-5">
      <section className="relative overflow-hidden rounded-3xl border border-blue-400/20 bg-[linear-gradient(120deg,rgba(8,47,73,.32),rgba(15,23,42,.82)_55%,rgba(30,64,175,.12))] p-6 sm:p-7">
        <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <Badge variant="outline" className="mb-3 border-blue-400/25 bg-blue-400/[0.05] text-blue-200"><Code2 className="mr-1 size-3" /> Developer surface</Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Integrate Tri-Proof security signals</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Manage API access, signed campaign webhooks and product surfaces without exposing secrets. Keep development access separated from operational security controls.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[[KeyRound, "API access"], [Braces, "Integration"], [ShieldCheck, "Controlled"]].map(([Icon, label]) => (
              <span key={label as string} className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs text-slate-300"><Icon className="size-3.5 text-blue-300" />{label as string}</span>
            ))}
          </div>
        </div>
      </section>
      <DeveloperAccess />
      <WebhookManager />
    </div>
  )
}
