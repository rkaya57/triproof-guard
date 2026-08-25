import { campaignApiV2OpenApiWithRunDecisionDiff } from "@/lib/api-v2/openapi-run-decision-diff"

export const CAMPAIGN_API_V2_ANALYSIS_RUN_CATALOG_OPENAPI_VERSION = "2.4.0" as const

const errorResponse = {
  description: "Request failed.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
} as const

const path = "/api/v2/campaigns/{id}/analyses" as const
const existingPath = campaignApiV2OpenApiWithRunDecisionDiff.paths[path]

export const campaignApiV2OpenApiWithAnalysisRunCatalog = {
  ...campaignApiV2OpenApiWithRunDecisionDiff,
  info: {
    ...campaignApiV2OpenApiWithRunDecisionDiff.info,
    version: CAMPAIGN_API_V2_ANALYSIS_RUN_CATALOG_OPENAPI_VERSION,
  },
  paths: {
    ...campaignApiV2OpenApiWithRunDecisionDiff.paths,
    [path]: {
      ...existingPath,
      get: {
        tags: ["Campaigns"],
        operationId: "listCampaignAnalysisRuns",
        summary: "List persisted analysis runs for a campaign",
        description: "Pages stored analysis-run summaries for one owned campaign. Pagination is read-only and does not rerun analysis, policy, risk scoring, clustering, or evidence generation.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Tri-Proof campaign ID.",
            schema: { type: "string", minLength: 1 },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 500, default: 100 },
          },
          {
            name: "cursor",
            in: "query",
            required: false,
            description: "Opaque, scope-versioned run-catalog cursor. Return it unchanged; campaign ownership is always verified independently.",
            schema: { type: "string", maxLength: 768 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated persisted analysis-run catalog.",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
          "400": errorResponse,
          "401": errorResponse,
          "404": errorResponse,
          "503": errorResponse,
        },
        "x-triproof-read-only": true,
        "x-triproof-reruns-analysis": false,
        "x-triproof-reruns-policy-engine": false,
        "x-triproof-recomputes-risk": false,
        "x-triproof-recomputes-clusters": false,
        "x-triproof-rescores-evidence": false,
        "x-triproof-stored-run-metadata": true,
        "x-triproof-max-page-size": 500,
      },
    },
  },
} as const
