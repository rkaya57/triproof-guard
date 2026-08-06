import { expect, request as playwrightRequest, test, type Page } from "@playwright/test"

const E2E_PASSWORD = "A-safe-e2e-password-123"

async function registerWithBrowser(page: Page, next = "/") {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  await page.goto(`/register?next=${encodeURIComponent(next)}`)
  await page.getByLabel("Name", { exact: true }).fill("Security Test User")
  await page.getByLabel("Email", { exact: true }).fill(`security-${suffix}@example.test`)
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD)
  await page.getByLabel("Confirm password", { exact: true }).fill(E2E_PASSWORD)
  const consents = page.getByRole("checkbox")
  await consents.nth(0).check()
  await consents.nth(1).check()
  await page.getByRole("button", { name: "Create Account", exact: true }).click()
  return suffix
}

test.describe("security access boundaries", () => {
  test("redirects anonymous visitors from ScamGuard to sign in", async ({ page }) => {
    await page.goto("/scamguard")
    await expect(page).toHaveURL(/\/login\?next=%2Fscamguard$/)
    await expect(page.getByText("Welcome back", { exact: true })).toBeVisible()
  })

  test("registers an account through the browser and the server issues a hardened session", async ({ page }) => {
    const suffix = await registerWithBrowser(page)
    await expect(page).toHaveURL(/\/$/)

    const api = await playwrightRequest.newContext({ baseURL: "http://127.0.0.1:3100" })
    const response = await api.post("/api/auth/register", {
      data: {
        name: "Session Security Test",
        email: `session-${suffix}@example.test`,
        password: E2E_PASSWORD,
        confirmPassword: E2E_PASSWORD,
        acceptTerms: true,
        acceptPrivacy: true,
      },
    })
    expect(response.status()).toBe(200)
    const setCookie = response.headersArray().find((header) => header.name.toLowerCase() === "set-cookie")?.value ?? ""
    expect(setCookie).toContain("tri-proof-session=")
    expect(setCookie).toContain("HttpOnly")
    expect(setCookie).toMatch(/SameSite=Lax/i)
    expect(setCookie).toContain("Secure")

    const token = /tri-proof-session=([^;]+)/.exec(setCookie)?.[1]
    expect(token).toBeTruthy()
    const authenticatedApi = await playwrightRequest.newContext({
      baseURL: "http://127.0.0.1:3100",
      extraHTTPHeaders: { Cookie: `tri-proof-session=${token}` },
    })
    const session = await authenticatedApi.get("/api/auth/me")
    expect(session.status()).toBe(200)
    await expect(session.json()).resolves.toMatchObject({ user: { email: `session-${suffix}@example.test` } })
    await Promise.all([api.dispose(), authenticatedApi.dispose()])
  })

  test("does not expose scanner, payment, API-key, Telegram, admin, or B2B routes to anonymous requests", async ({ request }) => {
    const [scan, payment, apiKey, guardian, admin, b2b] = await Promise.all([
      request.post("/api/scamguard/scan-wallet", { data: { value: "4V1C76x5SpQhYpZ3EnfHWxyaFmQy6GzwR8NhBpaALsPR", chain: "solana" } }),
      request.post("/api/billing/verify-solana", { data: { plan: "builder", txHash: "not-a-real-payment" } }),
      request.post("/api/api-keys", { data: { name: "blocked-e2e-key" } }),
      request.post("/api/telegram/groups/connect"),
      request.get("/api/admin/telegram/groups"),
      request.post("/api/v1/scamguard/scan", { data: { type: "url", value: "https://example.com" } }),
    ])

    expect(scan.status()).toBe(401)
    await expect(scan.json()).resolves.toMatchObject({ code: "AUTH_REQUIRED", loginUrl: "/login?next=%2Fscamguard" })
    expect(payment.status()).toBe(401)
    expect(apiKey.status()).toBe(401)
    expect(guardian.status()).toBe(401)
    expect(admin.status()).toBe(403)
    expect(b2b.status()).toBe(401)
  })

  test("rejects malformed public scanner input without triggering a scan", async ({ request }) => {
    const response = await request.post("/api/scamguard/scan-url", { data: { value: "" } })
    expect(response.status()).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "value is required" })
  })

  test("uses chain-appropriate Mini Audit samples and blocks EVM addresses on Solana", async ({ page }) => {
    await registerWithBrowser(page, "/audit")
    await expect(page).toHaveURL(/\/audit$/)

    await page.getByTestId("mini-audit-chain").selectOption("Solana")
    const walletList = page.getByTestId("mini-audit-wallet-list")
    await expect(walletList).toHaveAttribute("placeholder", "Paste one Solana wallet address per line")
    await expect(walletList).toHaveValue(/^[1-9A-HJ-NP-Za-km-z]{32,44}(\r?\n|$)/)

    const evmAddress = "0x8f3c2a6b4e9d1f705c8a9b2d3e4f5061728394ab"
    await walletList.fill(evmAddress)
    await page.getByRole("button", { name: "Run engine audit" }).click()
    await expect(page.getByText("This wallet list contains EVM 0x addresses. Select an EVM chain or load the Solana sample before running the audit.", { exact: true })).toBeVisible()

    const emailReview = page.getByTestId("mini-audit-email-review")
    await expect(emailReview).not.toHaveAttribute("href", new RegExp(evmAddress))
    await page.getByTestId("mini-audit-include-details").check()
    await expect(emailReview).toHaveAttribute("href", new RegExp(evmAddress))
  })

  test("renders Campaign Integrity referral intelligence in the authenticated demo", async ({ page }) => {
    await registerWithBrowser(page, "/dashboard/demo")
    await expect(page).toHaveURL(/\/dashboard\/demo$/)

    await expect(page.getByText("Referral Abuse Intelligence", { exact: true })).toBeVisible()
    await expect(page.getByText("Integrity score", { exact: true })).toBeVisible()
    await expect(page.getByText("Priority referral cohorts", { exact: true })).toBeVisible()
    await expect(page.getByText("Referral evidence", { exact: true })).toBeVisible()
    await expect(page.getByText("Coordinated funding and referral cohort", { exact: true })).toHaveCount(2)
  })

  test("renders separate safety and risk scores for a critical ScamGuard result", async ({ page }) => {
    await registerWithBrowser(page, "/scamguard")
    await expect(page).toHaveURL(/\/scamguard$/)

    await page.route("**/api/scamguard/scan-url", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "X-ScamGuard-Plan": "Free",
          "X-ScamGuard-Daily-Limit": "3",
          "X-ScamGuard-Scans-Used": "1",
        },
        body: JSON.stringify({
          id: "e2e-critical-result",
          type: "url",
          score: 100,
          riskLevel: "CRITICAL",
          summary: "Critical risk detected.",
          confidence: "HIGH",
          explanation: "A corroborated test result.",
          signals: [{ code: "E2E_CRITICAL", severity: "critical", title: "Critical test signal", detail: "Test-only corroborated evidence." }],
          actions: ["Do not connect a wallet or sign a transaction."],
          metadata: {
            chain: "solana",
            rpcStatus: "skipped",
            decision: {
              primaryReason: "Critical test signal",
              userMessage: "Do not continue until the source is verified.",
            },
          },
        }),
      })
    })

    await page.getByRole("button", { name: "Run ScamGuard scan" }).click()
    await expect(page.getByTestId("scamguard-safety-score")).toHaveText("Safety score")
    await expect(page.getByTestId("scamguard-safety-score-value")).toHaveText("0")
    await expect(page.getByTestId("scamguard-risk-score")).toContainText("Risk score")
    await expect(page.getByTestId("scamguard-risk-score-value")).toHaveText("100/100")
  })
})
