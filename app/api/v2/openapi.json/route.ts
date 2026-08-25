import { campaignApiV2OpenApi } from "@/lib/api-v2/openapi"

export const runtime = "nodejs"

export async function GET() {
  return Response.json(campaignApiV2OpenApi, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Type": "application/json; charset=utf-8",
    },
  })
}
