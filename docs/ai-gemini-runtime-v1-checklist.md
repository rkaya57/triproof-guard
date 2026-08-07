# Gemini Runtime Verification Checklist

Before enabling the AI sidecar in normal analysis traffic:

1. Provider probe: Gemini 3.6 Flash basic = PASS.
2. Provider probe: Gemini 3.6 Flash structured = PASS.
3. AI Sidecar Benchmark: 4/4 Gemini wallet responses.
4. AI Sidecar Benchmark: cluster response = Gemini.
5. Structured response rate = 100%.
6. Risk mutations = 0.
7. Non-approved decision mutations = 0.
8. Clean approval false escalation = 0.
9. Review-assist controls are inspected for evidence-grounded behavior.
10. Audit ledger records model, hashes, schema/prompt versions and latency without raw wallet addresses.
11. Normal production AI feature flags remain disabled until benchmark review is complete.
12. Independent Holdout Validation begins only after the AI stack is frozen.
