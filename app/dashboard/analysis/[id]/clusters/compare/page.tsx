import { CrossClusterComparisonWorkspace } from "@/components/analysis/cross-cluster-comparison-workspace"

export default async function CrossClusterComparisonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <CrossClusterComparisonWorkspace analysisId={id} />
}
