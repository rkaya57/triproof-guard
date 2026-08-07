# Gemini Evidence Runtime v1

Tri-Proof's AI evidence sidecar uses Gemini only as a conservative decision-support layer. The deterministic risk engine remains authoritative.

## Runtime model

- Primary evidence model: `gemini-3.6-flash`
- The evidence runtime intentionally does not inherit the legacy general-purpose `GEMINI_MODEL` value.
- An explicit `GEMINI_EVIDENCE_MODEL` may override the evidence model.
- Cluster analysis may use `GEMINI_CLUSTER_MODEL`, then `GEMINI_EVIDENCE_MODEL`, then the 3.6 Flash default.

## Structured output contract

The `generateContent` runtime uses:

- `generationConfig.responseMimeType = "application/json"`
- `generationConfig.responseJsonSchema = <JSON Schema>`
- Gemini 3 thinking via `generationConfig.thinkingConfig.thinkingLevel`

The Interactions API `response_format` contract and the `generateContent` contract must not be mixed. The provider probe exists specifically to catch API-surface drift before the sidecar is enabled in normal analysis traffic.

## Safety boundary

- AI cannot approve or reject wallets.
- AI can only support `no_change`, `manual_review`, or `collect_more_evidence`.
- The one-way disagreement gate may only escalate an existing automatic approval to manual review.
- Deterministic risk score and risk level remain immutable.
- Provider/schema failure falls back to the deterministic decision.
- AI benchmark fixtures are claim-ineligible and cannot be used as real-world accuracy evidence.
