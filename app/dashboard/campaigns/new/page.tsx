import { Layers3, Network, ShieldCheck } from "lucide-react"

import { CampaignIntakeForm } from "@/components/dashboard/campaign-intake-form"
import { Badge } from "@/components/ui/badge"
import { requirePageUser } from "@/lib/auth/page"

export default async function NewCampaignPage() {
  await requirePageUser("/dashboard/campaigns/new")

  return (
    <div className="grid gap-5">
      <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-[linear-gradient(120deg,rgba(8,47,73,.42),rgba(15,23,42,.82)_55%,rgba(76,29,149,.14))] p-6 sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-20 size-56 rounded-full border border-cyan-400/10 bg-cyan-400/[0.04]" />
        <div className="relative z-10 grid gap-5 xl:grid-cols-[1fr_auto] xl:items-end">
          <div>
            <Badge variant="outline" className="mb-3 border-cyan-400/25 bg-cyan-400/[0.05] text-cyan-200">
              <Layers3 className="mr-1 size-3" /> Campaign-native intake
            </Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Create the campaign before the wallet run</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Keep every analysis, policy version, cluster investigation, and customer decision package under one durable campaign instead of creating a new project for every upload.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="min-w-28 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3 text-slate-300">
              <Network className="mx-auto mb-1.5 size-4 text-cyan-300" /> One campaign scope
            </div>
            <div className="min-w-28 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3 text-slate-300">
              <ShieldCheck className="mx-auto mb-1.5 size-4 text-cyan-300" /> Versioned policy
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto w-full max-w-4xl">
        <CampaignIntakeForm />
      </div>
    </div>
  )
}
