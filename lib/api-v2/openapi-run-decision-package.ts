import { campaignApiV2OpenApiWithCaseExport } from "@/lib/api-v2/openapi-cluster-case-export"

export const CAMPAIGN_API_V2_RUN_DECISIONS_OPENAPI_VERSION = "2.2.0" as const

const errorResponse = {
  description: "Request failed.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
} as const

const path = "/api/v2/campaigns/{id}/analyses/{analysisId}/decisions" as const

export const campaignApiV2OpenApiWithRunDecisions = {
  ...campaignApiV2OpenApiWithCaseExport,
  info: {
    ...campaignApiV2OpenApiWithCaseExport.info,
    version: CAMPAIGN_API_V2_RUN_DECISIONS_OPENAPI_VERSION,
  },
  paths: {
    ...campaignApiV2OpenApiWithCaseExport.paths,
    [path]: {
      get: {
        tags: ["Decisions"],
        operationId: "listCampaignRunDecisions",
        summary: "Read persisted decisions for one exact campaign analysis run",
        description: "Returns paginated canonical CampaignDecision rows for the exact analysis run in the URL. The policy engine is not rerun, later policy versions and later risk-memory observations do not rewrite these persisted decisions, and evidence/matched rules are not re-scored by this resource.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Tri-Proof campaign ID.",
            schema: { type: "string", minLength: 1 },
          },
          {
            name: "analysisId",
            in: "path",
            required: true,
            description: "Exact legacy analysis ID mapped to the canonical CampaignAnalysisRun.",
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
            description: "Opaque run-decision cursor. Return it unchanged and never interpret it as authorization state.",
            schema: { type: "string", maxLength: 512 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated persisted decision snapshot for the exact run.",
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
        "x-triproof-reruns-policy-engine": false,
        "x-triproof-rescores-evidence": false,
        "x-triproof-historical-run-scope": true,
        "x-triproof-max-page-size": 500,
      },
    },
  },
} as const
