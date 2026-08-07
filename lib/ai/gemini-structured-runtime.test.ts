import assert from "node:assert/strict"
import test from "node:test"

import {
  GEMINI_EVIDENCE_DEFAULT_MODEL,
  configuredEvidenceModel,
  geminiStructuredGenerationConfig,
} from "./gemini-structured-runtime"

test("generateContent structured config uses responseMimeType plus responseJsonSchema", () => {
  const schema = {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
    additionalProperties: false,
  }
  const config = geminiStructuredGenerationConfig(schema, {
    maxOutputTokens: 512,
    thinkingLevel: "low",
  }) as Record<string, unknown>

  assert.equal(config.responseMimeType, "application/json")
  assert.deepEqual(config.responseJsonSchema, schema)
  assert.equal("responseFormat" in config, false)
  assert.equal(config.maxOutputTokens, 512)
  assert.deepEqual(config.thinkingConfig, { thinkingLevel: "low" })
})

test("evidence runtime defaults to Gemini 3.6 instead of inheriting the legacy general Gemini model", () => {
  const previousEvidence = process.env.GEMINI_EVIDENCE_MODEL
  const previousGeneral = process.env.GEMINI_MODEL
  try {
    delete process.env.GEMINI_EVIDENCE_MODEL
    process.env.GEMINI_MODEL = "gemini-3.5-flash"
    assert.equal(configuredEvidenceModel(), GEMINI_EVIDENCE_DEFAULT_MODEL)

    process.env.GEMINI_EVIDENCE_MODEL = "gemini-3.6-flash"
    assert.equal(configuredEvidenceModel(), "gemini-3.6-flash")
  } finally {
    if (previousEvidence === undefined) delete process.env.GEMINI_EVIDENCE_MODEL
    else process.env.GEMINI_EVIDENCE_MODEL = previousEvidence
    if (previousGeneral === undefined) delete process.env.GEMINI_MODEL
    else process.env.GEMINI_MODEL = previousGeneral
  }
})
