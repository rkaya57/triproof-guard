# Independent Holdout Validation v1 — Reviewer Bundle

This operational layer is intentionally deployed before the first holdout freeze.

## Frozen sampling contract

- Only analyses created at or after the active run's `candidateNotBefore` cutoff are eligible.
- Wallet-analysis rows must also be created at or after the cutoff.
- Representative selection uses the existing engine-independent stable-hash sampler.
- Sampling is fixed at 20 cases per project in the admin API; it cannot be tuned with a request parameter after freeze.
- At least the frozen minimum total case count and chain count must be available before the reviewer bundle can be sealed.

## Reviewer blindness

Reviewer A and Reviewer B receive byte-identical blind reviewer CSV content with separate filenames. The CSV contains review evidence but no engine decision, risk score, cluster ID, reason codes, or AI output.

## Private evidence seal

The server separately stores a private audit snapshot containing the exact selected/context case identities, frozen engine inputs, and already-produced engine outputs. It is never returned by the reviewer-bundle API. The reviewer CSV and private audit are linked by exact case IDs and SHA-256 fingerprints.

## Immutability

`HoldoutValidationArtifact` is server-only, RLS-enabled, and denies Data API access to `anon` and `authenticated`. A `(runId, kind)` artifact is immutable: an identical retry is idempotent, while a different payload for an already-frozen artifact kind is rejected.

## Methodology boundary

No holdout freeze is created by this feature. Reviewer import, conflict/adjudication, ground-truth sealing, and one-shot evaluation must be deployed before the first freeze is created.
