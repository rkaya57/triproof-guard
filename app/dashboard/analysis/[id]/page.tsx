import { AnalysisRouteClient } from "@/components/analysis/analysis-route-client"

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <AnalysisRouteClient analysisId={id} />
}
