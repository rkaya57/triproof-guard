import { campaignApiV2OpenApiWithRunDecisions } from "@/lib/api-v2/openapi-run-decision-package"

export const CAMPAIGN_API_V2_RUN_DECISION_DIFF_OPENAPI_VERSION = "2.3.0" as const

const errorResponse = {
  description: "Request failed.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
} as const

const path = "/api/v2/campaigns/{id}/analyses/{analysisId}/decisions/diff" as const

export const campaignApiV2OpenApiWithRunDecisionDiff = {
  ...campaignApiV2OpenApiWithRunDecisions,
  info: {
    ...campaignApiV2OpenApiWithRunDecisions.info,
    version: CAMPAIGN_API_V2_RUN_DECISION_DIFF_OPENAPI_VERSION,
  },
  paths: {
    ...campaignApiV2OpenApiWithRunDecisions.paths,
    [path]: {
      get: {
        tags: ["Decisions"],
        operationId: "compareCampaignRunDecisions",
        summary: "Compare persisted decisions between two campaign analysis runs",
        description: "Compares canonical CampaignDecision rows from the analysis run in the path against a second exact run supplied by compareTo. The comparison is descriptive only: policy, risk scoring, clustering, reviewer state, and evidence are not recomputed.",
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
            description: "Source legacy analysis ID mapped to a canonical CampaignAnalysisRun.",
            schema: { type: "string", minLength: 1 },
          },
          {
            name: "compareTo",
            in: "query",
            required: true,
            description: "Target legacy analysis ID from the same owned campaign.",
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
            description: "Opaque changed-row cursor. Return it unchanged; it is not authorization state.",
            schema: { type: "string", maxLength: 512 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated persisted decision differences between two exact analysis runs.",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
          "400": errorResponse,
          "401": errorResponse,
          "404": errorResponse,
          "413": errorResponse,
          "503": errorResponse,
        },
        "x-triproof-read-only": true,
        "x-triproof-reruns-policy-engine": false,
        "x-triproof-recomputes-risk": false,
        "x-triproof-recomputes-clusters": false,
        "x-triproof-rescores-evidence": false,
        "x-triproof-historical-run-comparison": true,
        "x-triproof-max-page-size": 500,
        "x-triproof-max-decisions-per-run": 50000,
      },
    },
  },
} as const
