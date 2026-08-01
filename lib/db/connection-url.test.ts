import assert from "node:assert/strict"
import test from "node:test"

import { databaseConnectionUrl } from "./connection-url"

const databaseUrl =
  "postgresql://postgres:secret@db.example.com:6543/postgres?sslmode=require&schema=public"

test("keeps local database URLs unchanged", () => {
  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = "test"

  try {
    assert.equal(databaseConnectionUrl(databaseUrl), databaseUrl)
  } finally {
    process.env.NODE_ENV = previous
  }
})

test("uses the hosted TLS policy for every production database client", () => {
  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = "production"

  try {
    const normalized = new URL(databaseConnectionUrl(databaseUrl))
    assert.equal(normalized.searchParams.get("sslmode"), "no-verify")
    assert.equal(normalized.searchParams.get("schema"), "public")
  } finally {
    process.env.NODE_ENV = previous
  }
})
