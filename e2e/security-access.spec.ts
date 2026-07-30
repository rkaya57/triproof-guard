import { expect, request as playwrightRequest, test } from "@playwright/test"

test.describe("security access boundaries", () => {
  test("redirects anonymous visitors from ScamGuard to sign in", async ({ page }) => {
    await page.goto("/scamguard")
    await expect(page).toHaveURL(/\/login\?next=%2Fscamguard$/)
    await expect(page.getByText("Welcome back", { exact: true })).toBeVisible()
  })

  test("registers an account through the browser and the server issues a hardened session", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    await page.goto("/register?next=/")
    await page.getByLabel("Name").fill("Security Test User")
    await page.getByLabel("Email").fill(`security-${suffix}@example.test`)
    await page.getByLabel("Password").fill("A-safe-e2e-password-123")
    await page.getByRole("button", { name: "Create Account" }).click()
    await expect(page).toHaveURL(/\/$/)

    const api = await playwrightRequest.newContext({ baseURL: "http://127.0.0.1:3100" })
    const response = await api.post("/api/auth/register", {
      data: {
        name: "Session Security Test",
        email: `session-${suffix}@example.test`,
        password: "A-safe-e2e-password-123",
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
})
