import { AnalysisDetail } from "@/components/analysis/analysis-detail"
import { getDemoAnalysis } from "@/lib/demo-data"

export default function Page() {
  return <AnalysisDetail initialAnalysis={getDemoAnalysis()} exportBasePath="/api/demo/export" />
}
