# Product readiness implementation — 2026-09-05

This first implementation batch follows the product review of main commit `59454bcc942b6fd6d3287746f46baa6ebb30136c`.

## Delivered

- Fixed twelve TypeScript errors in six existing test files by aligning fixtures and narrowing values to the existing contracts. No risk thresholds or engine decisions were changed.
- Replaced the public static report with twelve reproducible synthetic Solana examples processed by the existing risk engine. The homepage, public report, case study, CSV, PDF and JSON now share one frozen snapshot.
- Added interactive cases for linked wallets, limited history, missing evidence, protocol eligibility and an approved reward candidate. The demo works without signing in or contacting a chain provider.
- Separated missing evidence and account eligibility from malicious-risk scoring in the public presentation. Raw engine status and analysis remain available in JSON. The sample contains five approved, one review, one insufficient-data and five not-eligible decisions.
- Moved homepage social links into normal document flow and made the evidence demo the primary entry action.
- Added a readiness CI workflow with type checking, existing tests, targeted regression tests, snapshot drift detection and reference/adversarial benchmarks. Repository branch protection is not configured by this change.

## Validation

Local validation on Node 24 with generated Prisma client:

- `npm run typecheck`: passed; the twelve reported type errors are resolved.
- `npm test`: 484 tests passed.
- `npm run test:product-readiness`: 34 tests passed, including four public-demo regressions.
- ESLint over changed source and test files: passed.
- `npm run demo:check`: generated snapshot matches the committed fixture.
- `npm run benchmark:labeled`: passed, 15 reference cases across nine scenarios.
- `npm run benchmark:adversarial`: passed, 13 scenarios / 66 wallets.
- `npx next build`: passed. This calls Next directly; production migrations and provider smoke checks in the project's deployment script were not run locally.
- Desktop browser inspection: homepage and public report render; missing-data, protocol-account and limited-history selections show the expected decision semantics.
- Local HTTP CSV/PDF downloads succeeded. All three PDF pages were rendered and visually inspected.

This is synthetic workflow validation, not a customer accuracy result. Mobile-device testing, production provider integration and hosted CI execution are not claimed.

## Maintenance

Run `npm run demo:generate` after an intentional engine or fixture change, review the complete JSON diff and run `npm run demo:check`. The snapshot records engine/ruleset versions, a fixed observation date and an input SHA-256 hash. Never substitute customer observations into this public fixture.

The authenticated legacy dashboard demo and its existing `/api/demo` endpoints are separate from this public evidence report. They were not migrated in this batch.

## Remaining roadmap

1. Durable analysis recovery: review queue leases, retries and recovery frequency; verify interruption and retry behavior before deployment.
2. Shared rate limiting: replace process-local counters where appropriate, with failure and concurrency tests.
3. Customer validation: obtain consented campaign datasets and keep independent holdouts separate from tuning data; report uncertainty and coverage.
4. Team workflows: define workspace roles, decision approval and auditable operator actions.
5. Campaign value: add reward exposure and decision comparison once the input and policy contracts are agreed.
6. Product measurement: measure demo-to-pilot conversion and campaign completion without collecting unnecessary wallet data.

No production deployment, database migration or change to benchmark labels is included.
