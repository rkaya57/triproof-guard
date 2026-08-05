import assert from "node:assert/strict"
import test from "node:test"

import { parseOAuthProvider } from "./oauth"

test("only supported OAuth providers are accepted", () => {
  assert.equal(parseOAuthProvider("google"), "google")
  assert.equal(parseOAuthProvider("discord"), "discord")
  assert.equal(parseOAuthProvider("github"), null)
  assert.equal(parseOAuthProvider("GOOGLE"), null)
})
