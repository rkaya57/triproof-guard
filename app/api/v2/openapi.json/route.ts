import { campaignApiV2OpenApiWithRunDecisionDiff } from "@/lib/api-v2/openapi-run-decision-diff"

export const runtime = "nodejs"

export async function GET() {
  return Response.json(campaignApiV2OpenApiWithRunDecisionDiff, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Type": "application/json; charset=utf-8",
    },
  })
}
