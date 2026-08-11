import Link from "next/link"
import { ArrowRight, Fingerprint, Settings2, ShieldCheck } from "lucide-react"

import { SettingsClient } from "@/components/dashboard/settings-client"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"

export default function Page() {
  return (
    <div className="grid gap-5">
      <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-[linear-gradient(120deg,rgba(8,47,73,.35),rgba(15,23,42,.86)_58%,rgba(30,64,175,.10))] p-6 sm:p-7">
        <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <Badge variant="outline" className="mb-3 border-cyan-400/25 bg-cyan-400/[0.05] text-cyan-200"><Settings2 className="mr-1 size-3" /> Workspace controls</Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Account and workspace settings</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Manage profile preferences, linked wallets and workspace behavior. Security-sensitive session and device controls live in a dedicated surface.</p>
          </div>
          <Link href="/dashboard/settings/security" className={`${buttonVariants()} border border-cyan-300/20 bg-cyan-400/90 text-slate-950 hover:bg-cyan-300`}>
            <ShieldCheck className="size-4" /> Security controls <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="relative z-10 mt-5 flex flex-wrap gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2"><Fingerprint className="size-3.5 text-cyan-300" /> Session-aware account controls</span>
        </div>
      </section>
      <SettingsClient />
    </div>
  )
}
