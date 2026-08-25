import { ClusterInvestigationIndex } from "@/components/analysis/cluster-investigation-index"

export default async function ClusterInvestigationIndexPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ClusterInvestigationIndex analysisId={id} />
}
