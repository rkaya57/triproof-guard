import assert from "node:assert/strict"
import test from "node:test"

import { databaseConnectionUrl } from "./connection-url"

const databaseUrl =
  "postgresql://postgres:secret@db.example.com:6543/postgres?sslmode=require&schema=public"

const mutableEnv = process.env as Record<string, string | undefined>

function setNodeEnv(value: string | undefined) {
  if (value === undefined) {
    delete mutableEnv.NODE_ENV
    return
  }
  mutableEnv.NODE_ENV = value
}

test("keeps local database URLs unchanged", () => {
  const previous = process.env.NODE_ENV
  setNodeEnv("test")

  try {
    assert.equal(databaseConnectionUrl(databaseUrl), databaseUrl)
  } finally {
    setNodeEnv(previous)
  }
})

test("uses the hosted TLS policy for every production database client", () => {
  const previous = process.env.NODE_ENV
  setNodeEnv("production")

  try {
    const normalized = new URL(databaseConnectionUrl(databaseUrl))
    assert.equal(normalized.searchParams.get("sslmode"), "no-verify")
    assert.equal(normalized.searchParams.get("schema"), "public")
  } finally {
    setNodeEnv(previous)
  }
})
