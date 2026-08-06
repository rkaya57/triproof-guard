import { expect, test, type Page } from "@playwright/test"

const CAMPAIGN_ID = "qa-missing-campaign"
const E2E_PASSWORD = "A-safe-e2e-password-123"

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

async function registerWithBrowser(page: Page) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  await page.goto("/register?next=%2Fdashboard")
  await page.getByLabel("Name", { exact: true }).fill("Campaign Stack QA User")
  await page.getByLabel("Email", { exact: true }).fill(`campaign-stack-${suffix}@example.test`)
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD)
  await page.getByLabel("Confirm password", { exact: true }).fill(E2E_PASSWORD)
  const consents = page.getByRole("checkbox")
  await consents.nth(0).check()
  await consents.nth(1).check()
  await page.getByRole("button", { name: "Create Account", exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
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

  test("keeps all campaign workspace tabs visible and usable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await registerWithBrowser(page)
    await page.goto(pageRoutes[0])

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

  test("renders safe read-only fallback states for the complete authenticated stack", async ({ page }) => {
    await registerWithBrowser(page)

    const expectedStates = [
      [pageRoutes[0], "Campaign detail is temporarily unavailable"],
      [pageRoutes[1], "Risk graph temporarily unavailable"],
      [pageRoutes[2], "Risk memory temporarily unavailable"],
      [pageRoutes[3], "Campaign policy temporarily unavailable"],
      [pageRoutes[4], "Campaign metrics temporarily unavailable"],
    ] as const

    for (const [route, title] of expectedStates) {
      await page.goto(route)
      await expect(page.getByText(title, { exact: true })).toBeVisible()
      await expect(page.getByRole("navigation", { name: "Campaign workspace" })).toBeVisible()
    }
  })

  test("returns safe authenticated service-unavailable responses without exposing data", async ({ page }) => {
    await registerWithBrowser(page)

    for (const route of apiRoutes) {
      const response = await page.request.get(route)
      expect(response.status(), route).toBe(503)
      const body = await response.json()
      expect(body).toHaveProperty("error")
      expect(JSON.stringify(body)).not.toContain("walletAddress")
      expect(JSON.stringify(body)).not.toContain("telegramMessageId")
    }
  })
})
