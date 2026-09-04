import type { ReactNode } from "react"
import Link from "next/link"
import { Activity, BarChart3, Calculator, ClipboardCheck, History, Network } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navItemClass = cn(
  buttonVariants({ variant: "ghost", size: "sm" }),
  "justify-start border border-transparent text-muted-foreground hover:border-primary/20 hover:bg-primary/5 hover:text-foreground",
)

export default async function CampaignWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="flex flex-col gap-5">
      <nav
        aria-label="Campaign workspace"
        className="flex flex-wrap gap-2 rounded-2xl border border-border bg-background/45 p-2"
      >
        <Link href={`/dashboard/campaigns/${id}`} className={navItemClass}>
          <BarChart3 data-icon="inline-start" />
          Overview
        </Link>
        <Link href={`/dashboard/campaigns/${id}/decisions`} className={navItemClass}>
          <ClipboardCheck data-icon="inline-start" />
          Decisions
        </Link>
        <Link href={`/dashboard/campaigns/${id}/policy#policy-simulator`} className={navItemClass}>
          <Calculator data-icon="inline-start" />
          Policy Simulator
        </Link>
        <Link href={`/dashboard/campaigns/${id}/risk-graph`} className={navItemClass}>
          <Network data-icon="inline-start" />
          Risk Graph
        </Link>
        <Link href={`/dashboard/campaigns/${id}/risk-memory`} className={navItemClass}>
          <History data-icon="inline-start" />
          Risk Memory
        </Link>
        <Link href={`/dashboard/campaigns/${id}/metrics`} className={navItemClass}>
          <Activity data-icon="inline-start" />
          Metrics
        </Link>
      </nav>
      {children}
    </div>
  )
}
