import type { ReactNode } from "react"
import Link from "next/link"
import { BarChart3, FileSearch, Gauge, Network, UsersRound } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navItemClass = cn(
  buttonVariants({ variant: "ghost", size: "sm" }),
  "justify-start border border-transparent text-muted-foreground hover:border-primary/20 hover:bg-primary/5 hover:text-foreground",
)

export default async function AnalysisWorkspaceLayout({
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
        aria-label="Analysis workspace"
        className="flex flex-wrap gap-2 rounded-2xl border border-border bg-background/45 p-2"
      >
        <Link href={`/dashboard/analysis/${id}`} className={navItemClass}>
          <BarChart3 data-icon="inline-start" />
          Overview
        </Link>
        <Link href={`/dashboard/analysis/${id}/review`} className={navItemClass}>
          <UsersRound data-icon="inline-start" />
          Review
        </Link>
        <Link href={`/dashboard/analysis/${id}/evidence`} className={navItemClass}>
          <FileSearch data-icon="inline-start" />
          Evidence
        </Link>
        <Link href={`/dashboard/analysis/${id}/clusters`} className={navItemClass}>
          <Network data-icon="inline-start" />
          Clusters
        </Link>
        <Link href={`/dashboard/analysis/${id}/metrics`} className={navItemClass}>
          <Gauge data-icon="inline-start" />
          Metrics
        </Link>
      </nav>
      {children}
    </div>
  )
}
