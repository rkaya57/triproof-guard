import { campaignApiV2OpenApiWithAnalysisRunCatalog } from "@/lib/api-v2/openapi-analysis-run-catalog"

export const runtime = "nodejs"

export async function GET() {
  return Response.json(campaignApiV2OpenApiWithAnalysisRunCatalog, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Type": "application/json; charset=utf-8",
    },
  })
}