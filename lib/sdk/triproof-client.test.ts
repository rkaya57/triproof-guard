import assert from "node:assert/strict"
import test from "node:test"

import {
  TriProofApiError,
  TriProofClient,
  type CreateCampaignInput,
} from "@/lib/sdk/triproof-client"

type RecordedCall = {
  url: string
  method: string
  headers: Headers
  body: string | null
}

function mockClient(resolver?: (call: RecordedCall) => Response) {
  const calls: RecordedCall[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    const body = typeof init.body === "string" ? init.body : null
    const call = {
      url: String(input),
      method: init.method ?? "GET",
      headers,
      body,
    }
    calls.push(call)
    return resolver?.(call) ?? Response.json({ ok: true })
  }) as typeof fetch

  return {
    calls,
    client: new TriProofClient({
      apiKey: "tp_live_test_key",
      baseUrl: "https://api.example.test/",
      fetchImpl,
    }),
  }
}

const campaignInput: CreateCampaignInput = {
  name: "Genesis Rewards",
  campaignType: "Airdrop",
  chain: "Base",
  riskPolicy: "balanced",
}

test("SDK keeps the legacy one-off analysis method backward compatible", async () => {
  const { client, calls } = mockClient()
  await client.createAnalysis({ chain: "Solana", wallets: ["wallet_1"] })

  assert.equal(calls[0]?.url, "https://api.example.test/api/v1/analyze")
  assert.equal(calls[0]?.method, "POST")
  assert.equal(calls[0]?.headers.get("authorization"), "Bearer tp_live_test_key")
})

test("campaign API v2 methods use durable campaign resources and encoded IDs", async () => {
  const { client, calls } = mockClient()
  await client.createCampaign(campaignInput)
  await client.runCampaignAnalysis("campaign/id", { wallets: ["0xabc"] })
  await client.changeCampaignLifecycle("campaign/id", "paused")
  await client.activateCampaignPolicy("campaign/id", { preset: "strict", rationale: "Higher-value reward round" })

  assert.equal(calls[0]?.url, "https://api.example.test/api/v2/campaigns")
  assert.equal(calls[1]?.url, "https://api.example.test/api/v2/campaigns/campaign%2Fid/analyses")
  assert.equal(calls[2]?.url, "https://api.example.test/api/v2/campaigns/campaign%2Fid")
  assert.deepEqual(JSON.parse(calls[2]?.body ?? "{}"), { lifecycle: "paused" })
  assert.equal(calls[3]?.url, "https://api.example.test/api/v2/campaigns/campaign%2Fid/policy")
  assert.equal(JSON.parse(calls[3]?.body ?? "{}").rationale, "Higher-value reward round")
})

test("SDK exposes the ownership-scoped campaign cluster intelligence resource", async () => {
  const { client, calls } = mockClient()
  await client.getCampaignClusterIntelligence("campaign/id", "analysis id", "CL / 001")

  assert.equal(
    calls[0]?.url,
    "https://api.example.test/api/v2/campaigns/campaign%2Fid/analyses/analysis%20id/clusters/CL%20%2F%20001",
  )
  assert.equal(calls[0]?.method, "GET")
  assert.equal(calls[0]?.headers.get("authorization"), "Bearer tp_live_test_key")
})

test("Decision Package CSV is returned as text instead of being JSON parsed", async () => {
  const { client, calls } = mockClient((call) => {
    if (call.url.includes("format=csv")) {
      return new Response("wallet,decision\n0xabc,allow\n", {
        status: 200,
        headers: { "content-type": "text/csv" },
      })
    }
    return Response.json({ ok: true })
  })

  const csv = await client.getCampaignDecisionCsv("campaign_1")
  assert.match(csv, /^wallet,decision/)
  assert.equal(calls[0]?.url, "https://api.example.test/api/v2/campaigns/campaign_1/decisions?format=csv")
})

test("SDK exposes API-key webhook CRUD on the API v2 surface", async () => {
  const { client, calls } = mockClient()
  await client.listWebhooks()
  await client.createWebhook({
    url: "https://partner.example/hook",
    eventTypes: ["analysis.completed", "decision_package.ready"],
  })
  await client.updateWebhook("hook/id", { isActive: false })
  await client.deleteWebhook("hook/id")

  assert.equal(calls[0]?.url, "https://api.example.test/api/v2/webhooks")
  assert.equal(calls[1]?.method, "POST")
  assert.equal(calls[2]?.url, "https://api.example.test/api/v2/webhooks/hook%2Fid")
  assert.equal(calls[2]?.method, "PATCH")
  assert.equal(calls[3]?.method, "DELETE")
})

test("SDK exposes paginated delivery history and controlled manual retry", async () => {
  const { client, calls } = mockClient()
  await client.listWebhookDeliveries("hook/id", { limit: 25, cursor: "delivery cursor", status: "failed" })
  await client.retryWebhookDelivery("hook/id", "delivery/id")

  assert.equal(
    calls[0]?.url,
    "https://api.example.test/api/v2/webhooks/hook%2Fid/deliveries?limit=25&cursor=delivery+cursor&status=failed",
  )
  assert.equal(calls[0]?.method, "GET")
  assert.equal(
    calls[1]?.url,
    "https://api.example.test/api/v2/webhooks/hook%2Fid/deliveries/delivery%2Fid/retry",
  )
  assert.equal(calls[1]?.method, "POST")
})

test("SDK preserves API status and machine-readable error code", async () => {
  const { client } = mockClient(() => Response.json(
    { error: "Webhooks require an API Growth plan.", code: "WEBHOOK_PLAN_REQUIRED" },
    { status: 403 },
  ))

  await assert.rejects(
    () => client.listWebhooks(),
    (error: unknown) => {
      assert.ok(error instanceof TriProofApiError)
      assert.equal(error.status, 403)
      assert.equal(error.code, "WEBHOOK_PLAN_REQUIRED")
      return true
    },
  )
})
