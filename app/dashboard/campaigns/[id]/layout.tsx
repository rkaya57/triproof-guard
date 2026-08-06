import type { ReactNode } from "react"
import Link from "next/link"
import { Activity, BarChart3, Gavel, History, Network } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
        className="flex flex-wrap gap-2 rounded-xl border border-border bg-background/45 p-2"
      >
        <Link
          href={`/dashboard/campaigns/${id}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "justify-start")}
        >
          <BarChart3 data-icon="inline-start" />
          Overview
        </Link>
        <Link
          href={`/dashboard/campaigns/${id}/risk-graph`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "justify-start")}
        >
          <Network data-icon="inline-start" />
          Risk Graph
        </Link>
        <Link
          href={`/dashboard/campaigns/${id}/risk-memory`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "justify-start")}
        >
          <History data-icon="inline-start" />
          Risk Memory
        </Link>
        <Link
          href={`/dashboard/campaigns/${id}/policy`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "justify-start")}
        >
          <Gavel data-icon="inline-start" />
          Policy
        </Link>
        <Link
          href={`/dashboard/campaigns/${id}/metrics`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "justify-start")}
        >
          <Activity data-icon="inline-start" />
          Metrics
        </Link>
      </nav>
      {children}
    </div>
  )
}
