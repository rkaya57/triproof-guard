import { campaignApiV2OpenApi } from "@/lib/api-v2/openapi"

export const CAMPAIGN_API_V2_CASE_EXPORT_OPENAPI_VERSION = "2.1.0" as const

const campaignIdParameter = {
  name: "id",
  in: "path",
  required: true,
  description: "Tri-Proof campaign ID.",
  schema: { type: "string", minLength: 1 },
} as const

const analysisIdParameter = {
  name: "analysisId",
  in: "path",
  required: true,
  description: "Analysis run ID owned by the campaign.",
  schema: { type: "string", minLength: 1 },
} as const

const clusterLabelParameter = {
  name: "clusterLabel",
  in: "path",
  required: true,
  description: "Stored cluster label. URL-encode this value when constructing a request path.",
  schema: { type: "string", minLength: 1 },
} as const

const errorResponse = {
  description: "Request failed.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
} as const

const caseExportPath = "/api/v2/campaigns/{id}/analyses/{analysisId}/clusters/{clusterLabel}/export" as const

export const campaignApiV2OpenApiWithCaseExport = {
  ...campaignApiV2OpenApi,
  info: {
    ...campaignApiV2OpenApi.info,
    version: CAMPAIGN_API_V2_CASE_EXPORT_OPENAPI_VERSION,
  },
  paths: {
    ...campaignApiV2OpenApi.paths,
    [caseExportPath]: {
      get: {
        tags: ["Clusters"],
        operationId: "exportCampaignClusterCase",
        summary: "Export one stored cluster investigation case",
        description: "Exports the existing stored investigation package as JSON or CSV, or the read-only analyst case brief as Markdown. Export generation does not recompute cluster membership, wallet risk, stored decisions, campaign policy, reviewer state, or evidence semantics.",
        parameters: [
          campaignIdParameter,
          analysisIdParameter,
          clusterLabelParameter,
          {
            name: "format",
            in: "query",
            required: false,
            description: "Export format. `md` is accepted by the runtime as an alias for `markdown`.",
            schema: { type: "string", enum: ["json", "csv", "markdown"], default: "json" },
          },
        ],
        responses: {
          "200": {
            description: "Read-only cluster case export. Response is an attachment and content type depends on format.",
            content: {
              "application/json": { schema: { type: "string", description: "Deterministic investigation export JSON document." } },
              "text/csv": { schema: { type: "string", description: "Deterministic wallet-level investigation export." } },
              "text/markdown": { schema: { type: "string", description: "Read-only analyst case brief." } },
            },
          },
          "400": errorResponse,
          "401": errorResponse,
          "404": errorResponse,
          "503": errorResponse,
        },
        "x-triproof-read-only": true,
        "x-triproof-recomputes-membership": false,
        "x-triproof-recomputes-decisions": false,
        "x-triproof-rescores-evidence": false,
        "x-triproof-export-boundary": "read-only-no-recompute",
      },
    },
  },
} as const
