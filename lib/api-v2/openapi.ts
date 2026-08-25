export const CAMPAIGN_API_V2_OPENAPI_VERSION = "2.0.0"

const bearerSecurity = [{ bearerAuth: [] as string[] }]

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

const cursorParameter = {
  name: "cursor",
  in: "query",
  required: false,
  description: "Opaque scope-specific pagination cursor. Clients must return it unchanged and must not decode or manufacture it.",
  schema: { type: "string", minLength: 1, maxLength: 512 },
} as const

const errorResponse = {
  description: "Request failed.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
} as const

export const campaignApiV2OpenApi = {
  openapi: "3.1.0",
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  info: {
    title: "Tri-Proof Campaign API v2",
    version: CAMPAIGN_API_V2_OPENAPI_VERSION,
    description: "Campaign-native Web3 integrity API for repeatable Solana and EVM wallet analysis, explainable cluster investigation, versioned policy operations, decision packages, and webhook delivery.",
  },
  servers: [{ url: "https://triproofprotocol.com" }],
  security: bearerSecurity,
  tags: [
    { name: "Campaigns", description: "Durable campaign resources and lifecycle operations." },
    { name: "Analyses", description: "Repeatable wallet analysis runs under a campaign." },
    { name: "Clusters", description: "Read-only cluster catalog, intelligence, evidence and membership resources." },
    { name: "Decisions", description: "Read-only campaign decision packages." },
    { name: "Policy", description: "Versioned policy activation for future campaign runs." },
    { name: "Webhooks", description: "API-key webhook endpoint and delivery management." },
  ],
  "x-triproof-decision-boundaries": {
    clusterResourcesAreReadOnly: true,
    clusterSupportConfidenceIsProbability: false,
    inferredArchetypesAreAutomaticDecisions: false,
    sharedInfrastructureIsStandaloneSybilEvidence: false,
    unknownSharedFundingAloneIsConclusive: false,
    policyChangesRecomputePriorRuns: false,
    decisionPackageRecomputesStoredDecisions: false,
    evidencePaginationRescoresEvidence: false,
  },
  paths: {
    "/api/v2/campaigns": {
      get: {
        tags: ["Campaigns"],
        operationId: "listCampaigns",
        summary: "List campaigns",
        responses: {
          "200": {
            description: "Campaign list.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/CampaignList" } } },
          },
          "401": errorResponse,
          "503": errorResponse,
        },
      },
      post: {
        tags: ["Campaigns"],
        operationId: "createCampaign",
        summary: "Create a durable campaign",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateCampaignInput" } } },
        },
        responses: {
          "201": {
            description: "Campaign created.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Campaign" } } },
          },
          "400": errorResponse,
          "401": errorResponse,
          "503": errorResponse,
        },
      },
    },
    "/api/v2/campaigns/{id}": {
      get: {
        tags: ["Campaigns"],
        operationId: "getCampaign",
        summary: "Read one campaign",
        parameters: [campaignIdParameter],
        responses: {
          "200": {
            description: "Campaign resource with policy and analysis context.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Campaign" } } },
          },
          "401": errorResponse,
          "404": errorResponse,
        },
      },
      patch: {
        tags: ["Campaigns"],
        operationId: "changeCampaignLifecycle",
        summary: "Change campaign lifecycle",
        description: "Lifecycle transitions are forward-safe. Archived campaigns cannot be reopened.",
        parameters: [campaignIdParameter],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CampaignLifecycleInput" } } },
        },
        responses: {
          "200": { description: "Lifecycle updated.", content: { "application/json": { schema: { $ref: "#/components/schemas/Campaign" } } } },
          "400": errorResponse,
          "401": errorResponse,
          "404": errorResponse,
          "409": errorResponse,
        },
      },
    },
    "/api/v2/campaigns/{id}/analyses": {
      post: {
        tags: ["Analyses"],
        operationId: "runCampaignAnalysis",
        summary: "Start a campaign analysis run",
        description: "The stored campaign chain and active campaign policy are authoritative for the run.",
        parameters: [campaignIdParameter],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CampaignAnalysisInput" } },
            "multipart/form-data": { schema: { $ref: "#/components/schemas/CampaignAnalysisMultipartInput" } },
          },
        },
        responses: {
          "202": { description: "Analysis accepted.", content: { "application/json": { schema: { $ref: "#/components/schemas/CampaignAnalysisRun" } } } },
          "400": errorResponse,
          "401": errorResponse,
          "404": errorResponse,
          "409": errorResponse,
        },
      },
    },
    "/api/v2/campaigns/{id}/analyses/{analysisId}": {
      get: {
        tags: ["Analyses"],
        operationId: "getCampaignAnalysis",
        summary: "Read campaign analysis status",
        parameters: [campaignIdParameter, analysisIdParameter],
        responses: {
          "200": { description: "Analysis status and bounded result context.", content: { "application/json": { schema: { $ref: "#/components/schemas/CampaignAnalysisStatus" } } } },
          "401": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/v2/campaigns/{id}/analyses/{analysisId}/clusters": {
      get: {
        tags: ["Clusters"],
        operationId: "listCampaignClusters",
        summary: "Page stored cluster catalog",
        description: "Lists persisted cluster summaries only. It does not batch-recompute support confidence or archetypes.",
        parameters: [
          campaignIdParameter,
          analysisIdParameter,
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } },
          cursorParameter,
        ],
        responses: {
          "200": { description: "Stored cluster catalog.", content: { "application/json": { schema: { $ref: "#/components/schemas/ClusterCatalog" } } } },
          "400": errorResponse,
          "401": errorResponse,
          "404": errorResponse,
        },
        "x-triproof-read-only": true,
      },
    },
    "/api/v2/campaigns/{id}/analyses/{analysisId}/clusters/{clusterLabel}": {
      get: {
        tags: ["Clusters"],
        operationId: "getCampaignClusterIntelligence",
        summary: "Read Cluster Intelligence",
        description: "Returns stored grouping basis, Cluster Support Confidence, inferred forensic archetype, and bounded provenance/timeline previews. Support Confidence is evidence strength for an already-stored grouping, not a Sybil probability.",
        parameters: [campaignIdParameter, analysisIdParameter, clusterLabelParameter],
        responses: {
          "200": { description: "Read-only cluster intelligence.", content: { "application/json": { schema: { $ref: "#/components/schemas/ClusterIntelligence" } } } },
          "401": errorResponse,
          "404": errorResponse,
        },
        "x-triproof-read-only": true,
        "x-triproof-recomputes-membership": false,
        "x-triproof-recomputes-decisions": false,
      },
    },
    "/api/v2/campaigns/{id}/analyses/{analysisId}/clusters/{clusterLabel}/evidence": {
      get: {
        tags: ["Clusters"],
        operationId: "listCampaignClusterEvidence",
        summary: "Page stored cluster forensic evidence",
        description: "Pages canonical funding relationships or stored graph edges. Existing risk-bearing and neutralization semantics are preserved; this endpoint never re-scores evidence.",
        parameters: [
          campaignIdParameter,
          analysisIdParameter,
          clusterLabelParameter,
          { name: "lane", in: "query", required: false, schema: { type: "string", enum: ["funding", "graph"], default: "funding" } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 200, default: 100 } },
          cursorParameter,
        ],
        responses: {
          "200": { description: "Stored forensic evidence page.", content: { "application/json": { schema: { $ref: "#/components/schemas/ClusterEvidenceList" } } } },
          "400": errorResponse,
          "401": errorResponse,
          "404": errorResponse,
        },
        "x-triproof-read-only": true,
        "x-triproof-rescores-evidence": false,
        "x-triproof-max-source-scan-rows": 10000,
      },
    },
    "/api/v2/campaigns/{id}/analyses/{analysisId}/clusters/{clusterLabel}/members": {
      get: {
        tags: ["Clusters"],
        operationId: "listCampaignClusterMembers",
        summary: "Page complete stored cluster membership",
        description: "Reads persisted WalletAnalysis cluster assignment only and keeps stored wallet state separate from human review context.",
        parameters: [
          campaignIdParameter,
          analysisIdParameter,
          clusterLabelParameter,
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } },
          cursorParameter,
        ],
        responses: {
          "200": { description: "Stored cluster member page.", content: { "application/json": { schema: { $ref: "#/components/schemas/ClusterMemberList" } } } },
          "400": errorResponse,
          "401": errorResponse,
          "404": errorResponse,
        },
        "x-triproof-read-only": true,
        "x-triproof-recomputes-membership": false,
      },
    },
    "/api/v2/campaigns/{id}/decisions": {
      get: {
        tags: ["Decisions"],
        operationId: "getCampaignDecisionPackage",
        summary: "Retrieve latest Decision Package",
        description: "Read-only packaging of stored decision and matching policy context. Export does not recompute wallet decisions.",
        parameters: [
          campaignIdParameter,
          { name: "format", in: "query", required: false, schema: { type: "string", enum: ["json", "csv"], default: "json" } },
        ],
        responses: {
          "200": {
            description: "Decision Package. Content type depends on format.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/DecisionPackage" } },
              "text/csv": { schema: { type: "string" } },
            },
          },
          "401": errorResponse,
          "404": errorResponse,
          "409": errorResponse,
        },
        "x-triproof-read-only": true,
        "x-triproof-recomputes-decisions": false,
      },
    },
    "/api/v2/campaigns/{id}/policy": {
      post: {
        tags: ["Policy"],
        operationId: "activateCampaignPolicy",
        summary: "Activate a new campaign policy version",
        description: "Creates a future-facing policy version with a required rationale. Prior analysis decisions are not recomputed.",
        parameters: [campaignIdParameter],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PolicyActivationInput" } } } },
        responses: {
          "200": { description: "Policy version activated.", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
          "400": errorResponse,
          "401": errorResponse,
          "404": errorResponse,
          "409": errorResponse,
        },
        "x-triproof-recomputes-prior-runs": false,
      },
    },
    "/api/v2/webhooks": {
      get: {
        tags: ["Webhooks"], operationId: "listWebhooks", summary: "List webhook endpoints",
        responses: { "200": { description: "Webhook endpoints.", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } }, "401": errorResponse, "403": errorResponse },
      },
      post: {
        tags: ["Webhooks"], operationId: "createWebhook", summary: "Create webhook endpoint",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/WebhookInput" } } } },
        responses: { "201": { description: "Webhook created.", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } }, "400": errorResponse, "401": errorResponse, "403": errorResponse },
      },
    },
    "/api/v2/webhooks/{id}": {
      get: {
        tags: ["Webhooks"], operationId: "getWebhook", summary: "Read webhook endpoint",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Webhook endpoint.", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } }, "401": errorResponse, "404": errorResponse },
      },
      patch: {
        tags: ["Webhooks"], operationId: "updateWebhook", summary: "Update webhook endpoint",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/WebhookUpdate" } } } },
        responses: { "200": { description: "Webhook updated.", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } }, "400": errorResponse, "401": errorResponse, "404": errorResponse },
      },
      delete: {
        tags: ["Webhooks"], operationId: "deleteWebhook", summary: "Delete webhook endpoint",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Webhook deleted.", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } }, "401": errorResponse, "404": errorResponse },
      },
    },
    "/api/v2/webhooks/{id}/deliveries": {
      get: {
        tags: ["Webhooks"], operationId: "listWebhookDeliveries", summary: "Page webhook delivery history",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1 } },
          cursorParameter,
          { name: "status", in: "query", required: false, schema: { type: "string", enum: ["pending", "failed", "delivered"] } },
        ],
        responses: { "200": { description: "Delivery history.", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } }, "400": errorResponse, "401": errorResponse, "404": errorResponse },
      },
    },
    "/api/v2/webhooks/{id}/deliveries/{deliveryId}/retry": {
      post: {
        tags: ["Webhooks"], operationId: "retryWebhookDelivery", summary: "Retry one failed webhook delivery",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "deliveryId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Retry accepted or completed.", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } }, "400": errorResponse, "401": errorResponse, "404": errorResponse, "409": errorResponse },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Tri-Proof API key passed as `Authorization: Bearer YOUR_API_KEY`.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
          code: { type: ["string", "null"] },
        },
        additionalProperties: true,
      },
      RiskPolicy: { type: "string", enum: ["conservative", "balanced", "strict"] },
      Chain: { type: "string", enum: ["Ethereum", "Base", "Arbitrum", "Optimism", "Polygon", "BNB Chain", "Solana"] },
      CampaignLifecycle: { type: "string", enum: ["draft", "active", "paused", "completed", "archived"] },
      Campaign: {
        type: "object",
        required: ["id", "object", "apiVersion", "name", "campaignType", "chain", "lifecycle", "riskPolicy"],
        properties: {
          id: { type: "string" }, object: { const: "campaign" }, apiVersion: { const: "v2" }, name: { type: "string" }, campaignType: { type: "string" }, chain: { $ref: "#/components/schemas/Chain" }, lifecycle: { $ref: "#/components/schemas/CampaignLifecycle" }, riskPolicy: { $ref: "#/components/schemas/RiskPolicy" }, policyVersion: { type: ["integer", "null"] },
        },
        additionalProperties: true,
      },
      CampaignList: {
        type: "object",
        required: ["campaigns"],
        properties: { campaigns: { type: "array", items: { $ref: "#/components/schemas/Campaign" } } },
        additionalProperties: true,
      },
      CreateCampaignInput: {
        type: "object",
        required: ["name", "campaignType", "chain"],
        properties: {
          name: { type: "string", minLength: 1 }, campaignType: { type: "string" }, chain: { $ref: "#/components/schemas/Chain" }, riskPolicy: { $ref: "#/components/schemas/RiskPolicy" }, lifecycle: { const: "draft" }, startsAt: { type: ["string", "null"], format: "date-time" }, endsAt: { type: ["string", "null"], format: "date-time" }, rewardPoolUsd: { type: ["number", "null"], minimum: 0 }, campaignContracts: { type: "array", items: { type: "string" } }, metadata: { type: "object", additionalProperties: true }, notes: { type: "string" },
        },
        additionalProperties: false,
      },
      CampaignLifecycleInput: {
        type: "object", required: ["lifecycle"], properties: { lifecycle: { $ref: "#/components/schemas/CampaignLifecycle" } }, additionalProperties: false,
      },
      WalletInput: {
        oneOf: [
          { type: "string", minLength: 1 },
          { type: "object", properties: { wallet: { type: "string" }, walletAddress: { type: "string" }, address: { type: "string" }, policyAction: { type: "string", enum: ["approve", "manual_review", "reject"] }, reputationLabel: { type: "string" }, policyReason: { type: "string" }, campaignPoints: { type: "number" }, campaignEventType: { type: "string" }, referrerAddress: { type: "string" }, referralCode: { type: "string" } }, additionalProperties: false },
        ],
      },
      CampaignAnalysisInput: {
        type: "object", required: ["wallets"], properties: { analysisMode: { type: "string", enum: ["onchain", "hybrid"] }, wallets: { type: "array", minItems: 1, items: { $ref: "#/components/schemas/WalletInput" } } }, additionalProperties: false,
      },
      CampaignAnalysisMultipartInput: {
        type: "object", required: ["csvFile"], properties: { analysisMode: { type: "string", enum: ["onchain", "hybrid"] }, csvFile: { type: "string", contentEncoding: "binary" } }, additionalProperties: true,
      },
      CampaignAnalysisRun: {
        type: "object", required: ["campaignId", "analysisId", "status", "walletCount"], properties: { campaignId: { type: "string" }, analysisId: { type: "string" }, status: { type: "string" }, walletCount: { type: "integer", minimum: 0 }, inputHash: { type: "string" }, riskPolicy: { $ref: "#/components/schemas/RiskPolicy" }, policyVersion: { type: ["integer", "null"] } }, additionalProperties: true,
      },
      CampaignAnalysisStatus: { type: "object", required: ["analysisId", "status"], properties: { analysisId: { type: "string" }, status: { type: "string" }, clusters: { type: "array", items: { type: "object", additionalProperties: true } } }, additionalProperties: true },
      Pagination: { type: "object", required: ["limit", "returned", "hasMore", "nextCursor"], properties: { limit: { type: "integer" }, returned: { type: "integer" }, hasMore: { type: "boolean" }, nextCursor: { type: ["string", "null"] } }, additionalProperties: true },
      ClusterCatalog: { type: "object", required: ["object", "apiVersion", "campaignId", "analysisId", "clusters", "pagination"], properties: { object: { const: "cluster_list" }, apiVersion: { const: "v2" }, campaignId: { type: "string" }, analysisId: { type: "string" }, storedClusterCount: { type: "integer" }, clusters: { type: "array", items: { type: "object", additionalProperties: true } }, pagination: { $ref: "#/components/schemas/Pagination" }, boundaries: { type: "array", items: { type: "string" } } }, additionalProperties: true },
      ClusterIntelligence: { type: "object", required: ["object", "apiVersion", "campaignId", "analysisId", "clusterLabel", "support", "boundaries", "links"], properties: { object: { const: "cluster_intelligence" }, apiVersion: { const: "v2" }, campaignId: { type: "string" }, analysisId: { type: "string" }, clusterLabel: { type: "string" }, support: { type: "object", description: "Evidence support for the already-stored grouping; not a Sybil probability.", additionalProperties: true }, archetype: { type: "object", description: "Forensic hypothesis only; not an automatic decision.", additionalProperties: true }, boundaries: { type: "array", items: { type: "string" } }, links: { type: "object", additionalProperties: { type: "string" } } }, additionalProperties: true },
      ClusterEvidenceList: { type: "object", required: ["object", "apiVersion", "campaignId", "analysisId", "clusterLabel", "lane", "evidence", "pagination", "boundaries"], properties: { object: { const: "cluster_evidence_list" }, apiVersion: { const: "v2" }, campaignId: { type: "string" }, analysisId: { type: "string" }, clusterLabel: { type: "string" }, lane: { type: "string", enum: ["funding", "graph"] }, evidence: { type: "array", items: { type: "object", required: ["kind", "confidence", "riskBearing"], properties: { kind: { type: "string" }, confidence: { type: "number" }, riskBearing: { type: "boolean", description: "Persisted evidence state; never recomputed by this resource." } }, additionalProperties: true } }, pagination: { allOf: [{ $ref: "#/components/schemas/Pagination" }], properties: { scannedRows: { type: "integer" }, scanLimitReached: { type: "boolean" }, maxScanRowsPerRequest: { const: 10000 } } }, boundaries: { type: "array", items: { type: "string" } } }, additionalProperties: true },
      ClusterMemberList: { type: "object", required: ["object", "apiVersion", "campaignId", "analysisId", "clusterLabel", "members", "pagination"], properties: { object: { const: "cluster_member_list" }, apiVersion: { const: "v2" }, campaignId: { type: "string" }, analysisId: { type: "string" }, clusterLabel: { type: "string" }, storedTotalMembers: { type: "integer" }, members: { type: "array", items: { type: "object", properties: { walletAddress: { type: "string" }, chain: { type: "string" }, riskScore: { type: "number" }, storedStatus: { type: "string" }, storedRecommendedAction: { type: "string" }, teamReview: { type: ["object", "null"], additionalProperties: true } }, additionalProperties: true } }, pagination: { $ref: "#/components/schemas/Pagination" }, boundaries: { type: "array", items: { type: "string" } } }, additionalProperties: true },
      DecisionPackage: { type: "object", description: "Read-only decision package. Stored wallet state and execution recommendation remain explicitly separated.", additionalProperties: true },
      PolicyActivationInput: { type: "object", required: ["preset", "rationale"], properties: { preset: { $ref: "#/components/schemas/RiskPolicy" }, rationale: { type: "string", minLength: 1 } }, additionalProperties: false },
      WebhookEvent: { type: "string", enum: ["analysis.completed", "analysis.review_required", "decision_package.ready", "campaign.policy_changed", "campaign.lifecycle_changed", "policy.blocked", "policy.review"] },
      WebhookInput: { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri" }, eventTypes: { type: "array", items: { $ref: "#/components/schemas/WebhookEvent" } }, description: { type: ["string", "null"] } }, additionalProperties: false },
      WebhookUpdate: { type: "object", properties: { url: { type: "string", format: "uri" }, eventTypes: { type: "array", items: { $ref: "#/components/schemas/WebhookEvent" } }, description: { type: ["string", "null"] }, isActive: { type: "boolean" } }, additionalProperties: false },
    },
  },
} as const

export type CampaignApiV2OpenApi = typeof campaignApiV2OpenApi
