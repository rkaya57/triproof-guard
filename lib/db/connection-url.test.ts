import assert from "node:assert/strict"
import test from "node:test"

import {
  databaseConnectionUrl,
  databaseConnectionUsesTls,
} from "./connection-url"

const hostedDatabaseUrl =
  "postgresql://postgres:secret@db.example.com:6543/postgres?sslmode=require&schema=public"
const loopbackDatabaseUrl =
  "postgresql://postgres:secret@localhost:5432/postgres?schema=public"

const mutableEnv = process.env as Record<string, string | undefined>

function setNodeEnv(value: string | undefined) {
  if (value === undefined) {
    delete mutableEnv.NODE_ENV
    return
  }
  mutableEnv.NODE_ENV = value
}

test("keeps database URLs unchanged outside production", () => {
  const previous = process.env.NODE_ENV
  setNodeEnv("test")

  try {
    assert.equal(databaseConnectionUrl(hostedDatabaseUrl), hostedDatabaseUrl)
  } finally {
    setNodeEnv(previous)
  }
})

test("keeps loopback database URLs TLS-free in production bundles", () => {
  const previous = process.env.NODE_ENV
  setNodeEnv("production")

  try {
    const normalized = databaseConnectionUrl(loopbackDatabaseUrl)
    assert.equal(normalized, loopbackDatabaseUrl)
    assert.equal(databaseConnectionUsesTls(normalized), false)
  } finally {
    setNodeEnv(previous)
  }
})

test("uses the hosted TLS policy for every production database client", () => {
  const previous = process.env.NODE_ENV
  setNodeEnv("production")

  try {
    const normalized = new URL(databaseConnectionUrl(hostedDatabaseUrl))
    assert.equal(normalized.searchParams.get("sslmode"), "no-verify")
    assert.equal(normalized.searchParams.get("schema"), "public")
    assert.equal(databaseConnectionUsesTls(normalized.toString()), true)
  } finally {
    setNodeEnv(previous)
  }
})
