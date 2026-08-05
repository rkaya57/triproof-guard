import { authAppUrl } from "@/lib/auth/security"

export type AuthEmailKind = "verify-email" | "reset-password"

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export function isAuthEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.AUTH_EMAIL_FROM?.trim())
}

function emailCopy(kind: AuthEmailKind, name: string, actionUrl: string) {
  const safeName = escapeHtml(name || "there")
  const safeUrl = escapeHtml(actionUrl)
  if (kind === "verify-email") {
    return {
      subject: "Verify your Tri-Proof Protocol email",
      text: `Hello ${name || "there"}, verify your email to finish creating your Tri-Proof account: ${actionUrl}\n\nThis link expires in 30 minutes. If you did not create this account, you can ignore this message.`,
      html: `
        <div style="background:#07101f;color:#e7f3ff;font-family:Arial,sans-serif;padding:32px">
          <div style="max-width:560px;margin:auto;background:#0d182b;border:1px solid #203b5b;border-radius:18px;padding:32px">
            <p style="color:#55d6ff;font-size:12px;letter-spacing:.16em;text-transform:uppercase">Tri-Proof Protocol</p>
            <h1 style="font-size:28px;margin:12px 0">Verify your email</h1>
            <p style="color:#a9bdd2;line-height:1.65">Hello ${safeName}, confirm this address to secure your account and continue to onboarding.</p>
            <p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#3bc8ff;color:#04101a;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">Verify email</a></p>
            <p style="color:#7f96ad;font-size:13px;line-height:1.55">This link expires in 30 minutes. Tri-Proof will never ask for your password, seed phrase, or private key.</p>
          </div>
        </div>`,
    }
  }

  return {
    subject: "Reset your Tri-Proof Protocol password",
    text: `Hello ${name || "there"}, reset your Tri-Proof account password: ${actionUrl}\n\nThis link expires in 30 minutes. If you did not request it, ignore this message and your password will remain unchanged.`,
    html: `
      <div style="background:#07101f;color:#e7f3ff;font-family:Arial,sans-serif;padding:32px">
        <div style="max-width:560px;margin:auto;background:#0d182b;border:1px solid #203b5b;border-radius:18px;padding:32px">
          <p style="color:#55d6ff;font-size:12px;letter-spacing:.16em;text-transform:uppercase">Tri-Proof Protocol</p>
          <h1 style="font-size:28px;margin:12px 0">Reset your password</h1>
          <p style="color:#a9bdd2;line-height:1.65">Hello ${safeName}, use the secure link below to choose a new password.</p>
          <p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#3bc8ff;color:#04101a;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">Reset password</a></p>
          <p style="color:#7f96ad;font-size:13px;line-height:1.55">This link expires in 30 minutes. If you did not request it, no action is required.</p>
        </div>
      </div>`,
  }
}

async function resendRequest(payload: Record<string, unknown>) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.")

  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": String(payload.idempotencyKey ?? ""),
        },
        body: JSON.stringify(payload.body),
        signal: AbortSignal.timeout(10_000),
      })
      if (response.ok) return true
      const detail = await response.text().catch(() => "")
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`Email provider rejected the request (${response.status}): ${detail.slice(0, 300)}`)
      }
      lastError = new Error(`Email provider unavailable (${response.status}).`)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Email delivery failed.")
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt))
  }
  throw lastError ?? new Error("Email delivery failed.")
}

export async function sendAuthEmail(input: {
  kind: AuthEmailKind
  to: string
  name: string
  token: string
  redirectTo?: string
  idempotencyKey: string
}) {
  if (!isAuthEmailConfigured()) return { delivered: false as const, reason: "not_configured" as const }

  const baseUrl = authAppUrl()
  const route = input.kind === "verify-email" ? "/verify-email" : "/reset-password"
  const url = new URL(route, baseUrl)
  url.searchParams.set("token", input.token)
  if (input.redirectTo) url.searchParams.set("next", input.redirectTo)
  const copy = emailCopy(input.kind, input.name, url.toString())

  await resendRequest({
    idempotencyKey: input.idempotencyKey,
    body: {
      from: process.env.AUTH_EMAIL_FROM,
      to: [input.to],
      subject: copy.subject,
      text: copy.text,
      html: copy.html,
      reply_to: process.env.AUTH_EMAIL_REPLY_TO || "security@triproofprotocol.com",
    },
  })
  return { delivered: true as const }
}
