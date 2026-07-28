import assert from "node:assert/strict"
import test from "node:test"

import { loginPathFor, safePostAuthPath } from "@/lib/auth/redirects"

test("safePostAuthPath keeps approved internal destinations", () => {
  assert.equal(safePostAuthPath("/scamguard"), "/scamguard")
  assert.equal(safePostAuthPath("/audit?campaign=summer"), "/audit?campaign=summer")
})

test("safePostAuthPath rejects redirects outside product routes", () => {
  assert.equal(safePostAuthPath("https://attacker.example"), "/dashboard")
  assert.equal(safePostAuthPath("//attacker.example"), "/dashboard")
  assert.equal(safePostAuthPath("/api/scamguard/scan-url"), "/dashboard")
  assert.equal(safePostAuthPath("/login"), "/dashboard")
})

test("loginPathFor encodes an internal return destination", () => {
  assert.equal(loginPathFor("/audit?campaign=summer"), "/login?next=%2Faudit%3Fcampaign%3Dsummer")
})
