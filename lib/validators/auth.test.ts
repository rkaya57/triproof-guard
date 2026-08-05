import assert from "node:assert/strict"
import test from "node:test"

import {
  onboardingSchema,
  registerSchema,
  resetPasswordSchema,
} from "./wallet"

test("registration requires confirmation and legal consent", () => {
  const invalid = registerSchema.safeParse({
    name: "Test User",
    email: "user@example.com",
    password: "StrongPassword2026",
    confirmPassword: "DifferentPassword2026",
    acceptTerms: false,
    acceptPrivacy: false,
  })
  assert.equal(invalid.success, false)

  const valid = registerSchema.safeParse({
    name: "Test User",
    email: "USER@EXAMPLE.COM",
    password: "StrongPassword2026",
    confirmPassword: "StrongPassword2026",
    acceptTerms: true,
    acceptPrivacy: true,
  })
  assert.equal(valid.success, true)
  if (valid.success) assert.equal(valid.data.email, "user@example.com")
})

test("password reset enforces the same password policy", () => {
  assert.equal(
    resetPasswordSchema.safeParse({
      token: "a".repeat(32),
      password: "weak",
      confirmPassword: "weak",
    }).success,
    false
  )
})

test("onboarding keeps project information optional", () => {
  assert.equal(
    onboardingSchema.safeParse({
      accountRole: "FOUNDER",
      primaryUseCase: "MULTIPLE",
      projectName: "",
      projectWebsite: "",
      xHandle: "",
      telegramHandle: "",
    }).success,
    true
  )
})

test("onboarding accepts only HTTP(S) sites and public handle formats", () => {
  assert.equal(
    onboardingSchema.safeParse({
      accountRole: "DEVELOPER",
      primaryUseCase: "API",
      projectName: "Tri-Proof",
      projectWebsite: "https://triproofprotocol.com",
      xHandle: "@TriProof_",
      telegramHandle: "TriproofScamGuardBot",
    }).success,
    true
  )

  assert.equal(
    onboardingSchema.safeParse({
      accountRole: "DEVELOPER",
      primaryUseCase: "API",
      projectName: "Unsafe",
      projectWebsite: "javascript:alert(1)",
      xHandle: "valid_handle",
      telegramHandle: "invalid handle with spaces",
    }).success,
    false
  )
})
