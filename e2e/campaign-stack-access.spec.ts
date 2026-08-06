import { expect, test, type Page } from "@playwright/test"

import { db } from "../lib/db/prisma"

const CAMPAIGN_ID = "qa-missing-campaign"
const E2E_PASSWORD = "A-safe-e2e-password-123"
let campaignIpSequence = 10

const pageRoutes = [
  `/dashboard/campaigns/${CAMPAIGN_ID}`,
  `/dashboard/campaigns/${CAMPAIGN_ID}/risk-graph`,
  `/dashboard/campaigns/${CAMPAIGN_ID}/risk-memory`,
  `/dashboard/campaigns/${CAMPAIGN_ID}/policy`,
  `/dashboard/campaigns/${CAMPAIGN_ID}/metrics`,
] as const

const apiRoutes = [
  `/api/campaigns/${CAMPAIGN_ID}/risk-graph`,
  `/api/campaigns/${CAMPAIGN_ID}/risk-memory`,
  `/api/campaigns/${CAMPAIGN_ID}/policy`,
  `/api/campaigns/${CAMPAIGN_ID}/metrics`,
] as const

function nextCampaignTestIp() {
  campaignIpSequence = campaignIpSequence >= 250 ? 10 : campaignIpSequence + 1
  return `203.0.113.${campaignIpSequence}`
}

async function registerWithBrowser(page: Page, destination = "/dashboard/campaigns") {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  await page.setExtraHTTPHeaders({ "x-forwarded-for": nextCampaignTestIp() })
  await page.goto(`/register?next=${encodeURIComponent(destination)}`)
  await page.getByLabel("Name", { exact: true }).fill("Campaign Stack QA User")
  await page.getByLabel("Email", { exact: true }).fill(`campaign-stack-${suffix}@example.test`)
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD)
  await page.getByLabel("Confirm password", { exact: true }).fill(E2E_PASSWORD)
  const consents = page.getByRole("checkbox")
  await consents.nth(0).check()
  await consents.nth(1).check()
  await page.getByRole("button", { name: "Create Account", exact: true }).click()
  await expect(page).toHaveURL(
    new RegExp(`/onboarding\\?next=${encodeURIComponent(destination)}$`),
    { timeout: 15_000 }
  )

  const session = await page.request.get("/api/auth/me")
  expect(session.status()).toBe(200)
  const body = (await session.json()) as { user: { id: string } }
  await page.goto(destination)
  return body.user.id
}

test.describe("campaign stack integration and access boundaries", () => {
  test("redirects anonymous visitors through the canonical safe dashboard destination", async ({ page }) => {
    for (const route of pageRoutes) {
      await page.goto(route)
      const url = new URL(page.url())
      expect(url.pathname).toBe("/login")
      expect(url.searchParams.get("next")).toBe("/dashboard")
    }
  })

  test("rejects anonymous requests to every campaign intelligence API", async ({ request }) => {
    for (const route of apiRoutes) {
      const response = await request.get(route)
      expect(response.status(), route).toBe(401)
      await expect(response.json()).resolves.toMatchObject({ error: "Unauthorized" })
    }
  })

  test("shows a safe empty campaign workspace for a new authenticated account", async ({ page }) => {
    await registerWithBrowser(page)
    await expect(page).toHaveURL(/\/dashboard\/campaigns$/)
    await expect(page.getByText("No campaigns yet", { exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Start analysis", exact: true })).toBeVisible()
  })

  test("keeps all nested campaign workspace tabs visible without mobile overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const userId = await registerWithBrowser(page)
    const project = await db.project.create({
      data: {
        userId,
        name: "Disposable Mobile QA Campaign",
        campaignType: "airdrop",
        chain: "solana",
        notes: "Created only inside the disposable authenticated QA database.",
      },
    })

    const response = await page.goto(`/dashboard/campaigns/${project.id}`)
    expect(response?.status()).toBe(200)

    const workspace = page.getByRole("navigation", { name: "Campaign workspace" })
    await expect(workspace).toBeVisible()
    for (const name of ["Overview", "Risk Graph", "Risk Memory", "Policy", "Metrics"]) {
      await expect(workspace.getByRole("link", { name, exact: true })).toBeVisible()
    }

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    )
    expect(hasHorizontalOverflow).toBe(false)
  })

  test("keeps missing campaigns isolated across the complete authenticated stack", async ({ page }) => {
    await registerWithBrowser(page)

    for (const route of pageRoutes) {
      const response = await page.goto(route)
      expect(response?.status(), route).toBe(404)
      const body = await page.locator("body").innerText()
      expect(body).not.toContain("walletAddress")
      expect(body).not.toContain("telegramMessageId")
      expect(body).not.toContain("Risk Graph v1")
      expect(body).not.toContain("Cross-Campaign Risk Memory v1")
    }
  })

  test("returns authenticated not-found responses without exposing campaign data", async ({ page }) => {
    await registerWithBrowser(page)

    for (const route of apiRoutes) {
      const response = await page.request.get(route)
      expect(response.status(), route).toBe(404)
      const body = await response.json()
      expect(body).toMatchObject({ error: "Campaign not found" })
      expect(JSON.stringify(body)).not.toContain("walletAddress")
      expect(JSON.stringify(body)).not.toContain("telegramMessageId")
    }
  })
})
