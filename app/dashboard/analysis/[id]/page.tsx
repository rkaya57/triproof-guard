import Link from "next/link"
import { Network } from "lucide-react"

import { AnalysisRouteClient } from "@/components/analysis/analysis-route-client"
import { buttonVariants } from "@/components/ui/button"

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end px-5 pt-5 sm:px-8">
        <Link href={`/dashboard/analysis/${id}/clusters`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Network data-icon="inline-start" /> Cluster investigations
        </Link>
      </div>
      <AnalysisRouteClient analysisId={id} />
    </div>
  )
}
