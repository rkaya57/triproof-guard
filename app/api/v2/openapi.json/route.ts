import { campaignApiV2OpenApiWithRunDecisions } from "@/lib/api-v2/openapi-run-decision-package"

export const runtime = "nodejs"

export async function GET() {
  return Response.json(campaignApiV2OpenApiWithRunDecisions, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Type": "application/json; charset=utf-8",
    },
  })
}
