import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"

export function AdminWorkspaceHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  tone = "amber",
  actions,
  meta,
}: {
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  tone?: "amber" | "cyan" | "emerald" | "violet"
  actions?: ReactNode
  meta?: ReactNode
}) {
  const toneClass = {
    amber: "border-amber-300/18 bg-amber-300/[0.045] text-amber-200",
    cyan: "border-cyan-300/18 bg-cyan-300/[0.045] text-cyan-200",
    emerald: "border-emerald-300/18 bg-emerald-300/[0.045] text-emerald-200",
    violet: "border-violet-300/18 bg-violet-300/[0.045] text-violet-200",
  }[tone]

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/[0.065] bg-[linear-gradient(120deg,rgba(15,23,42,.9),rgba(8,20,35,.88)_58%,rgba(30,41,59,.5))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,.025)] sm:p-7">
      <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-amber-300/[0.035] blur-3xl" />
      <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <Badge variant="outline" className={`mb-3 ${toneClass}`}>
            <Icon className="mr-1 size-3.5" /> {eyebrow}
          </Badge>
          <h2 className="text-2xl font-semibold tracking-[-0.025em] text-white sm:text-3xl">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>
          {meta ? <div className="mt-4 flex flex-wrap gap-2">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2 lg:justify-end">{actions}</div> : null}
      </div>
    </section>
  )
}
