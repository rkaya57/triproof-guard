import { DecisionEvidenceView } from "@/components/analysis/decision-evidence-view"

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <DecisionEvidenceView analysisId={id} />
}
