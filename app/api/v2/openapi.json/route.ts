import { campaignApiV2OpenApiWithCaseExport } from "@/lib/api-v2/openapi-cluster-case-export"

export const runtime = "nodejs"

export async function GET() {
  return Response.json(campaignApiV2OpenApiWithCaseExport, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Type": "application/json; charset=utf-8",
    },
  })
}
