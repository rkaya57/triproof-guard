# AI Sidecar Benchmark provider finding

The first live AI Sidecar Benchmark v1 run was structurally safe but provider-incomplete:

- wallet Gemini responses: 0/4
- structured response rate: 0%
- cluster response: fallback
- risk mutations: 0
- non-approved decision weakening: 0

The follow-up provider probe established two distinct causes:

- Gemini 3.6 Flash connectivity worked at HTTP level, but the benchmark used an incompatible structured-output field/value combination for the `generateContent` endpoint.
- The legacy general `GEMINI_MODEL=gemini-3.5-flash` path also encountered provider quota exhaustion and must not define the Evidence Analyst runtime model.

The corrective runtime uses Gemini 3.6 Flash by default and the `generateContent` structured output fields `responseMimeType` plus `responseJsonSchema`. This benchmark remains claim-ineligible.
